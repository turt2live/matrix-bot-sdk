import * as http from "http";
import * as net from "net";

import { fetchRequest } from "../src/fetchRequest";
import { RequestParams, RequestResponse } from "../src";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body: Buffer) => void;

let server: http.Server;
let baseUrl: string;
let handler: Handler;

function call(params: Partial<RequestParams>): Promise<{ response: RequestResponse, body: any }> {
    return new Promise((resolve, reject) => {
        fetchRequest({ uri: baseUrl + "/test", ...params }, (err, response, body) => {
            if (err) reject(err);
            else resolve({ response, body });
        });
    });
}

function callError(params: Partial<RequestParams>): Promise<any> {
    return call(params).then(
        () => { throw new Error("Expected the request to fail"); },
        (err) => err,
    );
}

// Responds after the whole request body has been read.
function respondWithBody(fn: Handler): Handler {
    return (req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", c => chunks.push(c));
        req.on("end", () => fn(req, res, Buffer.concat(chunks)));
    };
}

beforeEach(async () => {
    handler = (req, res) => res.end();
    server = http.createServer((req, res) => handler(req, res, null));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
});

afterEach(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
});

describe('fetchRequest', () => {
    describe('query string', () => {
        it('should encode arrays as repeated keys and stringify primitives', async () => {
            let url: string;
            handler = (req, res) => { url = req.url; res.end(); };
            await call({ qs: { a: ["1", "2"], b: true, c: 3, d: "x y" } });
            expect(url).toEqual("/test?a=1&a=2&b=true&c=3&d=x%20y");
        });

        it('should merge with a query string already in the URI', async () => {
            let url: string;
            handler = (req, res) => { url = req.url; res.end(); };
            await call({ uri: baseUrl + "/test?keep=1&override=old", qs: { override: "new" } });
            expect(url).toEqual("/test?keep=1&override=new");
        });

        it('should leave the URI alone without qs', async () => {
            let url: string;
            handler = (req, res) => { url = req.url; res.end(); };
            await call({ uri: baseUrl + "/test?keep=1", qs: null });
            expect(url).toEqual("/test?keep=1");
        });
    });

    describe('request body', () => {
        it('should send string bodies with the given headers and method', async () => {
            let seen: { method: string, contentType: string, body: string };
            handler = respondWithBody((req, res, body) => {
                seen = { method: req.method, contentType: req.headers["content-type"], body: body.toString() };
                res.end();
            });
            await call({ method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"a":1}' });
            expect(seen).toEqual({ method: "PUT", contentType: "application/json", body: '{"a":1}' });
        });

        it('should stream Buffer bodies with a Content-Length instead of chunked encoding', async () => {
            const payload = Buffer.alloc(300_000, 7);
            let seen: { contentLength: string, transferEncoding: string, body: Buffer };
            handler = respondWithBody((req, res, body) => {
                seen = {
                    contentLength: req.headers["content-length"],
                    transferEncoding: req.headers["transfer-encoding"],
                    body,
                };
                res.end();
            });
            await call({ method: "POST", body: payload });
            expect(seen.contentLength).toEqual(String(payload.length));
            expect(seen.transferEncoding).toBeUndefined();
            expect(seen.body.equals(payload)).toBe(true);
        });
    });

    describe('response', () => {
        it('should return the body as a string by default', async () => {
            handler = (req, res) => { res.setHeader("X-Test", "yes"); res.end("héllo"); };
            const { response, body } = await call({});
            expect(body).toEqual("héllo");
            expect(response.body).toEqual("héllo");
            expect(response.statusCode).toBe(200);
            expect(response.headers["x-test"]).toEqual("yes");
        });

        it('should return the body as a Buffer when encoding is null', async () => {
            const payload = Buffer.from([0, 1, 2, 255]);
            handler = (req, res) => res.end(payload);
            const { body } = await call({ encoding: null });
            expect(Buffer.isBuffer(body)).toBe(true);
            expect(body.equals(payload)).toBe(true);
        });

        it('should return non-2xx responses rather than failing', async () => {
            handler = (req, res) => { res.statusCode = 404; res.end('{"errcode":"M_NOT_FOUND"}'); };
            const { response } = await call({});
            expect(response.statusCode).toBe(404);
            expect(response.body).toEqual('{"errcode":"M_NOT_FOUND"}');
        });

        it('should follow redirects for GET only', async () => {
            handler = (req, res) => {
                if (req.url === "/test") {
                    res.writeHead(302, { Location: "/target" });
                    res.end();
                } else {
                    res.end("target");
                }
            };
            expect((await call({ method: "GET" })).body).toEqual("target");
            expect((await call({ method: "POST", body: "x" })).response.statusCode).toBe(302);
        });
    });

    describe('errors', () => {
        it('should pass on the Node error when the connection is refused', async () => {
            const port = (server.address() as net.AddressInfo).port;
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
            server = http.createServer(); // so afterEach has something to close
            server.listen(0, "127.0.0.1");

            const err = await callError({ uri: `http://127.0.0.1:${port}/test` });
            expect(err.code).toEqual("ECONNREFUSED");
            expect(err.syscall).toEqual("connect");
        });

        it('should fail with ESOCKETTIMEDOUT when the server never responds', async () => {
            handler = () => { /* never respond */ };
            const err = await callError({ timeout: 100 });
            expect(err.message).toEqual("ESOCKETTIMEDOUT");
            expect(err.code).toEqual("ESOCKETTIMEDOUT");
            expect(err.connect).toBe(false);
        });

        it('should fail with ESOCKETTIMEDOUT when the response body stalls', async () => {
            handler = (req, res) => { res.writeHead(200); res.write("partial"); };
            const err = await callError({ timeout: 100 });
            expect(err.code).toEqual("ESOCKETTIMEDOUT");
        });
    });

    describe('stall timeout', () => {
        it('should not time out a slow but steady download', async () => {
            handler = (req, res) => {
                res.writeHead(200);
                let sent = 0;
                const interval = setInterval(() => {
                    res.write("x");
                    if (++sent === 8) {
                        clearInterval(interval);
                        res.end();
                    }
                }, 50);
            };
            const start = Date.now();
            const { body } = await call({ timeout: 150 });
            expect(body).toEqual("xxxxxxxx");
            expect(Date.now() - start).toBeGreaterThan(300); // well past the timeout
        });

        it('should not time out a slow but steady upload', async () => {
            // A real socket can't throttle reliably: the kernel buffers tens of MB on loopback. Instead,
            // fetch is replaced by a fake that reads the request body one piece every 50 ms.
            const payload = Buffer.alloc(8 * 64 * 1024, 1);
            const realFetch = global.fetch;
            global.fetch = (async (url: string, init: RequestInit) => {
                const reader = (init.body as ReadableStream<Uint8Array>).getReader();
                let received = 0;
                for (;;) {
                    const { done, value } = await reader.read();
                    if (init.signal.aborted) throw init.signal.reason;
                    if (done) break;
                    received += value.length;
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                return new Response(String(received));
            }) as typeof fetch;
            try {
                const start = Date.now();
                const { body } = await call({ method: "POST", body: payload, timeout: 150 });
                expect(body).toEqual(String(payload.length));
                expect(Date.now() - start).toBeGreaterThan(300); // well past the timeout
            } finally {
                global.fetch = realFetch;
            }
        });

        it('should time out an upload that stops making progress', async () => {
            const realFetch = global.fetch;
            global.fetch = ((url: string, init: RequestInit) => new Promise((resolve, reject) => {
                // Never read the body; fail like fetch does once aborted.
                init.signal.addEventListener("abort", () => reject(init.signal.reason));
            })) as typeof fetch;
            try {
                const err = await callError({ method: "POST", body: Buffer.alloc(1024, 1), timeout: 100 });
                expect(err.code).toEqual("ESOCKETTIMEDOUT");
            } finally {
                global.fetch = realFetch;
            }
        });
    });
});

import * as querystring from "querystring";

/**
 * The subset of `request` options that the SDK uses.
 * @category Unit testing
 */
export interface RequestParams {
    uri: string;
    method?: string;
    /** Query parameters. Arrays are sent as repeated keys (`a=1&a=2`). */
    qs?: Record<string, any> | null;
    headers?: Record<string, string>;
    body?: string | Buffer | Uint8Array;
    /** Unset: the body is returned as a UTF-8 string. `null`: the body is returned as a Buffer. */
    encoding?: BufferEncoding | null;
    /** Milliseconds without progress (connecting, sending or receiving) before the request is aborted. */
    timeout?: number;
    [k: string]: any;
}

/**
 * The response object passed to a {@link RequestCallback}, modelled on `request`'s response.
 * @category Unit testing
 */
export interface RequestResponse {
    statusCode: number;
    statusMessage: string;
    /** Response headers with lowercase names. */
    headers: Record<string, string>;
    body: any;
}

/**
 * @category Unit testing
 */
export type RequestCallback = (err: any, response?: RequestResponse, body?: any) => void;

/**
 * A `request`-compatible function.
 * @category Unit testing
 */
export type RequestFn = (params: RequestParams, callback: RequestCallback) => void;

const UPLOAD_CHUNK_SIZE = 64 * 1024;

/**
 * A `request`-compatible function built on the native `fetch`. It replicates the parts of
 * `request` that the SDK relies on: query string encoding, string or Buffer bodies, the idle
 * ("stall") timeout, redirects for GET only, and `request`'s error shapes.
 * @param {RequestParams} params The request options.
 * @param {RequestCallback} callback Called once with an error, or with the response and its body.
 * @category Unit testing
 */
export function fetchRequest(params: RequestParams, callback: RequestCallback): void {
    doFetchRequest(params).then(
        (response) => callback(null, response, response.body),
        (err) => callback(err),
    );
}

async function doFetchRequest(params: RequestParams): Promise<RequestResponse> {
    const method = (params.method ?? "GET").toUpperCase();
    const timeout = params.timeout;

    // Replicates request's `timeout`: the request is aborted only when nothing has happened
    // for `timeout` ms. Every chunk sent or received restarts the timer.
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    let timedOut = false;
    const restartTimer = () => {
        if (!(timeout > 0)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeout);
    };

    const headers: Record<string, string> = { ...params.headers };
    let body: string | Uint8Array | ReadableStream<Uint8Array> | undefined;
    let duplex: "half" | undefined;
    if (params.body !== undefined && params.body !== null) {
        if (typeof params.body === "string" || params.body.length === 0) {
            body = params.body;
        } else {
            // Stream binary bodies so that upload progress restarts the timer.
            if (!Object.keys(headers).some(h => h.toLowerCase() === "content-length")) {
                headers["Content-Length"] = String(params.body.length);
            }
            body = uint8ArrayToStream(params.body, restartTimer);
            duplex = "half";
        }
    }

    try {
        restartTimer();
        const res = await fetch(buildUrl(params.uri, params.qs), {
            method,
            headers,
            body,
            duplex,
            signal: controller.signal,
            // request only follows redirects for GET requests by default.
            redirect: method === "GET" ? "follow" : "manual",
        } as RequestInit);
        restartTimer();

        const chunks: Uint8Array[] = [];
        if (res.body) {
            const reader = res.body.getReader();
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                restartTimer();
            }
        }
        const buffer = Buffer.concat(chunks);
        const resBody = params.encoding === null ? buffer : buffer.toString(params.encoding ?? "utf8");

        return {
            statusCode: res.status,
            statusMessage: res.statusText,
            headers: Object.fromEntries(res.headers),
            body: resBody,
        };
    } catch (err) {
        throw toRequestError(err, timedOut);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Appends `qs` to the URI the way request does with `useQuerystring: true`: parameters already in
 * the URI are kept unless `qs` overrides them, and arrays become repeated keys.
 */
function buildUrl(uri: string, qs: Record<string, any> | null | undefined): string {
    if (!qs) return uri;
    const [base, existing] = splitOnce(uri, "?");
    const merged = { ...(existing ? querystring.parse(existing) : {}), ...qs };
    const encoded = querystring.stringify(merged);
    return encoded ? `${base}?${encoded}` : uri;
}

function splitOnce(str: string, sep: string): [string, string | undefined] {
    const idx = str.indexOf(sep);
    return idx < 0 ? [str, undefined] : [str.substring(0, idx), str.substring(idx + 1)];
}

function uint8ArrayToStream(data: Uint8Array, onProgress: () => void): ReadableStream<Uint8Array> {
    let offset = 0;
    return new ReadableStream<Uint8Array>({
        pull(controller) {
            onProgress();
            if (offset >= data.length) {
                controller.close();
                return;
            }
            const end = Math.min(offset + UPLOAD_CHUNK_SIZE, data.length);
            controller.enqueue(data.subarray(offset, end));
            offset = end;
        },
    });
}

/**
 * Converts errors from `fetch` into the errors `request` produces, so that callers' error
 * handling keeps working.
 */
function toRequestError(err: any, timedOut: boolean): any {
    if (timedOut) {
        return makeTimeoutError("ESOCKETTIMEDOUT", false);
    }
    // fetch wraps network errors: `TypeError: fetch failed` with the Node error (ECONNREFUSED,
    // ENOTFOUND, ...) as its cause. request passed on the Node error itself.
    // Checked by name rather than instanceof, which fails for errors from another realm (e.g. Jest's VM).
    const cause = err?.name === "TypeError" ? err.cause : undefined;
    if (cause && typeof cause === "object") {
        if ((cause as any).code === "UND_ERR_CONNECT_TIMEOUT") {
            return makeTimeoutError("ETIMEDOUT", true);
        }
        return cause;
    }
    return err;
}

function makeTimeoutError(code: "ETIMEDOUT" | "ESOCKETTIMEDOUT", connect: boolean): Error {
    const e: Error & { code?: string, connect?: boolean } = new Error(code);
    e.code = code;
    e.connect = connect;
    return e;
}

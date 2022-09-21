import { LogLevel, LogService } from "./logging/LogService";
import { getRequestFn } from "./request";
import { MatrixError } from "./models/MatrixError";

let lastRequestId = 0;

/**
 * Performs a web request to a server.
 * @category Unit testing
 * @param {string} baseUrl The base URL to apply to the call.
 * @param {"GET"|"POST"|"PUT"|"DELETE"} method The HTTP method to use in the request
 * @param {string} endpoint The endpoint to call. For example: "/_matrix/client/v3/account/whoami"
 * @param {any} qs The query string to send. Optional.
 * @param {any} body The request body to send. Optional. Will be converted to JSON unless the type is a Buffer.
 * @param {any} headers Additional headers to send in the request.
 * @param {number} timeout The number of milliseconds to wait before timing out.
 * @param {boolean} raw If true, the raw response will be returned instead of the response body.
 * @param {string} contentType The content type to send. Only used if the `body` is a Buffer.
 * @param {string} noEncoding Set to true to disable encoding, and return a Buffer. Defaults to false
 * @returns {Promise<any>} Resolves to the response (body), rejected if a non-2xx status code was returned.
 */
export async function doHttpRequest(
    baseUrl: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    endpoint: string,
    qs = null,
    body = null,
    headers = {},
    timeout = 60000,
    raw = false,
    contentType = "application/json",
    noEncoding = false,
): Promise<any> {
    if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
    }

    const requestId = ++lastRequestId;
    const url = baseUrl + endpoint;

    // This is logged at info so that when a request fails people can figure out which one.
    LogService.debug("MatrixHttpClient", "(REQ-" + requestId + ")", method + " " + url);

    // Don't log the request unless we're in debug mode. It can be large.
    if (LogService.level.includes(LogLevel.TRACE)) {
        if (qs) LogService.trace("MatrixHttpClient", "(REQ-" + requestId + ")", "qs = " + JSON.stringify(qs));
        if (body && !Buffer.isBuffer(body)) LogService.trace("MatrixHttpClient", "(REQ-" + requestId + ")", "body = " + JSON.stringify(redactObjectForLogging(body)));
        if (body && Buffer.isBuffer(body)) LogService.trace("MatrixHttpClient", "(REQ-" + requestId + ")", "body = <Buffer>");
    }

    const params: { [k: string]: any } = {
        uri: url,
        method: method,
        qs: qs,
        // If this is undefined, then a string will be returned. If it's null, a Buffer will be returned.
        encoding: noEncoding === false ? undefined : null,
        useQuerystring: true,
        qsStringifyOptions: {
            options: { arrayFormat: 'repeat' },
        },
        timeout: timeout,
        headers: headers,
        // Enable KeepAlive for HTTP
        forever: true,
    };

    if (body) {
        if (Buffer.isBuffer(body)) {
            params.headers["Content-Type"] = contentType;
            params.body = body;
        } else {
            params.headers["Content-Type"] = "application/json";
            params.body = JSON.stringify(body);
        }
    }

    const { response, resBody } = await new Promise<{ response: any, resBody: any }>((resolve, reject) => {
        getRequestFn()(params, (err, res, rBody) => {
            if (err) {
                LogService.error("MatrixHttpClient", "(REQ-" + requestId + ")", err);
                reject(err);
                return;
            }

            if (typeof (rBody) === 'string') {
                try {
                    rBody = JSON.parse(rBody);
                } catch (e) {
                }
            }

            if (typeof (res.body) === 'string') {
                try {
                    res.body = JSON.parse(res.body);
                } catch (e) {
                }
            }

            resolve({ response: res, resBody: rBody });
        });
    });

    const respIsBuffer = (response.body instanceof Buffer);

    // Check for errors.
    const errBody = response.body || resBody;
    if (typeof (errBody) === "object" && 'errcode' in errBody) {
        const redactedBody = respIsBuffer ? '<Buffer>' : redactObjectForLogging(errBody);
        LogService.error("MatrixHttpClient", "(REQ-" + requestId + ")", redactedBody);
        throw new MatrixError(errBody, response.statusCode);
    }

    // Don't log the body unless we're in debug mode. They can be large.
    if (LogService.level.includes(LogLevel.TRACE)) {
        const redactedBody = respIsBuffer ? '<Buffer>' : redactObjectForLogging(response.body);
        LogService.trace("MatrixHttpClient", "(REQ-" + requestId + " RESP-H" + response.statusCode + ")", redactedBody);
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
        const redactedBody = respIsBuffer ? '<Buffer>' : redactObjectForLogging(response.body);
        LogService.error("MatrixHttpClient", "(REQ-" + requestId + ")", redactedBody);
        throw response;
    }
    return raw ? response : resBody;
}

export function redactObjectForLogging(input: any): any {
    if (!input) return input;

    const fieldsToRedact = [
        'access_token',
        'password',
        'new_password',
    ];

    const redactFn = (i) => {
        if (!i) return i;

        // Don't treat strings like arrays/objects
        if (typeof i === 'string') return i;

        if (Array.isArray(i)) {
            const rebuilt = [];
            for (const v of i) {
                rebuilt.push(redactFn(v));
            }
            return rebuilt;
        }

        if (i instanceof Object) {
            const rebuilt = {};
            for (const key of Object.keys(i)) {
                if (fieldsToRedact.includes(key)) {
                    rebuilt[key] = '<redacted>';
                } else {
                    rebuilt[key] = redactFn(i[key]);
                }
            }
            return rebuilt;
        }

        return i; // It's a primitive value
    };

    return redactFn(input);
}

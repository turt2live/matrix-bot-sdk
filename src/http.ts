import { LogLevel, LogService } from "./logging/LogService";
import { getRequestFn } from "./request";

let lastRequestId = 0;

export type DoHttpRequestOptions = {
    /**
     * The base URL to apply to the call.
     */
    baseUrl: string,
    /**
     * The HTTP method to use in the request
     */
    method: "GET" | "POST" | "PUT" | "DELETE",
    /**
     * The endpoint to call. For example: "/_matrix/client/r0/account/whoami"
     */
    endpoint: string,
    /**
     * The query string to send. Optional.
     */
    qs?: any,
    /**
     * The request body to send. Optional. Will be converted to JSON unless the type is a Buffer.
     */
    body?: any,
    /**
     * Additional headers to send in the request.
     */
    headers?: any,
    /**
     * The number of milliseconds to wait before timing out.
     */
    timeout?: number,
    /**
     * If true, the raw response will be returned instead of the response body.
     */
    raw?: boolean,
    /**
     * The content type to send. Only used if the `body` is a Buffer.
     */
    contentType?: string,

    /**
     * Set to true to disable encoding, and return a Buffer. Defaults to false
     */
    noEncoding?: boolean,

    /**
     * If false, this request should NOT be logged as an error in case of failure. Defaults to true.
     *
     * Used when a request is performed as a mechanism to detect users, rooms, ... and err results
     * are considered normal.
     */
    logErrors?: boolean
};

/**
 * Performs a web request to a server.
 * @category Unit testing
 * @param {string} baseUrl The base URL to apply to the call.
 * @param {"GET"|"POST"|"PUT"|"DELETE"} method The HTTP method to use in the request
 * @param {string} endpoint The endpoint to call. For example: "/_matrix/client/r0/account/whoami"
 * @param {any} qs The query string to send. Optional.
 * @param {any} body The request body to send. Optional. Will be converted to JSON unless the type is a Buffer.
 * @param {any} headers Additional headers to send in the request.
 * @param {number} timeout The number of milliseconds to wait before timing out.
 * @param {boolean} raw If true, the raw response will be returned instead of the response body.
 * @param {string} contentType The content type to send. Only used if the `body` is a Buffer.
 * @param {string} noEncoding Set to true to disable encoding, and return a Buffer. Defaults to false
 * @returns {Promise<any>} Resolves to the response (body), rejected if a non-2xx status code was returned.
 */
export function doHttpRequest(baseUrl: string, method: "GET" | "POST" | "PUT" | "DELETE", endpoint: string, qs = null, body = null, headers: any = {}, timeout = 60000, raw = false, contentType = "application/json", noEncoding = false): Promise<any> {
    return doHttpRequest2({
        baseUrl,
        method,
        endpoint,
        qs,
        body,
        headers,
        timeout,
        raw,
        contentType,
        noEncoding,
        // Backwards-compatible behavior.
        logErrors: true,
    });
}
export function doHttpRequest2(options: DoHttpRequestOptions) {
    // Decode args, apply default values.
    let { baseUrl, method, endpoint, qs, body, headers, timeout, raw, contentType, noEncoding, logErrors } = options;
    if (typeof headers === "undefined") {
        headers = {}
    }
    if (typeof timeout === "undefined") {
        timeout = 60000;
    }
    if (typeof raw === "undefined") {
        raw = false;
    }
    if (typeof contentType === "undefined") {
        contentType = "application/json";
    }
    if (typeof noEncoding === "undefined") {
        noEncoding = false;
    }
    if (typeof logErrors === "undefined") {
        logErrors = true;
    }

    if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
    }

    const requestId = ++lastRequestId;
    const url = baseUrl + endpoint;

    // This is logged at info so that when a request fails people can figure out which one.
    LogService.debug("MatrixHttpClient (REQ-" + requestId + ")", method + " " + url);

    // Don't log the request unless we're in debug mode. It can be large.
    if (LogService.level.includes(LogLevel.TRACE)) {
        if (qs) LogService.trace("MatrixHttpClient (REQ-" + requestId + ")", "qs = " + JSON.stringify(qs));
        if (body && !Buffer.isBuffer(body)) LogService.trace("MatrixHttpClient (REQ-" + requestId + ")", "body = " + JSON.stringify(redactObjectForLogging(body)));
        if (body && Buffer.isBuffer(body)) LogService.trace("MatrixHttpClient (REQ-" + requestId + ")", "body = <Buffer>");
    }

    const params: { [k: string]: any } = {
        uri: url,
        method: method,
        qs: qs,
        // If this is undefined, then a string will be returned. If it's null, a Buffer will be returned.
        encoding: noEncoding === false ? undefined : null,
        useQuerystring: true,
        qsStringifyOptions: {
            options: {arrayFormat: 'repeat'},
        },
        timeout: timeout,
        headers: headers,
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

    return new Promise((resolve, reject) => {
        getRequestFn()(params, (err, response, resBody) => {
            if (err) {
                if (logErrors) {
                    LogService.error("MatrixHttpClient (REQ-" + requestId + ")", err);
                }
                reject(err);
            } else {
                if (typeof (resBody) === 'string') {
                    try {
                        resBody = JSON.parse(resBody);
                    } catch (e) {
                    }
                }

                if (typeof (response.body) === 'string') {
                    try {
                        response.body = JSON.parse(response.body);
                    } catch (e) {
                    }
                }

                const respIsBuffer = (response.body instanceof Buffer);

                // Don't log the body unless we're in debug mode. They can be large.
                if (LogService.level.includes(LogLevel.TRACE)) {
                    const redactedBody = respIsBuffer ? '<Buffer>' : redactObjectForLogging(response.body);
                    LogService.trace("MatrixHttpClient (REQ-" + requestId + " RESP-H" + response.statusCode + ")", redactedBody);
                }
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    if (logErrors) {
                        const redactedBody = respIsBuffer ? '<Buffer>' : redactObjectForLogging(response.body);
                        LogService.error("MatrixHttpClient (REQ-" + requestId + ")", redactedBody);
                    }
                    reject(response);
                } else resolve(raw ? response : resBody);
            }
        });
    });
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

import * as origRequestFn from "request";

let requestFn = origRequestFn;

/**
 * Sets the function to use for performing HTTP requests. Must be compatible with `request`.
 * @param fn The new request function.
 * @category Unit testing
 */
export function setRequestFn(fn) {
    requestFn = fn;
}

/**
 * Gets the `request`-compatible function for performing HTTP requests.
 * @returns The request function.
 * @category Unit testing
 */
export function getRequestFn() {
    return requestFn;
}

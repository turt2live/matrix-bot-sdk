import * as origRequestFn from "request";

let requestFn = origRequestFn;

export function setRequestFn(fn) {
    requestFn = fn;
}

export function getRequestFn() {
    return requestFn;
}

import * as origRequestFn from "request";
import * as expect from "expect";
import { getRequestFn, setRequestFn } from "../src/request";

// @ts-ignore
describe('request', () => {
    // @ts-ignore
    it('should return whatever request function was set', () => {
        const testFn = (() => null);
        setRequestFn(testFn);
        expect(getRequestFn()).toBe(testFn);
    });
});

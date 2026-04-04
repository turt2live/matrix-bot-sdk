import { MatrixError } from "../../src";

describe("MatrixError", () => {
    it("should construct a basic MatrixError", () => {
        const err = new MatrixError({ 'errcode': 'M_TEST', "error": 'Test fail' }, 500, {});
        expect(err.message).toBe('M_TEST: Test fail');
        expect(err.retryAfterMs).toBeUndefined();
    });
    it("should handle a 429 without a retry duration", () => {
        const err = new MatrixError({ 'errcode': 'M_TEST', "error": 'Test fail' }, 429, {});
        expect(err.message).toBe('M_TEST: Test fail');
        expect(err.retryAfterMs).toBeUndefined();
    });
    it("should handle a 429 with a Retry-After header (time)", () => {
        // Should ignore the deprecated field.
        const err = new MatrixError({ 'errcode': 'M_TEST', "error": 'Test fail', "retry_after_ms": 5 }, 429, {
            'retry-after': '10',
        });
        expect(err.message).toBe('M_TEST: Test fail');
        expect(err.retryAfterMs).toEqual(10000);
    });
    it("should handle a 429 with a Retry-After header (date)", () => {
        jest
            .spyOn(global.Date, 'now')
            .mockImplementationOnce(() => new Date('Wed, 20 Mar 2024 10:18:16 UTC').valueOf());

        // Should ignore the deprecated field.
        const err = new MatrixError({ 'errcode': 'M_TEST', "error": 'Test fail', "retry_after_ms": 5 }, 429, {
            'retry-after': 'Wed, 20 Mar 2024 10:18:26 UTC',
        });
        expect(err.message).toBe('M_TEST: Test fail');
        expect(err.retryAfterMs).toEqual(10000);
    });
    it("should handle a 429 with a Retry-After header (date)", () => {
        const err = new MatrixError({ 'errcode': 'M_TEST', "error": 'Test fail', "retry_after_ms": 5 }, 429, {});
        expect(err.message).toBe('M_TEST: Test fail');
        expect(err.retryAfterMs).toEqual(5);
    });
});

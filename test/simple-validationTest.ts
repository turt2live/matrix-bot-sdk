import * as expect from "expect";
import { validateSpaceOrderString } from "../src";

describe('validateSpaceOrderString', () => {
    it('should return true with valid identifiers', () => {
        expect(validateSpaceOrderString("hello")).toBe(true);
        expect(validateSpaceOrderString("h")).toBe(true);
        expect(validateSpaceOrderString("12345678901234567890123456789012345678901234567890")).toBe(true);
        expect(validateSpaceOrderString("TEst")).toBe(true);
        expect(validateSpaceOrderString("org.example.order_1")).toBe(true);
        expect(validateSpaceOrderString("org.example.order-beta")).toBe(true);
    });

    it('should throw for undefined/null identifiers', () => {
        try {
            validateSpaceOrderString(null);
            validateSpaceOrderString(undefined);

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Failed to fail");
        } catch (e) {
            expect(e.message).toBe("order is not a string");
        }
    });

    it('should throw for not-string identifiers', () => {
        try {
            validateSpaceOrderString(<any>{});
            validateSpaceOrderString(<any>true);
            validateSpaceOrderString(<any>false);
            validateSpaceOrderString(<any>[]);

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Failed to fail");
        } catch (e) {
            expect(e.message).toBe("order is not a string");
        }
    });

    it('should throw for too short of identifiers', () => {
        try {
            validateSpaceOrderString("");

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Failed to fail");
        } catch (e) {
            expect(e.message).toBe("order cannot be empty");
        }
    });

    it('should throw for too long of identifiers', () => {
        try {
            validateSpaceOrderString("12345678901234567890123456789012345678901234567890-");

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Failed to fail");
        } catch (e) {
            expect(e.message).toBe("order is more than 50 characters and is disallowed");
        }
    });

    it('should throw for improper identifiers', () => {
        try {
            validateSpaceOrderString("test😀");
            validateSpaceOrderString("test\x07");
            validateSpaceOrderString("test\x7F");

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Failed to fail");
        } catch (e) {
            expect(e.message).toBe("order contained characters outside the range of the spec.");
        }
    });
});

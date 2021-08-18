import * as expect from "expect";
import {
    decodeBase64,
    decodeUnpaddedBase64,
    decodeUnpaddedUrlSafeBase64,
    encodeBase64,
    encodeUnpaddedBase64,
    encodeUnpaddedUrlSafeBase64,
} from "../src";

function sb(s: string): ArrayBuffer {
    return Buffer.from(s);
}

describe('b64', () => {
    it('should be symmetrical', () => {
        expect(decodeBase64(encodeBase64(sb("test"))).toString()).toBe("test");
        expect(decodeUnpaddedBase64(encodeUnpaddedBase64(sb("test"))).toString()).toBe("test");
        expect(decodeUnpaddedBase64(encodeBase64(sb("test"))).toString()).toBe("test");
        expect(decodeBase64(encodeUnpaddedBase64(sb("test"))).toString()).toBe("test");
        expect(decodeUnpaddedUrlSafeBase64(encodeUnpaddedUrlSafeBase64(sb("test"))).toString()).toBe("test");
    });

    it('should encode', () => {
        expect(encodeBase64(sb("test"))).toBe("dGVzdA==");
        expect(encodeUnpaddedBase64(sb("test"))).toBe("dGVzdA");
        expect(encodeUnpaddedUrlSafeBase64(Buffer.from([901231, 123123]))).toBe("b_M");
    });

    it('should decode', () => {
        expect(decodeBase64("dGVzdA==").toString()).toBe("test");
        expect(decodeUnpaddedBase64("dGVzdA").toString()).toBe("test");
        expect(decodeUnpaddedUrlSafeBase64("b_M").join('')).toBe("111243");
    });
});

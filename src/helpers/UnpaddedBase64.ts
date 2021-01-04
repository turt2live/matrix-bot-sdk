/**
 * Unpadded Base64 utilities for Matrix.
 * @category Utilities
 */
export class UnpaddedBase64 {
    private constructor() {
    }

    /**
     * Encodes a buffer to Unpadded Base64
     * @param {Buffer} buf The buffer to encode.
     * @returns {string} The Unpadded Base64 string
     */
    public static encodeBuffer(buf: Buffer): string {
        return buf.toString('base64').replace(/[=]*$/g, '');
    }

    /**
     * Encodes a string to Unpadded Base64
     * @param {string} str The string to encode.
     * @returns {string} The Unpadded Base64 string
     */
    public static encodeString(str: string): string {
        return UnpaddedBase64.encodeBuffer(new Buffer(str));
    }

    /**
     * Encodes a buffer to Unpadded Base64 (URL Safe Edition)
     * @param {Buffer} buf The buffer to encode.
     * @returns {string} The Unpadded Base64 string
     */
    public static encodeBufferUrlSafe(buf: Buffer): string {
        return UnpaddedBase64.encodeBuffer(buf).replace(/\+/g, '-').replace(/\//g, '_');
    }

    /**
     * Encodes a string to Unpadded Base64 (URL Safe Edition)
     * @param {string} str The string to encode.
     * @returns {string} The Unpadded Base64 string
     */
    public static encodeStringUrlSafe(str: string): string {
        return UnpaddedBase64.encodeBufferUrlSafe(new Buffer(str));
    }
}

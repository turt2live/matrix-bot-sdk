/**
 * Encodes Base64.
 * @category Utilities
 * @param {ArrayBuffer | Uint8Array} b The buffer to encode.
 * @returns {string} The Base64 string.
 */
export function encodeBase64(b: ArrayBuffer | Uint8Array): string {
    return Buffer.from(b).toString('base64');
}

/**
 * Encodes Unpadded Base64.
 * @category Utilities
 * @param {ArrayBuffer | Uint8Array} b The buffer to encode.
 * @returns {string} The Base64 string.
 */
export function encodeUnpaddedBase64(b: ArrayBuffer | Uint8Array): string {
    return encodeBase64(b).replace(/=+/g, '');
}

/**
 * Encodes URL-Safe Unpadded Base64.
 * @category Utilities
 * @param {ArrayBuffer | Uint8Array} b The buffer to encode.
 * @returns {string} The Base64 string.
 */
export function encodeUnpaddedUrlSafeBase64(b: ArrayBuffer | Uint8Array): string {
    return encodeUnpaddedBase64(b).replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Decodes Base64.
 * @category Utilities
 * @param {string} s The Base64 string.
 * @returns {Uint8Array} The encoded data as a buffer.
 */
export function decodeBase64(s: string): Uint8Array {
    return Buffer.from(s, 'base64');
}

/**
 * Decodes Unpadded Base64.
 * @category Utilities
 * @param {string} s The Base64 string.
 * @returns {Uint8Array} The encoded data as a buffer.
 */
export function decodeUnpaddedBase64(s: string): Uint8Array {
    return decodeBase64(s); // yay, it's the same
}

/**
 * Decodes URL-Safe Unpadded Base64.
 * @category Utilities
 * @param {string} s The Base64 string.
 * @returns {Uint8Array} The encoded data as a buffer.
 */
export function decodeUnpaddedUrlSafeBase64(s: string): Uint8Array {
    return decodeUnpaddedBase64(s.replace(/-/g, '+').replace(/_/g, '/'));
}

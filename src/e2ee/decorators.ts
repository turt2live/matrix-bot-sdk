import { MatrixClient } from "../MatrixClient";
import { CryptoClient } from "./CryptoClient";

/**
 * Flags a MatrixClient function as needing end-to-end encryption enabled.
 * @category Encryption
 */
export function requiresCrypto() {
    return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = function(...args: any[]) {
            const client: MatrixClient = this; // eslint-disable-line @typescript-eslint/no-this-alias
            if (!client.crypto) {
                throw new Error("End-to-end encryption is not enabled");
            }

            return originalMethod.apply(this, args);
        };
    };
}

/**
 * Flags a CryptoClient function as needing the CryptoClient to be ready.
 * @category Encryption
 */
export function requiresReady() {
    return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = function(...args: any[]) {
            const crypto: CryptoClient = this; // eslint-disable-line @typescript-eslint/no-this-alias
            if (!crypto.isReady) {
                throw new Error("End-to-end encryption has not initialized");
            }

            return originalMethod.apply(this, args);
        };
    };
}

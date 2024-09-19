import * as tmp from "tmp";
import HttpBackend from "matrix-mock-request";
import { StoreType } from "@matrix-org/matrix-sdk-crypto-nodejs";

import { IStorageProvider, MatrixClient, OTKAlgorithm, RustSdkCryptoStorageProvider, ServerVersions, UnpaddedBase64, setRequestFn } from "../src";

export const TEST_DEVICE_ID = "TEST_DEVICE";

export function expectArrayEquals(expected: any[], actual: any[]) {
    expect(expected).toBeDefined();
    expect(actual).toBeDefined();
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < actual.length; i++) {
        expect(actual[i]).toEqual(expected[i]);
    }
}

export type Constructor<T> = { new(...args: any[]): T };

export function expectInstanceOf<T>(expected: Constructor<T>, actual: any): boolean {
    return actual instanceof expected;
}

export function testDelay(ms: number): Promise<any> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

export function createTestClient(
    storage: IStorageProvider = null,
    userId: string = null,
    cryptoStoreType?: StoreType,
    opts?: Partial<{ handleWhoAmI: boolean, precacheVersions: boolean }>,
): {
    client: MatrixClient;
    http: HttpBackend;
    hsUrl: string;
    accessToken: string;
} {
    opts = {
        handleWhoAmI: true,
        precacheVersions: true,
        ...opts,
    };
    const http = new HttpBackend();
    const hsUrl = "https://localhost";
    const accessToken = "s3cret";
    const client = new MatrixClient(hsUrl, accessToken, storage, (cryptoStoreType !== undefined) ? new RustSdkCryptoStorageProvider(tmp.dirSync().name, cryptoStoreType) : null);
    (<any>client).userId = userId; // private member access
    setRequestFn(http.requestFn);

    // Force versions
    if (opts.precacheVersions) {
        (<any>client).cachedVersions = {
            unstable_features: { },
            versions: ["v1.11"],
        } as ServerVersions;
        (<any>client).versionsLastFetched = Date.now();
    }

    if (opts.handleWhoAmI) {
        // Ensure we always respond to a whoami
        client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
    }

    return { http, hsUrl, accessToken, client };
}

const CRYPTO_STORE_TYPES: StoreType[] = [StoreType.Sqlite];

export async function testCryptoStores(fn: (StoreType) => Promise<void>): Promise<void> {
    for (const st of CRYPTO_STORE_TYPES) {
        await fn(st);
    }
}

export function bindNullEngine(http: HttpBackend) {
    http.when("POST", "/_matrix/client/v3/keys/upload").respond(200, (path, obj) => {
        expect(obj).toMatchObject({

        });
        return {
            one_time_key_counts: {
                // Enough to trick the OlmMachine into thinking it has enough keys
                [OTKAlgorithm.Signed]: 1000,
            },
        };
    });
    // Some oddity with the rust-sdk bindings during setup
    bindNullQuery(http);
}

export function bindNullQuery(http: HttpBackend) {
    http.when("POST", "/_matrix/client/v3/keys/query").respond(200, (path, obj) => {
        return {};
    });
}

/**
 * Generate a string that can be used as a curve25519 public key.
 * @returns A 32-byte string comprised of Unpadded Base64 characters.
 */
export function generateCurve25519PublicKey() {
    return UnpaddedBase64.encodeString(generateAZString(32));
}

/**
 * Generate an arbitrary string with characters in the range A-Z.
 * @param length The length of the string to generate.
 * @returns The generated string.
 */
function generateAZString(length: number) {
    return String.fromCharCode(...Array.from({ length }, () => Math.floor(65 + Math.random()*25)));
}

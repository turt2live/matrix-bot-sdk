import * as tmp from "tmp";
import HttpBackend from "matrix-mock-request";
import { StoreType } from "@matrix-org/matrix-sdk-crypto-nodejs";

import { IStorageProvider, MatrixClient, RustSdkCryptoStorageProvider, setRequestFn } from "../src";

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
): {
    client: MatrixClient;
    http: HttpBackend;
    hsUrl: string;
    accessToken: string;
} {
    const http = new HttpBackend();
    const hsUrl = "https://localhost";
    const accessToken = "s3cret";
    const client = new MatrixClient(hsUrl, accessToken, storage, cryptoStoreType !== undefined ? new RustSdkCryptoStorageProvider(tmp.dirSync().name, cryptoStoreType) : null);
    (<any>client).userId = userId; // private member access
    setRequestFn(http.requestFn);

    return { http, hsUrl, accessToken, client };
}

const CRYPTO_STORE_TYPES = [StoreType.Sled, StoreType.Sqlite];

export async function testCryptoStores(fn: (StoreType) => Promise<void>): Promise<void> {
    for (const st of CRYPTO_STORE_TYPES) {
        await fn(st);
    }
}

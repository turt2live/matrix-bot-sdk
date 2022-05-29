import { IStorageProvider, MatrixClient, RustSdkCryptoStorageProvider, setRequestFn } from "../src";
import * as MockHttpBackend from 'matrix-mock-request';
import * as tmp from "tmp";

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

export function createTestClient(storage: IStorageProvider = null, userId: string = null, crypto = false): { client: MatrixClient, http: MockHttpBackend, hsUrl: string, accessToken: string } {
    const http = new MockHttpBackend();
    const hsUrl = "https://localhost";
    const accessToken = "s3cret";
    const client = new MatrixClient(hsUrl, accessToken, storage, crypto ? new RustSdkCryptoStorageProvider(tmp.dirSync().name) : null);
    (<any>client).userId = userId; // private member access
    setRequestFn(http.requestFn);

    return { http, hsUrl, accessToken, client };
}

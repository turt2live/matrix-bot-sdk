import * as expect from "expect";
import {
    C25519_STORAGE_KEY,
    E25519_STORAGE_KEY,
    MatrixClient,
    OLM_ACCOUNT_STORAGE_KEY,
    PICKLE_STORAGE_KEY
} from "../src";
import * as crypto from "crypto";

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

let olmInstance;
export async function prepareOlm(): Promise<any> {
    if (olmInstance) return olmInstance;
    olmInstance = require("@matrix-org/olm");
    await olmInstance.init({});
    return olmInstance;
}

export async function feedOlmAccount(client: MatrixClient) {
    const pickleKey = crypto.randomBytes(64).toString('hex');
    const account = new (await prepareOlm()).Account();
    try {
        const pickled = account.pickle(pickleKey);
        const keys = JSON.parse(account.identity_keys());

        await Promise.resolve(client.storageProvider.storeValue(OLM_ACCOUNT_STORAGE_KEY, pickled));
        await Promise.resolve(client.storageProvider.storeValue(PICKLE_STORAGE_KEY, pickleKey));
        await Promise.resolve(client.storageProvider.storeValue(E25519_STORAGE_KEY, keys['ed25519']));
        await Promise.resolve(client.storageProvider.storeValue(C25519_STORAGE_KEY, keys['curve25519']));
    } finally {
        account.free();
    }
}

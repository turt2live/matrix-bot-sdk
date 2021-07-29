import * as expect from "expect";
import {
    MatrixClient,
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

        await client.cryptoStore.setPickledAccount(pickled);
        await client.cryptoStore.setPickleKey(pickleKey);
    } finally {
        account.free();
    }
}

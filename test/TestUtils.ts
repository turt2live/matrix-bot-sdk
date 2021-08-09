import * as expect from "expect";
import { EncryptionAlgorithm, IOlmSession, IOutboundGroupSession, MatrixClient, UserDevice, } from "../src";
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
        account.create();
        const pickled = account.pickle(pickleKey);

        await client.cryptoStore.setPickledAccount(pickled);
        await client.cryptoStore.setPickleKey(pickleKey);
    } finally {
        account.free();
    }
}

const STATIC_PICKLED_ACCOUNT = "TevMpI7cI4ijCFuRQJOpH4f6VunsywE7PXmKigI5x/Vwnes+hSUEHs3aoMsfptbAEOulbGF5o+m5jRdjKl5mhw0VixOgHTkcJTXtXXldyBYjOWey6YCMcV/Dph5OgBCP3uLyrCT/JSuKhiuxohiqKHENZgeTSQ1/rtZkgR20UOpKdAqPkEjuI4YeLQbV1yDw1Po+JLVz9aRKeZX05rL6kPuIhu+nST++OV06hdAKzr7IDGw0K/xU+2VZIi7y4jct3tjE/QXfr1j7J3ja16xaDA1QLx+/5czZsqPFkJ5kxVetTtlHQ2PdnA9CEKlQugKA02mfD++qG0EZMMT0XqqWJQcBT1zRuQSuE08CHbDFcyq/F/6OQot9wgs9xLCkti7L+vHNHbJQVv+sboM7d2hX0sm5UJUdtnTETZDo1CldhedfDlvPQdC6IQ";
export const STATIC_PICKLE_KEY = "do not use in production";
export async function feedStaticOlmAccount(client: MatrixClient) {
    await client.cryptoStore.setPickledAccount(STATIC_PICKLED_ACCOUNT);
    await client.cryptoStore.setPickleKey(STATIC_PICKLE_KEY);
}

const OLM_ACCOUNT_RECEIVER_INIT = "6sF6fXEVU52nQxDuXkIX2NWIjff0PDMjhANo5ct7pv60R8A9ntaJbIGlc2YnFGDzLThQKS6sM7cW29jMjXdiYAFJsiU/IwBiUlFW1/eG0pRnbyvnRHI91GkO1MxBgmkNxrHVKwI3ITw9VyE4pXMDrptm+rH0nil+28Z7/PM43qD1LRsNZ6P2FqmdlVvLi+oiNepcAJUA+88ZOombVAXKatBdzTpR+H4ygjpn9Co+atIlxZeNyhngaI47xBtwn69wQfk9Y+3OyKAW9ZTvmbWoPk+Xy57yfhFqgYCcyEeias8GMJlZvK6EDMJFNaAbFvn30QBw6PU9KYMJ1ubTnLOpdw1mzD1T170mXcg4IvRAXStMtHs+5K0qP74C6Lz1FLbZTWVt1SLEGc/k/2fevnHbAchiJA4EdgJsdOgNy5So8yh/OHo8Lh2tLA";

export const RECEIVER_DEVICE: UserDevice = {
    user_id: "@receiver:example.org",
    device_id: "A",
    unsigned: {
        device_display_name: "Test Device",
    },
    keys: {
        "curve25519:A": "30KcbZc4ZmLxnLu3MraQ9vIrAjwtjR8uYmwCU/sViDE",
        "ed25519:A": "2rSewpuevZRemFhBB/0pa6bU66RwhP8l8bQnUP6j204",
    },
    algorithms: [EncryptionAlgorithm.MegolmV1AesSha2, EncryptionAlgorithm.OlmV1Curve25519AesSha2],
    signatures: {
        "@receiver:example.org": {
            "ed25519:A": "+xcZ+TKWhtV6JFy1RB532+BHMSQC7g9MC0Ane7X/OP2sH0ioJFWGcbKt0iBZOIluD7+EgadW7YAyY/33wCbvCg",
        },
    },
};

export const RECEIVER_OLM_SESSION: IOlmSession = {
    sessionId: "KmlD4H4gK+NukCgsha1mIpjbSd63dH0ZEgTrFFVYHj0",
    pickled: "qHo1lPr3YRQLUwvPgTYnYUmLEMAXB/Xh/iBv3on2xvMjn2brZVb42hfkqPRyUW1KMUVRwwzBY+lp1vNx8JTx7EBCLP8/MziQzF+UtDErSNqdVi4TsY6o5vAA+A5BpBKhKiCo3zHO5FXqb36auf1d0Ynj1HTKldMsa2WBCsM6+R1KrY0WAWLi1i7QtlF9lYpk4ZzxhTY9MNMwQ9+h+1+FYxfUSAzQCAbX0WQpI04mq+c6N3bQdrdFVkGndI9c8oegAJDeomBwQI5c2sGFeU4yBLDIL1Cto6K5mO1dM9JW4b8tMJfoE5/lr7Iar+WuCy/AquOwigO1aDn3JsBrtSFyOKbX2nGxkvOh",
    lastDecryptionTs: Date.now(),
};

export const STATIC_OUTBOUND_SESSION: IOutboundGroupSession = {
    sessionId: "5IvzkqqphReuELs8KzYSVmqaWUqrLIJ6d4JFVj8qyBY",
    pickled: "gsO94I8oWrkm/zJefnr1/08CMX7qZnOBoPGM7b/ZshjN7UM/Y9y6zRNNY3hGHw+7uP7oYxF1EH60YXa/ClMX0mCEtupqkQlGBKcp78CQj18WURtoATXnV2lEPElx/y1tQfQ1hqRYjd0UXzZtnwGjM78D5vVEoxfpCJ5Gm9kk3aEwOg6EYqirvpciaLCNopnbgh3ngqfmabZJpaafFWRYUkqw4WuzvNVGnzTOmbHq4uWVeZzUTvIC/6AGEq1eLQOEbIoP4GaJDDn+XC+V1HKQ6jmMWuy3439xEfh/FUSI1iHu8oCBcxneSAcmwKUztLkeI3MGu9+1hCA",
    roomId: "!test:example.org",
    isCurrent: true,
    usesLeft: 100,
    expiresTs: Date.now() + 3600000,
};

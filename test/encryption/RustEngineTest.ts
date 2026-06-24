import HttpBackend from 'matrix-mock-request';

import { OTKAlgorithm } from "../../src";
import { extractUIA, hasFailedUIA } from "../../src/e2ee/RustEngine";
import { createTestClient, testCryptoStores, TEST_DEVICE_ID } from "../TestUtils";
import { bindNullEngine } from "./CryptoClientTest";

// --------------------------------------------------------------------------
// extractUIA / hasFailedUIA
// --------------------------------------------------------------------------

describe('extractUIA', () => {
    it('returns null for non-object errors', () => {
        expect(extractUIA(null)).toBeNull();
        expect(extractUIA("string error")).toBeNull();
        expect(extractUIA(42)).toBeNull();
    });

    it('returns null when statusCode is not 401', () => {
        expect(extractUIA({ statusCode: 403, body: { flows: [{ stages: [] }] } })).toBeNull();
        expect(extractUIA({ statusCode: 500, body: { flows: [{ stages: [] }] } })).toBeNull();
    });

    it('returns null when body has no flows array', () => {
        expect(extractUIA({ statusCode: 401, body: {} })).toBeNull();
        expect(extractUIA({ statusCode: 401, body: { flows: "not-an-array" } })).toBeNull();
    });

    it('extracts UIA from a 401 with flows', () => {
        const err = {
            statusCode: 401,
            body: {
                flows: [{ stages: ['m.login.password'] }],
                params: {},
                session: 'abc123',
            },
        };
        const result = extractUIA(err);
        expect(result).not.toBeNull();
        expect(result!.flows).toEqual([{ stages: ['m.login.password'] }]);
        expect(result!.session).toEqual('abc123');
    });

    it('accepts objects with flows directly on the thrown value (no statusCode)', () => {
        const err = {
            flows: [{ stages: ['m.login.password'] }],
            session: 'xyz',
        };
        const result = extractUIA(err);
        expect(result).not.toBeNull();
        expect(result!.session).toEqual('xyz');
    });
});

describe('hasFailedUIA', () => {
    it('returns false for non-objects', () => {
        expect(hasFailedUIA(null)).toBe(false);
        expect(hasFailedUIA("error")).toBe(false);
    });

    it('returns false when body has no errcode', () => {
        expect(hasFailedUIA({ body: { flows: [] } })).toBe(false);
        expect(hasFailedUIA({ statusCode: 401 })).toBe(false);
    });

    it('returns true when body has an errcode', () => {
        expect(hasFailedUIA({ body: { errcode: 'M_FORBIDDEN', error: 'Invalid password' } })).toBe(true);
    });

    it('returns true when errcode is on the top-level object', () => {
        expect(hasFailedUIA({ errcode: 'M_FORBIDDEN' })).toBe(true);
    });
});

// --------------------------------------------------------------------------
// bootstrapCrossSigning — endpoint routing
// --------------------------------------------------------------------------

describe('RustEngine.bootstrapCrossSigning', () => {
    it('uploads device-signing keys and self-signature against correct endpoints', () => testCryptoStores(async (cryptoStoreType) => {
        const userId = "@alice:example.org";
        const { client, http } = createTestClient(null, userId, cryptoStoreType);

        client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });

        bindNullEngine(http);
        await Promise.all([
            client.crypto.prepare([]),
            http.flushAllExpected(),
        ]);

        const signingKeysBody: Record<string, unknown> = {};
        const signaturesBody: Record<string, unknown> = {};
        let uiaCalled = false;

        // UIA: first POST returns 401, second (with auth) succeeds.
        let deviceSigningCallCount = 0;
        http.when("POST", "/keys/device_signing/upload").respond((path, body) => {
            deviceSigningCallCount++;
            if (deviceSigningCallCount === 1) {
                // Capture the keys body and return a UIA challenge.
                Object.assign(signingKeysBody, body);
                return [401, { flows: [{ stages: ['m.login.password'] }], session: 'sess1' }];
            }
            // Second attempt with auth.
            expect(body).toMatchObject({ auth: { type: 'm.login.password', session: 'sess1' } });
            return [200, {}];
        });

        http.when("POST", "/keys/signatures/upload").respond((path, body) => {
            Object.assign(signaturesBody, body);
            return [200, {}];
        });

        // Optionally, keys/upload may fire if OlmMachine decides device keys need re-uploading.
        http.when("POST", "/keys/upload").respond(200, () => ({
            one_time_key_counts: { [OTKAlgorithm.Signed]: 1000 },
        }));

        const uiaCallback = async (uia: { flows: { stages: string[] }[]; session?: string }) => {
            uiaCalled = true;
            return { type: 'm.login.password', user: userId, password: 'secret', session: uia.session };
        };

        const engine = (client.crypto as any).engine as import("../../src/e2ee/RustEngine").RustEngine;
        await Promise.all([
            engine.bootstrapCrossSigning(uiaCallback),
            http.flushAllExpected(),
        ]);

        expect(uiaCalled).toBe(true);
        expect(deviceSigningCallCount).toBe(2);
        // The signatures body must NOT be wrapped in a "signed_keys" envelope —
        // top-level keys must be user IDs, not the literal string "signed_keys".
        expect(Object.keys(signaturesBody)).not.toContain('signed_keys');
    }));
});

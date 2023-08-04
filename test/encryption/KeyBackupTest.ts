import * as simple from "simple-mock";
import HttpBackend from 'matrix-mock-request';

import { ICurve25519AuthData, ICurve25519AuthDataUnsigned, IKeyBackupInfo, IKeyBackupInfoRetrieved, IKeyBackupInfoUnsigned, KeyBackupEncryptionAlgorithm } from "../../src/models/KeyBackup";
import { MatrixClient, MatrixError, OTKAlgorithm, UnpaddedBase64 } from "../../src";
import { createTestClient, testCryptoStores, TEST_DEVICE_ID } from "../TestUtils";
import { bindNullEngine } from "./CryptoClientTest";

describe('KeyBackups', () => {
    const userId = "@alice:example.org";
    let client: MatrixClient;
    let http: HttpBackend;

    const prepareCrypto = async () => {
        bindNullEngine(http);
        await Promise.all([
            client.crypto.prepare([]),
            http.flushAllExpected(),
        ]);
    };

    beforeEach(() => testCryptoStores(async (cryptoStoreType) => {
        const { client: mclient, http: mhttp } = createTestClient(null, userId, cryptoStoreType);
        client = mclient;
        http = mhttp;

        await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
    }));

    it('should retrieve a missing backup version', () => testCryptoStores(async (cryptoStoreType) => {
        http.when("GET", "/room_keys/version").respond(400, (path, obj) => {
            return {
                errcode: "M_NOT_FOUND",
                error: "No current backup version",
            };
        });

        await Promise.all([
            http.flushAllExpected(),
            (async () => {
                const keyBackupInfo = await client.getKeyBackupVersion();
                expect(keyBackupInfo).toBeNull();
            })(),
        ]);
    }));

    it('should create and retrieve a backup version', () => testCryptoStores(async (cryptoStoreType) => {
        await prepareCrypto();

        const authDataUnsigned: ICurve25519AuthDataUnsigned = {
            public_key: UnpaddedBase64.encodeString("pubkey"),
        };

        const keyBackupInfoToPost: IKeyBackupInfoUnsigned = {
            algorithm: KeyBackupEncryptionAlgorithm.MegolmBackupV1Curve25519AesSha2,
            auth_data: authDataUnsigned,
        };

        let keyBackupInfoOnServer: IKeyBackupInfoRetrieved|undefined;

        http.when("POST", "/room_keys/version").respond(200, (path, obj: IKeyBackupInfo) => {
            expect(obj.auth_data.signatures[userId]).toHaveProperty(`ed25519:${TEST_DEVICE_ID}`);

            keyBackupInfoOnServer = {
                ...obj,
                version: "1",
                count: 0,
                etag: "etag0",
            };
            return keyBackupInfoOnServer.version;
        });

        http.when("GET", "/room_keys/version").respond(200, (path, obj) => {
            expect(keyBackupInfoOnServer).toBeDefined();
            expect(keyBackupInfoOnServer.version).toBe("1");

            return keyBackupInfoOnServer;
        });

        await Promise.all([
            http.flushAllExpected(),
            (async () => {
                const keyBackupVersion = await client.signAndCreateKeyBackupVersion(keyBackupInfoToPost);
                expect(keyBackupVersion).toStrictEqual(keyBackupInfoOnServer.version);

                const keyBackupInfoRetrieved = await client.getKeyBackupVersion();
                expect(keyBackupInfoRetrieved).toStrictEqual(keyBackupInfoOnServer);
            })(),
        ]);
    }));
});

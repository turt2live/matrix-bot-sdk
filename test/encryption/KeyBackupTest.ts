import HttpBackend from 'matrix-mock-request';

import {
    ICurve25519AuthDataUnsigned,
    IKeyBackupInfo,
    IKeyBackupInfoRetrieved,
    IKeyBackupInfoUnsigned,
    IKeyBackupUpdateResponse,
    KeyBackupEncryptionAlgorithm,
} from "../../src/models/KeyBackup";
import { EncryptionAlgorithm, ICryptoRoomInformation, MatrixClient, RoomTracker } from "../../src";
import { bindNullEngine, createTestClient, testCryptoStores, TEST_DEVICE_ID, generateCurve25519PublicKey, bindNullQuery } from "../TestUtils";

const USER_ID = "@alice:example.org";

describe('KeyBackups', () => {
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
        const { client: mclient, http: mhttp } = createTestClient(null, USER_ID, cryptoStoreType);
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
            (async () => {
                const keyBackupInfo = await client.getKeyBackupVersion();
                expect(keyBackupInfo).toBeNull();
            })(),
            http.flushAllExpected(),
        ]);
    }));

    it('should fail to create a backup version when the crypto has not been prepared', () => testCryptoStores(async (cryptoStoreType) => {
        try {
            await client.signAndCreateKeyBackupVersion({
                algorithm: KeyBackupEncryptionAlgorithm.MegolmBackupV1Curve25519AesSha2,
                auth_data: {
                    public_key: "fake_key",
                },
            });

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Failed to fail");
        } catch (e) {
            expect(e.message).toEqual("End-to-end encryption has not initialized");
        }
    }));

    it('should create and retrieve a backup version', () => testCryptoStores(async (cryptoStoreType) => {
        await prepareCrypto();

        const authDataUnsigned: ICurve25519AuthDataUnsigned = {
            public_key: generateCurve25519PublicKey(),
        };

        const keyBackupInfo: IKeyBackupInfoUnsigned = {
            algorithm: KeyBackupEncryptionAlgorithm.MegolmBackupV1Curve25519AesSha2,
            auth_data: authDataUnsigned,
        };

        let keyBackupInfoOnServer: IKeyBackupInfoRetrieved|undefined;

        http.when("POST", "/room_keys/version").respond(200, (path, obj: IKeyBackupInfo) => {
            expect(obj.auth_data.signatures[USER_ID]).toHaveProperty(`ed25519:${TEST_DEVICE_ID}`);

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
            (async () => {
                const keyBackupVersion = await client.signAndCreateKeyBackupVersion(keyBackupInfo);
                expect(keyBackupVersion).toStrictEqual(keyBackupInfoOnServer.version);

                const keyBackupInfoRetrieved = await client.getKeyBackupVersion();
                expect(keyBackupInfoRetrieved).toStrictEqual(keyBackupInfoOnServer);
            })(),
            http.flushAllExpected(),
        ]);
    }));

    it('should fail to enable backups when the crypto has not been prepared', () => testCryptoStores(async (cryptoStoreType) => {
        try {
            await client.enableKeyBackup({
                algorithm: KeyBackupEncryptionAlgorithm.MegolmBackupV1Curve25519AesSha2,
                auth_data: {
                    public_key: "fake_key",
                    signatures: {},
                },
                version: "1",
                count: 0,
                etag: "etag0",
            });

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Failed to fail");
        } catch (e) {
            expect(e.message).toEqual("End-to-end encryption has not initialized");
        }
    }));

    it('should fail to enable backups with an unsupported algorithm', () => testCryptoStores(async (cryptoStoreType) => {
        await prepareCrypto();

        const algorithm = "bogocrypt";

        try {
            await client.enableKeyBackup({
                algorithm,
                auth_data: {
                    signatures: {},
                },
                version: "0",
                count: 0,
                etag: "zz",
            });

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Failed to fail");
        } catch (e) {
            expect(e.message).toEqual("Key backup error: cannot enable backups with unsupported backup algorithm " + algorithm);
        }
    }));

    it('correctly backs up keys', () => testCryptoStores(async (cryptoStoreType) => {
        await prepareCrypto();

        // --- Generate a room key by preparing encryption for that room

        const roomId = "!a:example.org";
        client.getJoinedRoomMembers = async () => [USER_ID];
        client.crypto.isRoomEncrypted = async () => true;

        const roomCryptoConfig: ICryptoRoomInformation = {
            algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
            rotation_period_msgs: 1,
        };
        ((client.crypto as any).roomTracker as RoomTracker).getRoomCryptoConfig = async () => roomCryptoConfig;

        const encryptRoomEvent = async () => {
            bindNullQuery(http);
            const encryptPromise = client.crypto.encryptRoomEvent(roomId, "m.room.message", "my message");
            await http.flushAllExpected({ timeout: 10000 });

            // This is because encryptRoomEvent calls "/keys/query" after encrypting too.
            bindNullQuery(http);
            await Promise.all([
                encryptPromise,
                http.flushAllExpected({ timeout: 10000 }),
            ]);
        };

        await encryptRoomEvent();

        // --- Back up the generated room key by enabling backups

        const authDataUnsigned: ICurve25519AuthDataUnsigned = {
            public_key: generateCurve25519PublicKey(),
        };
        const keyBackupInfo: IKeyBackupInfoRetrieved = {
            algorithm: KeyBackupEncryptionAlgorithm.MegolmBackupV1Curve25519AesSha2,
            auth_data: {
                ...authDataUnsigned,
                signatures: await client.crypto.sign(authDataUnsigned),
            },
            version: "1",
            count: 0,
            etag: "etag0",
        };

        const knownSessions: Set<string> = new Set();
        let etagCount = 0;

        const expectToPutRoomKey = () => {
            http.when("PUT", "/room_keys/keys").respond(200, (path, obj: Record<string, unknown>): IKeyBackupUpdateResponse => {
                const sessions = obj?.rooms[roomId]?.sessions;
                expect(sessions).toBeDefined();

                Object.keys(sessions).forEach(session => { knownSessions.add(session); });
                return {
                    count: knownSessions.size,
                    etag: `etag${++etagCount}`,
                };
            });
        };

        expectToPutRoomKey();
        await Promise.all([
            client.enableKeyBackup(keyBackupInfo),
            http.flushAllExpected(),
        ]);
        expect(knownSessions.size).toStrictEqual(1);

        // --- Back up a new room key by generating one while backups are enabled

        expectToPutRoomKey();
        await encryptRoomEvent();
        expect(knownSessions.size).toStrictEqual(2);

        // --- Back up a room key received via a to-device message
        // TODO: use updateSyncData to send an *encrypted* "m.room_key" event.

        // --- Should not time out due to a mistake in the promise queue
        await client.disableKeyBackup();
    }),
    // Use longer timeout to give more time for encryption
    30000);
});

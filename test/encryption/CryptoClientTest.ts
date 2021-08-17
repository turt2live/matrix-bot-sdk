import * as expect from "expect";
import * as simple from "simple-mock";
import {
    ConsoleLogger,
    DeviceKeyAlgorithm,
    EncryptedFile,
    EncryptedRoomEvent,
    EncryptionAlgorithm,
    ILogger,
    IMRoomKey,
    IOlmEncrypted,
    IOlmPayload,
    IOlmSession,
    IToDeviceMessage,
    LogService,
    MatrixClient,
    OTKAlgorithm,
    OTKCounts,
    RoomEncryptionAlgorithm,
    UserDevice,
} from "../../src";
import { createTestClient, TEST_DEVICE_ID } from "../MatrixClientTest";
import {
    feedOlmAccount,
    feedStaticOlmAccount,
    prepareOlm,
    RECEIVER_DEVICE,
    RECEIVER_OLM_SESSION,
    STATIC_OUTBOUND_SESSION,
} from "../TestUtils";
import { DeviceTracker } from "../../src/e2ee/DeviceTracker";
import { STATIC_TEST_DEVICES } from "./DeviceTrackerTest";

describe('CryptoClient', () => {
    it('should not have a device ID or be ready until prepared', async () => {
        const userId = "@alice:example.org";
        const { client } = createTestClient(null, userId, true);

        client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
        client.uploadDeviceKeys = () => Promise.resolve({});
        client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
        client.checkOneTimeKeyCounts = () => Promise.resolve({});

        expect(client.crypto).toBeDefined();
        expect(client.crypto.clientDeviceId).toBeFalsy();
        expect(client.crypto.isReady).toEqual(false);

        await client.crypto.prepare([]);

        expect(client.crypto.clientDeviceId).toEqual(TEST_DEVICE_ID);
        expect(client.crypto.isReady).toEqual(true);
    });

    describe('prepare', () => {
        it('should prepare the room tracker', async () => {
            const userId = "@alice:example.org";
            const roomIds = ["!a:example.org", "!b:example.org"];
            const { client } = createTestClient(null, userId, true);

            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            const prepareSpy = simple.stub().callFn((rids: string[]) => {
                expect(rids).toBe(roomIds);
                return Promise.resolve();
            });

            (<any>client.crypto).roomTracker.prepare = prepareSpy; // private member access

            await client.crypto.prepare(roomIds);
            expect(prepareSpy.callCount).toEqual(1);
        });

        it('should use a stored device ID', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            const whoamiSpy = simple.stub().callFn(() => Promise.resolve({ user_id: userId, device_id: "wrong" }));
            client.getWhoAmI = whoamiSpy;
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            await client.crypto.prepare([]);
            expect(whoamiSpy.callCount).toEqual(0);
            expect(client.crypto.clientDeviceId).toEqual(TEST_DEVICE_ID);
        });

        it('should create new keys if any of the properties are missing', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            const deviceKeySpy = simple.stub().callFn(() => Promise.resolve({}));
            const otkSpy = simple.stub().callFn(() => Promise.resolve({}));
            client.uploadDeviceKeys = deviceKeySpy;
            client.uploadDeviceOneTimeKeys = otkSpy;
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            await client.crypto.prepare([]);
            expect(deviceKeySpy.callCount).toEqual(1);
            expect(otkSpy.callCount).toEqual(1);

            // NEXT STAGE: Missing Olm Account

            await client.cryptoStore.setPickledAccount("");
            await client.crypto.prepare([]);
            expect(deviceKeySpy.callCount).toEqual(2);
            expect(otkSpy.callCount).toEqual(2);

            // NEXT STAGE: Missing Pickle

            await client.cryptoStore.setPickleKey("");
            await client.crypto.prepare([]);
            expect(deviceKeySpy.callCount).toEqual(3);
            expect(otkSpy.callCount).toEqual(3);
        });

        it('should use given values if they are all present', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);

            const deviceKeySpy = simple.stub().callFn(() => Promise.resolve({}));
            const otkSpy = simple.stub().callFn(() => Promise.resolve({}));
            const checkSpy = simple.stub().callFn(() => Promise.resolve({}));
            client.uploadDeviceKeys = deviceKeySpy;
            client.uploadDeviceOneTimeKeys = otkSpy;
            client.checkOneTimeKeyCounts = checkSpy;

            await client.crypto.prepare([]);
            expect(deviceKeySpy.callCount).toEqual(0);
            expect(otkSpy.callCount).toEqual(1);
            expect(checkSpy.callCount).toEqual(1);
        });
    });

    describe('isRoomEncrypted', () => {
        it('should fail when the crypto has not been prepared', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            // await client.crypto.prepare([]); // deliberately commented

            try {
                await client.crypto.isRoomEncrypted("!new:example.org");

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should return false for unknown rooms', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            client.getRoomStateEvent = () => Promise.reject("return value not used");
            await client.crypto.prepare([]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(false);
        });

        it('should return false for unencrypted rooms', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            client.getRoomStateEvent = () => Promise.reject("implying 404");
            await client.crypto.prepare([]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(false);
        });

        it('should return true for encrypted rooms (redacted state)', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            client.getRoomStateEvent = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(true);
        });

        it('should return true for encrypted rooms', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            client.getRoomStateEvent = () => Promise.resolve({ algorithm: RoomEncryptionAlgorithm.MegolmV1AesSha2 });
            await client.crypto.prepare([]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(true);
        });
    });

    describe('updateCounts', () => {
        it('should imply zero keys when no known counts are given', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            const expectedUpload = 50;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const uploadSpy = simple.stub().callFn((signed) => {
                expect(Object.keys(signed).length).toEqual(expectedUpload);
                return Promise.resolve({});
            });
            client.uploadDeviceOneTimeKeys = uploadSpy;

            await client.crypto.updateCounts({});
            expect(uploadSpy.callCount).toEqual(1);
        });

        it('should create signed OTKs', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            const counts: OTKCounts = { [OTKAlgorithm.Signed]: 0, [OTKAlgorithm.Unsigned]: 5 };
            const expectedUpload = 50;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const uploadSpy = simple.stub().callFn((signed) => {
                expect(Object.keys(signed).length).toEqual(expectedUpload);
                expect(Object.keys(signed).every(k => k.startsWith(OTKAlgorithm.Signed + ":"))).toEqual(true);
                return Promise.resolve({});
            });
            client.uploadDeviceOneTimeKeys = uploadSpy;

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(1);
        });

        it('should create the needed amount of OTKs', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            const counts: OTKCounts = { [OTKAlgorithm.Signed]: 0, [OTKAlgorithm.Unsigned]: 5 };
            const expectedUpload = 50;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const uploadSpy = simple.stub().callFn((signed) => {
                expect(Object.keys(signed).length).toEqual(expectedUpload);
                expect(Object.keys(signed).every(k => k.startsWith(OTKAlgorithm.Signed + ":"))).toEqual(true);
                return Promise.resolve({});
            });
            client.uploadDeviceOneTimeKeys = uploadSpy;

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(1);

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(2);

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(3);

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(4);
        });

        it('should not create OTKs if there are enough remaining', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            const counts: OTKCounts = { [OTKAlgorithm.Signed]: 14, [OTKAlgorithm.Unsigned]: 5 };
            const expectedUpload = 50 - counts[OTKAlgorithm.Signed];

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const uploadSpy = simple.stub().callFn((signed) => {
                expect(Object.keys(signed).length).toEqual(expectedUpload);
                expect(Object.keys(signed).every(k => k.startsWith(OTKAlgorithm.Signed + ":"))).toEqual(true);
                return Promise.resolve({});
            });
            client.uploadDeviceOneTimeKeys = uploadSpy;

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(1);
        });

        it('should persist the Olm account after each upload', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            const counts: OTKCounts = { [OTKAlgorithm.Signed]: 0, [OTKAlgorithm.Unsigned]: 5 };
            const expectedUpload = 50;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const uploadSpy = simple.stub().callFn((signed) => {
                expect(Object.keys(signed).length).toEqual(expectedUpload);
                expect(Object.keys(signed).every(k => k.startsWith(OTKAlgorithm.Signed + ":"))).toEqual(true);
                return Promise.resolve({});
            });
            client.uploadDeviceOneTimeKeys = uploadSpy;

            let account = await client.cryptoStore.getPickledAccount();

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(1);
            let newAccount = await client.cryptoStore.getPickledAccount();
            expect(account).not.toEqual(newAccount);
            account = newAccount;

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(2);
            newAccount = await client.cryptoStore.getPickledAccount();
            expect(account).not.toEqual(newAccount);
            account = newAccount;

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(3);
            newAccount = await client.cryptoStore.getPickledAccount();
            expect(account).not.toEqual(newAccount);
            account = newAccount;

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(4);
            newAccount = await client.cryptoStore.getPickledAccount();
            expect(account).not.toEqual(newAccount);
        });
    });

    describe('sign', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(async () => {
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedStaticOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            // client crypto not prepared for the one test which wants that state
        });

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.sign({ doesnt: "matter" });

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should sign the object while retaining signatures without mutation', async () => {
            await client.crypto.prepare([]);

            const obj = {
                sign: "me",
                signatures: {
                    "@another:example.org": {
                        "ed25519:DEVICE": "signature goes here",
                    },
                },
                unsigned: {
                    not: "included",
                },
            };

            const signatures = await client.crypto.sign(obj);
            expect(signatures).toMatchObject({
                [userId]: {
                    [`ed25519:${TEST_DEVICE_ID}`]: "zb/gbMjWCxfVrN5ASjvKr+leUWdaX026pccfiul+TzE7tABjWqnzjZiy6ox2MQk85IWD+DpR8Mo65a5o+/m4Cw",
                },
                ...obj.signatures,
            });
            expect(obj['signatures']).toBeDefined();
            expect(obj['unsigned']).toBeDefined();
        });
    });

    describe('verifySignature', () => {
        let signed: object;
        let key: string;
        let signature: string;
        let client: MatrixClient;

        beforeEach(async () => {
            signed = {
                algorithms: [EncryptionAlgorithm.OlmV1Curve25519AesSha2, EncryptionAlgorithm.MegolmV1AesSha2],
                device_id: "NTTFKSVBSI",
                keys: {
                    "curve25519:NTTFKSVBSI": "zPsrUlEM3DKRcBYKMHgZTLmYJU1FJDzBRnH6DsTxHH8",
                    "ed25519:NTTFKSVBSI": "2tVcG/+sE7hq4z+E/x6UrMuVEAzc4CknYIGbg3cQg/4",
                },
                signatures: {
                    "@ping:localhost": {
                        "ed25519:NTTFKSVBSI": "CLm1TOPFFIygs68amMsnywQoLz2evo/O28BVQGPKC986yFt0OpDKcyMUTsRFiRcdLstqtWkhy1p+UTW2/FPEDw",
                        "ed25519:7jeU3P5Fb8wS+LmhXNhiDSBrPMBI+uBZItlRJnpoHtE": "vx1bb8n1xWIJ+5ZkOrQ91msZbEU/p2wZGdxbnQAQDr/ZhZqwKwvY6G5bkhjvtQTdVRspPC/mFKyH0UW9D30IDA",
                    },
                },
                user_id: "@ping:localhost",
                unsigned: {
                    device_display_name: "localhost:8080 (Edge, Windows)",
                },
            };
            key = "2tVcG/+sE7hq4z+E/x6UrMuVEAzc4CknYIGbg3cQg/4";
            signature = "CLm1TOPFFIygs68amMsnywQoLz2evo/O28BVQGPKC986yFt0OpDKcyMUTsRFiRcdLstqtWkhy1p+UTW2/FPEDw";

            const userId = "@alice:example.org";
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            // client crypto not prepared for the one test which wants that state
        });

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.verifySignature(signed, key, signature);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should return true for valid signatures', async () => {
            await client.crypto.prepare([]);

            const result = await client.crypto.verifySignature(signed, key, signature);
            expect(result).toBe(true);
        });

        it('should return false for invalid signatures', async () => {
            await client.crypto.prepare([]);

            let result = await client.crypto.verifySignature(signed, "wrong key", signature);
            expect(result).toBe(false);
            result = await client.crypto.verifySignature(signed, key, "wrong signature");
            expect(result).toBe(false);
            result = await client.crypto.verifySignature({ wrong: "object" }, key, signature);
            expect(result).toBe(false);
        });

        it('should not mutate the provided object', async () => {
            await client.crypto.prepare([]);

            const result = await client.crypto.verifySignature(signed, key, signature);
            expect(result).toBe(true);
            expect(signed["signatures"]).toBeDefined();
            expect(signed["unsigned"]).toBeDefined();
        });
    });

    describe('flagUsersDeviceListsOutdated', () => {
        it('should fail when the crypto has not been prepared', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            // await client.crypto.prepare([]); // deliberately commented

            try {
                await client.crypto.flagUsersDeviceListsOutdated(["@new:example.org"]);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should pass through to the device tracker (resync=true)', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            client.getRoomStateEvent = () => Promise.reject("return value not used");
            await client.crypto.prepare([]);

            const userIds = ["@first:example.org", "@second:example.org"];
            const resync = true;

            const tracker: DeviceTracker = (<any>client.crypto).deviceTracker; // private member access
            const flagSpy = simple.stub().callFn(async (uids, rsyc) => {
                expect(uids).toMatchObject(userIds);
                expect(uids.length).toBe(userIds.length);
                expect(rsyc).toEqual(resync);
            });
            tracker.flagUsersOutdated = flagSpy;

            await client.crypto.flagUsersDeviceListsOutdated(userIds, resync);
            expect(flagSpy.callCount).toBe(1);
        });

        it('should pass through to the device tracker (resync=false)', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            client.getRoomStateEvent = () => Promise.reject("return value not used");
            await client.crypto.prepare([]);

            const userIds = ["@first:example.org", "@second:example.org"];
            const resync = false;

            const tracker: DeviceTracker = (<any>client.crypto).deviceTracker; // private member access
            const flagSpy = simple.stub().callFn(async (uids, rsyc) => {
                expect(uids).toMatchObject(userIds);
                expect(uids.length).toBe(userIds.length);
                expect(rsyc).toEqual(resync);
            });
            tracker.flagUsersOutdated = flagSpy;

            await client.crypto.flagUsersDeviceListsOutdated(userIds, resync);
            expect(flagSpy.callCount).toBe(1);
        });
    });

    describe('getOrCreateOlmSessions', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(async () => {
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedStaticOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            // client crypto not prepared for the one test which wants that state
        });

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.getOrCreateOlmSessions({});

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should skip our own user and device', async () => {
            await client.crypto.prepare([]);

            const claimSpy = simple.stub().callFn(async (req) => {
                expect(Object.keys(req).length).toBe(0);
                return { one_time_keys: {}, failures: {} };
            });
            client.claimOneTimeKeys = claimSpy;

            const result = await client.crypto.getOrCreateOlmSessions({
                [userId]: [TEST_DEVICE_ID],
            });
            expect(Object.keys(result).length).toBe(0);
            expect(claimSpy.callCount).toBe(0); // no reason it should be called
        });

        it('should use existing sessions if present', async () => {
            await client.crypto.prepare([]);

            const targetUserId = "@target:example.org";
            const targetDeviceId = "TARGET";

            const session: IOlmSession = {
                sessionId: "test_session",
                lastDecryptionTs: Date.now(),
                pickled: "pickled",
            };

            const claimSpy = simple.stub().callFn(async (req) => {
                expect(Object.keys(req).length).toBe(0);
                return { one_time_keys: {}, failures: {} };
            });
            client.claimOneTimeKeys = claimSpy;

            client.cryptoStore.getCurrentOlmSession = async (uid, did) => {
                expect(uid).toEqual(targetUserId);
                expect(did).toEqual(targetDeviceId);
                return session;
            };

            const result = await client.crypto.getOrCreateOlmSessions({
                [targetUserId]: [targetDeviceId],
            });
            expect(result).toMatchObject({
                [targetUserId]: {
                    [targetDeviceId]: session,
                },
            });
            expect(claimSpy.callCount).toBe(0); // no reason it should be called
        });

        it('should not use existing sessions if asked to force new sessions', async () => {
            await client.crypto.prepare([]);

            const targetUserId = "@target:example.org";
            const targetDeviceId = "TARGET";

            const session: IOlmSession = {
                sessionId: "test_session",
                lastDecryptionTs: Date.now(),
                pickled: "pickled",
            };

            const claimSpy = simple.stub().callFn(async (req) => {
                expect(req).toMatchObject({
                    [targetUserId]: {
                        [targetDeviceId]: OTKAlgorithm.Signed,
                    },
                });
                return {
                    one_time_keys: {
                        [targetUserId]: {
                            [targetDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${targetDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures: {
                                        [targetUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25519}:${targetDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                        },
                    },
                    failures: {},
                };
            });
            client.claimOneTimeKeys = claimSpy;

            client.cryptoStore.getCurrentOlmSession = async (uid, did) => {
                throw new Error("Not called appropriately");
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(targetUserId);
                return [{
                    user_id: targetUserId,
                    device_id: targetDeviceId,
                    keys: {
                        [`${DeviceKeyAlgorithm.Curve25519}:${targetDeviceId}`]: "zPsrUlEM3DKRcBYKMHgZTLmYJU1FJDzBRnH6DsTxHH8",
                    },

                    // We don't end up using a lot of this in this test
                    unsigned: {},
                    signatures: {},
                    algorithms: [],
                }];
            };

            // Skip signature verification for this test
            client.crypto.verifySignature = () => Promise.resolve(true);

            const result = await client.crypto.getOrCreateOlmSessions({
                [targetUserId]: [targetDeviceId],
            }, true); // FORCE!!
            expect(result).toMatchObject({
                [targetUserId]: {
                    [targetDeviceId]: {
                        sessionId: expect.any(String),
                        lastDecryptionTs: expect.any(Number),
                        pickled: expect.any(String),
                    },
                },
            });
            expect(result[targetUserId][targetDeviceId].sessionId).not.toEqual(session.sessionId);
            expect(claimSpy.callCount).toBe(1);
        });

        it('should support mixing of OTK claims and existing sessions', async () => {
            await client.crypto.prepare([]);

            const targetUserId = "@target:example.org";
            const targetDeviceId = "TARGET";

            const claimUserId = "@claim:example.org";
            const claimDeviceId = "CLAIM_ME";

            const session: IOlmSession = {
                sessionId: "test_session",
                lastDecryptionTs: Date.now(),
                pickled: "pickled",
            };

            const claimSpy = simple.stub().callFn(async (req) => {
                expect(req).toMatchObject({
                    [claimUserId]: {
                        [claimDeviceId]: OTKAlgorithm.Signed,
                    },
                });
                return {
                    one_time_keys: {
                        [claimUserId]: {
                            [claimDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${claimDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures: {
                                        [claimUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25519}:${claimDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                        },
                    },
                    failures: {},
                };
            });
            client.claimOneTimeKeys = claimSpy;

            client.cryptoStore.getCurrentOlmSession = async (uid, did) => {
                if (uid === targetUserId) {
                    expect(did).toEqual(targetDeviceId);
                } else if (uid === claimUserId) {
                    expect(did).toEqual(claimDeviceId);
                    return null;
                } else {
                    throw new Error("Unexpected user");
                }
                return session;
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(claimUserId);
                return [{
                    user_id: claimUserId,
                    device_id: claimDeviceId,
                    keys: {
                        [`${DeviceKeyAlgorithm.Curve25519}:${claimDeviceId}`]: "zPsrUlEM3DKRcBYKMHgZTLmYJU1FJDzBRnH6DsTxHH8",
                    },

                    // We don't end up using a lot of this in this test
                    unsigned: {},
                    signatures: {},
                    algorithms: [],
                }];
            };

            // Skip signature verification for this test
            client.crypto.verifySignature = () => Promise.resolve(true);

            const result = await client.crypto.getOrCreateOlmSessions({
                [targetUserId]: [targetDeviceId],
                [claimUserId]: [claimDeviceId],
            });
            expect(result).toMatchObject({
                [targetUserId]: {
                    [targetDeviceId]: session,
                },
                [claimUserId]: {
                    [claimDeviceId]: {
                        sessionId: expect.any(String),
                        lastDecryptionTs: expect.any(Number),
                        pickled: expect.any(String),
                    },
                },
            });
            expect(claimSpy.callCount).toBe(1);
        });

        it('should ensure the server is not injecting users in claim requests', async () => {
            await client.crypto.prepare([]);

            const targetUserId = "@target:example.org";
            const targetDeviceId = "TARGET";

            const claimUserId = "@claim:example.org";
            const claimDeviceId = "CLAIM_ME";

            const claimSpy = simple.stub().callFn(async (req) => {
                expect(req).toMatchObject({
                    [claimUserId]: {
                        [claimDeviceId]: OTKAlgorithm.Signed,
                    },
                });
                return {
                    one_time_keys: {
                        // Injected user/device
                        [targetUserId]: {
                            [targetDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${targetDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures: {
                                        [targetUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25519}:${targetDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                        },
                        [claimUserId]: {
                            [claimDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${claimDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures: {
                                        [claimUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25519}:${claimDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                        },
                    },
                    failures: {},
                };
            });
            client.claimOneTimeKeys = claimSpy;

            client.cryptoStore.getCurrentOlmSession = async (uid, did) => {
                expect(uid).toEqual(claimUserId);
                expect(did).toEqual(claimDeviceId);
                return null;
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(claimUserId);
                return [{
                    user_id: claimUserId,
                    device_id: claimDeviceId,
                    keys: {
                        [`${DeviceKeyAlgorithm.Curve25519}:${claimDeviceId}`]: "zPsrUlEM3DKRcBYKMHgZTLmYJU1FJDzBRnH6DsTxHH8",
                    },

                    // We don't end up using a lot of this in this test
                    unsigned: {},
                    signatures: {},
                    algorithms: [],
                }];
            };

            // Skip signature verification for this test
            client.crypto.verifySignature = () => Promise.resolve(true);

            const result = await client.crypto.getOrCreateOlmSessions({
                [claimUserId]: [claimDeviceId],
            });
            expect(result).toMatchObject({
                [claimUserId]: {
                    [claimDeviceId]: {
                        sessionId: expect.any(String),
                        lastDecryptionTs: expect.any(Number),
                        pickled: expect.any(String),
                    },
                },
            });
            expect(claimSpy.callCount).toBe(1);
        });

        it('should ensure the server is not injecting devices in claim requests', async () => {
            await client.crypto.prepare([]);

            const targetUserId = "@target:example.org";
            const targetDeviceId = "TARGET";

            const claimUserId = "@claim:example.org";
            const claimDeviceId = "CLAIM_ME";

            const claimSpy = simple.stub().callFn(async (req) => {
                expect(req).toMatchObject({
                    [claimUserId]: {
                        [claimDeviceId]: OTKAlgorithm.Signed,
                    },
                });
                return {
                    one_time_keys: {
                        [claimUserId]: {
                            // Injected device
                            [targetDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${targetDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures: {
                                        [targetUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25519}:${targetDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                            [claimDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${claimDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures: {
                                        [claimUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25519}:${claimDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                        },
                    },
                    failures: {},
                };
            });
            client.claimOneTimeKeys = claimSpy;

            client.cryptoStore.getCurrentOlmSession = async (uid, did) => {
                expect(uid).toEqual(claimUserId);
                expect(did).toEqual(claimDeviceId);
                return null;
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(claimUserId);
                return [{
                    user_id: claimUserId,
                    device_id: claimDeviceId,
                    keys: {
                        [`${DeviceKeyAlgorithm.Curve25519}:${claimDeviceId}`]: "zPsrUlEM3DKRcBYKMHgZTLmYJU1FJDzBRnH6DsTxHH8",
                    },

                    // We don't end up using a lot of this in this test
                    unsigned: {},
                    signatures: {},
                    algorithms: [],
                }];
            };

            // Skip signature verification for this test
            client.crypto.verifySignature = () => Promise.resolve(true);

            const result = await client.crypto.getOrCreateOlmSessions({
                [claimUserId]: [claimDeviceId],
            });
            expect(result).toMatchObject({
                [claimUserId]: {
                    [claimDeviceId]: {
                        sessionId: expect.any(String),
                        lastDecryptionTs: expect.any(Number),
                        pickled: expect.any(String),
                    },
                },
            });
            expect(claimSpy.callCount).toBe(1);
        });

        it('should ensure the device is known to verify the Curve25519 key', async () => {
            await client.crypto.prepare([]);

            const targetUserId = "@target:example.org";
            const targetDeviceId = "TARGET";

            const claimUserId = "@claim:example.org";
            const claimDeviceId = "CLAIM_ME";

            const claimSpy = simple.stub().callFn(async (req) => {
                expect(req).toMatchObject({
                    [claimUserId]: {
                        [claimDeviceId]: OTKAlgorithm.Signed,
                    },
                });
                return {
                    one_time_keys: {
                        [claimUserId]: {
                            [targetDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${targetDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures: {
                                        [targetUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25519}:${targetDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                            [claimDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${claimDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures: {
                                        [claimUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25519}:${claimDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                        },
                    },
                    failures: {},
                };
            });
            client.claimOneTimeKeys = claimSpy;

            client.cryptoStore.getCurrentOlmSession = async (uid, did) => {
                expect(uid).toEqual(claimUserId);
                expect([claimDeviceId, targetDeviceId].includes(did)).toBe(true);
                return null;
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(claimUserId);
                return [{
                    user_id: claimUserId,
                    device_id: claimDeviceId,
                    keys: {
                        [`${DeviceKeyAlgorithm.Curve25519}:${claimDeviceId}`]: "zPsrUlEM3DKRcBYKMHgZTLmYJU1FJDzBRnH6DsTxHH8",
                    },

                    // We don't end up using a lot of this in this test
                    unsigned: {},
                    signatures: {},
                    algorithms: [],
                }];
            };

            // Skip signature verification for this test
            client.crypto.verifySignature = () => Promise.resolve(true);

            const result = await client.crypto.getOrCreateOlmSessions({
                [claimUserId]: [claimDeviceId, targetDeviceId], // ask for an unknown device
            });
            expect(result).toMatchObject({
                [claimUserId]: {
                    [claimDeviceId]: {
                        sessionId: expect.any(String),
                        lastDecryptionTs: expect.any(Number),
                        pickled: expect.any(String),
                    },
                },
            });
            expect(claimSpy.callCount).toBe(1);
        });

        it('should ensure a signature is present on the claim response', async () => {
            await client.crypto.prepare([]);

            const claimUserId = "@claim:example.org";
            const claimDeviceId = "CLAIM_ME";

            const claimSpy = simple.stub().callFn(async (req) => {
                expect(req).toMatchObject({
                    [claimUserId]: {
                        [claimDeviceId]: OTKAlgorithm.Signed,
                    },
                });
                return {
                    one_time_keys: {
                        [claimUserId]: {
                            [claimDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${claimDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures_MISSING: {
                                        [claimUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25519}:${claimDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                        },
                    },
                    failures: {},
                };
            });
            client.claimOneTimeKeys = claimSpy;

            client.cryptoStore.getCurrentOlmSession = async (uid, did) => {
                expect(uid).toEqual(claimUserId);
                expect(did).toEqual(claimDeviceId);
                return null;
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(claimUserId);
                return [{
                    user_id: claimUserId,
                    device_id: claimDeviceId,
                    keys: {
                        [`${DeviceKeyAlgorithm.Curve25519}:${claimDeviceId}`]: "zPsrUlEM3DKRcBYKMHgZTLmYJU1FJDzBRnH6DsTxHH8",
                    },

                    // We don't end up using a lot of this in this test
                    unsigned: {},
                    signatures: {},
                    algorithms: [],
                }];
            };

            // Skip signature verification for this test
            client.crypto.verifySignature = () => Promise.resolve(true);

            const result = await client.crypto.getOrCreateOlmSessions({
                [claimUserId]: [claimDeviceId],
            });
            expect(Object.keys(result).length).toBe(0);
            expect(claimSpy.callCount).toBe(1);
        });

        it('should verify the signature of the claimed key', async () => {
            await client.crypto.prepare([]);

            const claimUserId = "@claim:example.org";
            const claimDeviceId = "CLAIM_ME";

            const claimSpy = simple.stub().callFn(async (req) => {
                expect(req).toMatchObject({
                    [claimUserId]: {
                        [claimDeviceId]: OTKAlgorithm.Signed,
                    },
                });
                return {
                    one_time_keys: {
                        [claimUserId]: {
                            [claimDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${claimDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures: {
                                        [claimUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25519}:${claimDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                        },
                    },
                    failures: {},
                };
            });
            client.claimOneTimeKeys = claimSpy;

            client.cryptoStore.getCurrentOlmSession = async (uid, did) => {
                expect(uid).toEqual(claimUserId);
                expect(did).toEqual(claimDeviceId);
                return null;
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(claimUserId);
                return [{
                    user_id: claimUserId,
                    device_id: claimDeviceId,
                    keys: {
                        [`${DeviceKeyAlgorithm.Curve25519}:${claimDeviceId}`]: "zPsrUlEM3DKRcBYKMHgZTLmYJU1FJDzBRnH6DsTxHH8",
                        [`${DeviceKeyAlgorithm.Ed25519}:${claimDeviceId}`]: "ED25519 KEY GOES HERE",
                    },

                    // We don't end up using a lot of this in this test
                    unsigned: {},
                    signatures: {},
                    algorithms: [],
                }];
            };

            const verifySpy = simple.stub().callFn(async (signed, dkey, sig) => {
                expect(signed).toMatchObject({
                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                    signatures: {
                        [claimUserId]: {
                            [`${DeviceKeyAlgorithm.Ed25519}:${claimDeviceId}`]: "Definitely real",
                        },
                    },
                });
                expect(dkey).toEqual("ED25519 KEY GOES HERE");
                expect(sig).toEqual("Definitely real");
                return true;
            });
            client.crypto.verifySignature = verifySpy;

            const result = await client.crypto.getOrCreateOlmSessions({
                [claimUserId]: [claimDeviceId],
            });
            expect(result).toMatchObject({
                [claimUserId]: {
                    [claimDeviceId]: {
                        sessionId: expect.any(String),
                        lastDecryptionTs: expect.any(Number),
                        pickled: expect.any(String),
                    },
                },
            });
            expect(claimSpy.callCount).toBe(1);
            expect(verifySpy.callCount).toBe(1);
        });

        it('should create a new outbound olm session', async () => {
            await client.crypto.prepare([]);

            const claimUserId = "@claim:example.org";
            const claimDeviceId = "CLAIM_ME";

            const claimSpy = simple.stub().callFn(async (req) => {
                expect(req).toMatchObject({
                    [claimUserId]: {
                        [claimDeviceId]: OTKAlgorithm.Signed,
                    },
                });
                return {
                    one_time_keys: {
                        [claimUserId]: {
                            [claimDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${claimDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures: {
                                        [claimUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25519}:${claimDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                        },
                    },
                    failures: {},
                };
            });
            client.claimOneTimeKeys = claimSpy;

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(claimUserId);
                return [{
                    user_id: claimUserId,
                    device_id: claimDeviceId,
                    keys: {
                        [`${DeviceKeyAlgorithm.Curve25519}:${claimDeviceId}`]: "zPsrUlEM3DKRcBYKMHgZTLmYJU1FJDzBRnH6DsTxHH8",
                        [`${DeviceKeyAlgorithm.Ed25519}:${claimDeviceId}`]: "ED25519 KEY GOES HERE",
                    },

                    // We don't end up using a lot of this in this test
                    unsigned: {},
                    signatures: {},
                    algorithms: [],
                }];
            };

            // Skip signature verification for this test
            client.crypto.verifySignature = () => Promise.resolve(true);

            const result = await client.crypto.getOrCreateOlmSessions({
                [claimUserId]: [claimDeviceId],
            });
            expect(result).toMatchObject({
                [claimUserId]: {
                    [claimDeviceId]: {
                        sessionId: expect.any(String),
                        lastDecryptionTs: expect.any(Number),
                        pickled: expect.any(String),
                    },
                },
            });
            expect(claimSpy.callCount).toBe(1);

            const session = result[claimUserId][claimDeviceId];
            expect(await client.cryptoStore.getCurrentOlmSession(claimUserId, claimDeviceId)).toMatchObject(session as any);
        });
    });

    describe('encryptAndSendOlmMessage', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(async () => {
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedStaticOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            // client crypto not prepared for the one test which wants that state
        });

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await (<any>client.crypto).encryptAndSendOlmMessage(null, null, null, null);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should work', async () => {
            await client.crypto.prepare([]);

            const device = RECEIVER_DEVICE;
            const session = RECEIVER_OLM_SESSION;
            const type = "org.example.test";
            const content = {
                isTest: true,
                val: "hello world",
                n: 42,
            };

            const sendSpy = simple.stub().callFn(async (t, m) => {
                expect(t).toEqual("m.room.encrypted");
                expect(m).toMatchObject({
                    "@receiver:example.org": {
                        "A": {
                            algorithm: "m.olm.v1.curve25519-aes-sha2",
                            ciphertext: {
                                "30KcbZc4ZmLxnLu3MraQ9vIrAjwtjR8uYmwCU/sViDE": {
                                    type: 0,
                                    body: "Awog+jA+wNz5Wnpw5isETy9LFDw0hoao06f7ewAhY0+yRGsSIJS/3l725T7pqoV3FKZY/cPH/2dV8W8yZeIWl1DKpaQlGiAFnYCGBRA+tqaR3SpDqbqtwgz1wzA0TV+Mjvzixbd1IyLQAgMKIAIldXBMsoIngiQkuLAvUYrz6QCFAwPeFb6hKlRKcBlTEAAioAKgrDGnYPaJv4asMwVsbNSXQOxRCE/sB0VZrYKH9OKwbZuP+jqHUPa6mtVBu3Sll2ROWJ94YtPycZXX45B4pT8XMvLL/jE6fH4gXZuheb6Q5iYV0XrHMNuIzyODjzbOzpvi7GXTFvb7YMFRskb2k965vfd9NRTpuUT9eb7vkLoIgCb9gK5WApEuS5/4lOIWHKdhqB1m4ViZ4W+eEo9TzniRvAMCfeX0G+OpCv5X9h1UomZl87Kh/q5ZSluuocWFOgG8sGvyLttl3AR3Vc500+9xUt9xvYz5p5hv9UWrnhL2tmKIvVAGCE+GLUDg+eHHSdu6wft5u6qg4ko69tYEmfMbJZc2MU6vmrFKkk3ZJJ27IX4qx8DPaeUWKao169D+982mMWbeZ6lsAQ",
                                },
                            },
                            sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                        },
                    },
                });
            });
            client.sendToDevices = sendSpy;

            const storeSpy = simple.stub().callFn(async (uid, did, s) => {
                expect(uid).toEqual(device.user_id);
                expect(did).toEqual(device.device_id);
                expect(s).toMatchObject({
                    lastDecryptionTs: session.lastDecryptionTs,
                    sessionId: session.sessionId,
                    pickled: "qHo1lPr3YRQLUwvPgTYnYUmLEMAXB/Xh/iBv3on2xvMjn2brZVb42hfkqPRyUW1KMUVRwwzBY+lp1vNx8JTx7EBCLP8/MziQzF+UtDErSNqdVi4TsY6o5vAA+A5BpBKhKiCo3zHO5FXqb36auf1d0Ynj1HTKldMsa2WBCsM6+R1KrY0WAWLi1i7QtlF9lYpk4ZzxhTY9MNMwQ9+h+1+FYxfUSAzQCAbX0WQpI04mq+c6N3bQdrdFVkGndI9c8oegFOR0vO920pYgK9479AFoA5D7IkOUwnZ8C8EqYKtYKBd0cs4+cTR9n5jHSvMfba59FYcv5xoWC2slIKez6bKWKfK/0N9psBdq",
                });
            });
            client.cryptoStore.storeOlmSession = storeSpy;

            await (<any>client.crypto).encryptAndSendOlmMessage(device, session, type, content);
            expect(sendSpy.callCount).toBe(1);
            expect(storeSpy.callCount).toBe(1);
        });
    });

    describe('encryptRoomEvent', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(async () => {
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedStaticOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            // client crypto not prepared for the one test which wants that state
        });

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.encryptRoomEvent("!room:example.org", "org.example", {});

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should fail in unencrypted rooms', async () => {
            await client.crypto.prepare([]);

            // Force unencrypted rooms
            client.crypto.isRoomEncrypted = async () => false;

            try {
                await client.crypto.encryptRoomEvent("!room:example.org", "type", {});

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Room is not encrypted");
            }
        });

        it('should use existing outbound sessions', async () => {
            await client.crypto.prepare([]);

            const deviceMap = {
                [RECEIVER_DEVICE.user_id]: [RECEIVER_DEVICE],
            };
            const roomId = "!test:example.org";

            // For this test, force all rooms to be encrypted
            client.crypto.isRoomEncrypted = async () => true;

            await client.cryptoStore.storeOlmSession(RECEIVER_DEVICE.user_id, RECEIVER_DEVICE.device_id, RECEIVER_OLM_SESSION);

            const getSpy = simple.stub().callFn(async (rid) => {
                expect(rid).toEqual(roomId);
                return STATIC_OUTBOUND_SESSION;
            });
            client.cryptoStore.getCurrentOutboundGroupSession = getSpy;

            const joinedSpy = simple.stub().callFn(async (rid) => {
                expect(rid).toEqual(roomId);
                return Object.keys(deviceMap);
            });
            client.getJoinedRoomMembers = joinedSpy;

            const devicesSpy = simple.stub().callFn(async (uids) => {
                expect(uids).toMatchObject(Object.keys(deviceMap));
                return deviceMap;
            });
            (<any>client.crypto).deviceTracker.getDevicesFor = devicesSpy;

            // We watch for the to-device messages to make sure we pass through the internal functions correctly
            const toDeviceSpy = simple.stub().callFn(async (t, m) => {
                expect(t).toEqual("m.room.encrypted");
                expect(m).toMatchObject({
                    [RECEIVER_DEVICE.user_id]: {
                        [RECEIVER_DEVICE.device_id]: {
                            algorithm: "m.olm.v1.curve25519-aes-sha2",
                            ciphertext: {
                                "30KcbZc4ZmLxnLu3MraQ9vIrAjwtjR8uYmwCU/sViDE": {
                                    type: 0,
                                    body: "Awog+jA+wNz5Wnpw5isETy9LFDw0hoao06f7ewAhY0+yRGsSIJS/3l725T7pqoV3FKZY/cPH/2dV8W8yZeIWl1DKpaQlGiAFnYCGBRA+tqaR3SpDqbqtwgz1wzA0TV+Mjvzixbd1IyLgBQMKIAIldXBMsoIngiQkuLAvUYrz6QCFAwPeFb6hKlRKcBlTEAAisAWgrDGnYPaJv4asMwVsbNSXQOxRCE/sB0VZrYKH9OKwbZuP+jqHUPa6mtVBu3Sll2ROWJ94YtPycZXX45B4pT8XMvLL/jE6fH4gXZuheb6Q5iYV0XrHMNuIzyODjzbOzpvi7GXTFvb7YMFRskb2k965vfd9NRTpuUT9eb7vkLoIgCb9gK5WApEuS5/4lOIWHKdhqB1m4ViZ4W+eEo9TzniRvAMCfeX0G+OpCv5X9h1UomZl87Kh/q5ZSluuocWFOgG8sGvyLttl3AR3Vc500+9xc0u7GT6lNvJo9Z1kH1xPcCce4oHWByFgGvdIMHYrB7SFZ/AtbiQDt/BUTgxsLd8gysHqjiiOKblz3iN3kx//f2MCTrjKgWDtmCeTRnb1Z8Rn9hdPbkpX2+yvkrmdMYYXKfQXB6PAY+6gRFqGREFXaKq8n0NPN7mN//sp7CJGmMU+DIyq7cPWcmW7zLTBdyoafn8YkJRqjIVbA271imw77cFvDdU1uWFT14275u7Z0qtOrXZiuDLPQyaARbitv8Cc4VfFB1XwWG0V8+fR3oJvIcCba4Q7ALO6TJqpurETU6eT4BAZBmugWObL2kDxdmuJYWpKvKbPdGhLTfbFFn0Sl1lgNaMrGjDoF+LVx/1Oiq9s0DnKPf9gamGIYr2voiSQvibC5m4UgMKLkiZVbAVs20fSV3TD5XMJYman6Rk8mNHBd+6fXW+C2buXd8WStiZ2/hVNalvV/MJPqdzJDHRz3avjwJryunbO48syLMud0y+6K2e8RJV/974lyfQ6BvJ/C7pN/rY3Rh5F4NtG0pSL9ghBzKuQQvKuVGf7U8L9w52iRQrPso+UhUkn8kpLD6AWklU7o9NenWO7eQLhz33i/A0DnM3ILw0c5XyQrX7/UgIRHkLAeVMHLmYC4IBaY1Y24ToFuVKXdb0",
                                },
                            },
                            sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                        },
                    },
                });
            });
            client.sendToDevices = toDeviceSpy;

            const result = await client.crypto.encryptRoomEvent(roomId, "org.example.test", {
                isTest: true,
                hello: "world",
                n: 42,
            });
            expect(getSpy.callCount).toBe(1);
            expect(joinedSpy.callCount).toBe(1);
            expect(devicesSpy.callCount).toBe(1);
            expect(toDeviceSpy.callCount).toBe(1);
            expect(result).toMatchObject({
                algorithm: "m.megolm.v1.aes-sha2",
                sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                ciphertext: "AwgAEnB4om5XWmKYTMTlDUK16C1v7GEXWl0JlNJZVXJYGEhEZIm+Hep8I2l4dFzchv3JdMKnBofYpLjXd6jEP144MsHfATu7g6qu3m/B+gpxsJ6fi0BTsO7GvXwwYsdsqGp8p9O+RvRP2JfUO7dBgW6uCPwQHcExXrA+csPHq/ItVNjnCBW3cAkXc34dZXeGn2LV5JGozaFI/2WEFEEP6r5SLqAPzia3khcL84nko5qtGh57VqG32H3H4v0G",
                session_id: STATIC_OUTBOUND_SESSION.sessionId,
                device_id: TEST_DEVICE_ID,
            });
        });

        it('should rotate outbound sessions based on time', async () => {
            await client.crypto.prepare([]);

            const deviceMap = {
                [RECEIVER_DEVICE.user_id]: [RECEIVER_DEVICE],
            };
            const roomId = "!test:example.org";
            const rotationIntervals = 200;
            const rotationMs = 50000;

            await client.cryptoStore.storeRoom(roomId, {
                algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                rotation_period_msgs: rotationIntervals,
                rotation_period_ms: rotationMs,
            });

            await client.cryptoStore.storeOlmSession(RECEIVER_DEVICE.user_id, RECEIVER_DEVICE.device_id, RECEIVER_OLM_SESSION);

            const getSpy = simple.stub().callFn(async (rid) => {
                expect(rid).toEqual(roomId);
                return {
                    ...STATIC_OUTBOUND_SESSION,
                    expiresTs: Date.now() / 2, // force expiry
                };
            });
            client.cryptoStore.getCurrentOutboundGroupSession = getSpy;

            const storeSpy = simple.stub().callFn(async (s) => {
                expect(s.sessionId).not.toEqual(STATIC_OUTBOUND_SESSION.sessionId);
                expect(s.roomId).toEqual(roomId);
                expect(s.pickled).toBeDefined();
                expect(s.isCurrent).toBe(true);
                expect(s.usesLeft).toBe(rotationIntervals - 1);
                expect(s.expiresTs - Date.now()).toBeLessThanOrEqual(rotationMs + 1000);
                expect(s.expiresTs - Date.now()).toBeGreaterThanOrEqual(rotationMs - 1000);
            });
            client.cryptoStore.storeOutboundGroupSession = storeSpy;

            const joinedSpy = simple.stub().callFn(async (rid) => {
                expect(rid).toEqual(roomId);
                return Object.keys(deviceMap);
            });
            client.getJoinedRoomMembers = joinedSpy;

            const devicesSpy = simple.stub().callFn(async (uids) => {
                expect(uids).toMatchObject(Object.keys(deviceMap));
                return deviceMap;
            });
            (<any>client.crypto).deviceTracker.getDevicesFor = devicesSpy;

            // We watch for the to-device messages to make sure we pass through the internal functions correctly
            const toDeviceSpy = simple.stub().callFn(async (t, m) => {
                expect(t).toEqual("m.room.encrypted");
                expect(m).toMatchObject({
                    [RECEIVER_DEVICE.user_id]: {
                        [RECEIVER_DEVICE.device_id]: {
                            algorithm: "m.olm.v1.curve25519-aes-sha2",
                            ciphertext: {
                                "30KcbZc4ZmLxnLu3MraQ9vIrAjwtjR8uYmwCU/sViDE": {
                                    type: 0,
                                    body: expect.any(String),
                                },
                            },
                            sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                        },
                    },
                });
            });
            client.sendToDevices = toDeviceSpy;

            const result = await client.crypto.encryptRoomEvent(roomId, "org.example.test", {
                isTest: true,
                hello: "world",
                n: 42,
            });
            expect(getSpy.callCount).toBe(1);
            expect(joinedSpy.callCount).toBe(1);
            expect(devicesSpy.callCount).toBe(1);
            expect(toDeviceSpy.callCount).toBe(1);
            expect(storeSpy.callCount).toBe(1);
            expect(result).toMatchObject({
                algorithm: "m.megolm.v1.aes-sha2",
                sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                ciphertext: expect.any(String),
                session_id: expect.any(String),
                device_id: TEST_DEVICE_ID,
            });
            expect(result.session_id).not.toEqual(STATIC_OUTBOUND_SESSION.sessionId);
        });

        it('should rotate outbound sessions based on uses', async () => {
            await client.crypto.prepare([]);

            const deviceMap = {
                [RECEIVER_DEVICE.user_id]: [RECEIVER_DEVICE],
            };
            const roomId = "!test:example.org";
            const rotationIntervals = 200;
            const rotationMs = 50000;

            await client.cryptoStore.storeRoom(roomId, {
                algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                rotation_period_msgs: rotationIntervals,
                rotation_period_ms: rotationMs,
            });

            await client.cryptoStore.storeOlmSession(RECEIVER_DEVICE.user_id, RECEIVER_DEVICE.device_id, RECEIVER_OLM_SESSION);

            const getSpy = simple.stub().callFn(async (rid) => {
                expect(rid).toEqual(roomId);
                return {
                    ...STATIC_OUTBOUND_SESSION,
                    usesLeft: 0,
                };
            });
            client.cryptoStore.getCurrentOutboundGroupSession = getSpy;

            const storeSpy = simple.stub().callFn(async (s) => {
                expect(s.sessionId).not.toEqual(STATIC_OUTBOUND_SESSION.sessionId);
                expect(s.roomId).toEqual(roomId);
                expect(s.pickled).toBeDefined();
                expect(s.isCurrent).toBe(true);
                expect(s.usesLeft).toBe(rotationIntervals - 1);
                expect(s.expiresTs - Date.now()).toBeLessThanOrEqual(rotationMs + 1000);
                expect(s.expiresTs - Date.now()).toBeGreaterThanOrEqual(rotationMs - 1000);
            });
            client.cryptoStore.storeOutboundGroupSession = storeSpy;

            const joinedSpy = simple.stub().callFn(async (rid) => {
                expect(rid).toEqual(roomId);
                return Object.keys(deviceMap);
            });
            client.getJoinedRoomMembers = joinedSpy;

            const devicesSpy = simple.stub().callFn(async (uids) => {
                expect(uids).toMatchObject(Object.keys(deviceMap));
                return deviceMap;
            });
            (<any>client.crypto).deviceTracker.getDevicesFor = devicesSpy;

            // We watch for the to-device messages to make sure we pass through the internal functions correctly
            const toDeviceSpy = simple.stub().callFn(async (t, m) => {
                expect(t).toEqual("m.room.encrypted");
                expect(m).toMatchObject({
                    [RECEIVER_DEVICE.user_id]: {
                        [RECEIVER_DEVICE.device_id]: {
                            algorithm: "m.olm.v1.curve25519-aes-sha2",
                            ciphertext: {
                                "30KcbZc4ZmLxnLu3MraQ9vIrAjwtjR8uYmwCU/sViDE": {
                                    type: 0,
                                    body: expect.any(String),
                                },
                            },
                            sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                        },
                    },
                });
            });
            client.sendToDevices = toDeviceSpy;

            const result = await client.crypto.encryptRoomEvent(roomId, "org.example.test", {
                isTest: true,
                hello: "world",
                n: 42,
            });
            expect(getSpy.callCount).toBe(1);
            expect(joinedSpy.callCount).toBe(1);
            expect(devicesSpy.callCount).toBe(1);
            expect(toDeviceSpy.callCount).toBe(1);
            expect(storeSpy.callCount).toBe(1);
            expect(result).toMatchObject({
                algorithm: "m.megolm.v1.aes-sha2",
                sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                ciphertext: expect.any(String),
                session_id: expect.any(String),
                device_id: TEST_DEVICE_ID,
            });
            expect(result.session_id).not.toEqual(STATIC_OUTBOUND_SESSION.sessionId);
        });

        it('should create new outbound sessions', async () => {
            await client.crypto.prepare([]);

            const deviceMap = {
                [RECEIVER_DEVICE.user_id]: [RECEIVER_DEVICE],
            };
            const roomId = "!test:example.org";
            const rotationIntervals = 200;
            const rotationMs = 50000;

            await client.cryptoStore.storeRoom(roomId, {
                algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                rotation_period_msgs: rotationIntervals,
                rotation_period_ms: rotationMs,
            });

            await client.cryptoStore.storeOlmSession(RECEIVER_DEVICE.user_id, RECEIVER_DEVICE.device_id, RECEIVER_OLM_SESSION);

            const getSpy = simple.stub().callFn(async (rid) => {
                expect(rid).toEqual(roomId);
                return null; // none for this test
            });
            client.cryptoStore.getCurrentOutboundGroupSession = getSpy;

            const storeSpy = simple.stub().callFn(async (s) => {
                expect(s.roomId).toEqual(roomId);
                expect(s.pickled).toBeDefined();
                expect(s.isCurrent).toBe(true);
                expect(s.usesLeft).toBe(rotationIntervals - 1);
                expect(s.expiresTs - Date.now()).toBeLessThanOrEqual(rotationMs + 1000);
                expect(s.expiresTs - Date.now()).toBeGreaterThanOrEqual(rotationMs - 1000);
            });
            client.cryptoStore.storeOutboundGroupSession = storeSpy;

            const ibStoreSpy = simple.stub().callFn(async (s) => {
                expect(s.sessionId).toBeDefined();
                expect(s.roomId).toEqual(roomId);
                expect(s.senderUserId).toEqual(userId);
                expect(s.senderDeviceId).toEqual(TEST_DEVICE_ID);
                expect(s.pickled).toBeDefined();
            });
            client.cryptoStore.storeInboundGroupSession = ibStoreSpy;

            const joinedSpy = simple.stub().callFn(async (rid) => {
                expect(rid).toEqual(roomId);
                return Object.keys(deviceMap);
            });
            client.getJoinedRoomMembers = joinedSpy;

            const devicesSpy = simple.stub().callFn(async (uids) => {
                expect(uids).toMatchObject(Object.keys(deviceMap));
                return deviceMap;
            });
            (<any>client.crypto).deviceTracker.getDevicesFor = devicesSpy;

            // We watch for the to-device messages to make sure we pass through the internal functions correctly
            const toDeviceSpy = simple.stub().callFn(async (t, m) => {
                expect(t).toEqual("m.room.encrypted");
                expect(m).toMatchObject({
                    [RECEIVER_DEVICE.user_id]: {
                        [RECEIVER_DEVICE.device_id]: {
                            algorithm: "m.olm.v1.curve25519-aes-sha2",
                            ciphertext: {
                                "30KcbZc4ZmLxnLu3MraQ9vIrAjwtjR8uYmwCU/sViDE": {
                                    type: 0,
                                    body: expect.any(String),
                                },
                            },
                            sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                        },
                    },
                });
            });
            client.sendToDevices = toDeviceSpy;

            const result = await client.crypto.encryptRoomEvent(roomId, "org.example.test", {
                isTest: true,
                hello: "world",
                n: 42,
            });
            expect(getSpy.callCount).toBe(1);
            expect(joinedSpy.callCount).toBe(1);
            expect(devicesSpy.callCount).toBe(1);
            expect(toDeviceSpy.callCount).toBe(1);
            expect(storeSpy.callCount).toBe(1);
            expect(ibStoreSpy.callCount).toBe(1);
            expect(result).toMatchObject({
                algorithm: "m.megolm.v1.aes-sha2",
                sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                ciphertext: expect.any(String),
                session_id: expect.any(String),
                device_id: TEST_DEVICE_ID,
            });
        });

        it.skip('should get devices for invited members', async () => {
            // TODO: Support invited members, if history visibility would allow.
        });

        it('should preserve m.relates_to', async () => {
            await client.crypto.prepare([]);

            const deviceMap = {
                [RECEIVER_DEVICE.user_id]: [RECEIVER_DEVICE],
            };
            const roomId = "!test:example.org";

            // For this test, force all rooms to be encrypted
            client.crypto.isRoomEncrypted = async () => true;

            await client.cryptoStore.storeOlmSession(RECEIVER_DEVICE.user_id, RECEIVER_DEVICE.device_id, RECEIVER_OLM_SESSION);

            const getSpy = simple.stub().callFn(async (rid) => {
                expect(rid).toEqual(roomId);
                return STATIC_OUTBOUND_SESSION;
            });
            client.cryptoStore.getCurrentOutboundGroupSession = getSpy;

            const joinedSpy = simple.stub().callFn(async (rid) => {
                expect(rid).toEqual(roomId);
                return Object.keys(deviceMap);
            });
            client.getJoinedRoomMembers = joinedSpy;

            const devicesSpy = simple.stub().callFn(async (uids) => {
                expect(uids).toMatchObject(Object.keys(deviceMap));
                return deviceMap;
            });
            (<any>client.crypto).deviceTracker.getDevicesFor = devicesSpy;

            // We watch for the to-device messages to make sure we pass through the internal functions correctly
            const toDeviceSpy = simple.stub().callFn(async (t, m) => {
                expect(t).toEqual("m.room.encrypted");
                expect(m).toMatchObject({
                    [RECEIVER_DEVICE.user_id]: {
                        [RECEIVER_DEVICE.device_id]: {
                            algorithm: "m.olm.v1.curve25519-aes-sha2",
                            ciphertext: {
                                "30KcbZc4ZmLxnLu3MraQ9vIrAjwtjR8uYmwCU/sViDE": {
                                    type: 0,
                                    body: expect.any(String),
                                },
                            },
                            sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                        },
                    },
                });
            });
            client.sendToDevices = toDeviceSpy;

            const result = await client.crypto.encryptRoomEvent(roomId, "org.example.test", {
                "m.relates_to": {
                    test: true,
                },
                isTest: true,
                hello: "world",
                n: 42,
            });
            expect(getSpy.callCount).toBe(1);
            expect(joinedSpy.callCount).toBe(1);
            expect(devicesSpy.callCount).toBe(1);
            expect(toDeviceSpy.callCount).toBe(1);
            expect(result).toMatchObject({
                "m.relates_to": {
                    test: true,
                },
                algorithm: "m.megolm.v1.aes-sha2",
                sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                ciphertext: expect.any(String),
                session_id: STATIC_OUTBOUND_SESSION.sessionId,
                device_id: TEST_DEVICE_ID,
            });
        });

        it('should not spam room keys for multiple calls', async () => {
            await client.crypto.prepare([]);

            const deviceMap = {
                [RECEIVER_DEVICE.user_id]: [RECEIVER_DEVICE],
            };
            const roomId = "!test:example.org";

            // For this test, force all rooms to be encrypted
            client.crypto.isRoomEncrypted = async () => true;

            await client.cryptoStore.storeOlmSession(RECEIVER_DEVICE.user_id, RECEIVER_DEVICE.device_id, RECEIVER_OLM_SESSION);

            const getSpy = simple.stub().callFn(async (rid) => {
                expect(rid).toEqual(roomId);
                return STATIC_OUTBOUND_SESSION;
            });
            client.cryptoStore.getCurrentOutboundGroupSession = getSpy;

            const joinedSpy = simple.stub().callFn(async (rid) => {
                expect(rid).toEqual(roomId);
                return Object.keys(deviceMap);
            });
            client.getJoinedRoomMembers = joinedSpy;

            const devicesSpy = simple.stub().callFn(async (uids) => {
                expect(uids).toMatchObject(Object.keys(deviceMap));
                return deviceMap;
            });
            (<any>client.crypto).deviceTracker.getDevicesFor = devicesSpy;

            // We watch for the to-device messages to make sure we pass through the internal functions correctly
            const toDeviceSpy = simple.stub().callFn(async (t, m) => {
                expect(t).toEqual("m.room.encrypted");
                expect(m).toMatchObject({
                    [RECEIVER_DEVICE.user_id]: {
                        [RECEIVER_DEVICE.device_id]: {
                            algorithm: "m.olm.v1.curve25519-aes-sha2",
                            ciphertext: {
                                "30KcbZc4ZmLxnLu3MraQ9vIrAjwtjR8uYmwCU/sViDE": {
                                    type: 0,
                                    body: expect.any(String),
                                },
                            },
                            sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                        },
                    },
                });
            });
            client.sendToDevices = toDeviceSpy;

            const result = await client.crypto.encryptRoomEvent(roomId, "org.example.test", {
                isTest: true,
                hello: "world",
                n: 42,
            });
            expect(getSpy.callCount).toBe(1);
            expect(joinedSpy.callCount).toBe(1);
            expect(devicesSpy.callCount).toBe(1);
            expect(toDeviceSpy.callCount).toBe(1);
            expect(result).toMatchObject({
                algorithm: "m.megolm.v1.aes-sha2",
                sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                ciphertext: expect.any(String),
                session_id: STATIC_OUTBOUND_SESSION.sessionId,
                device_id: TEST_DEVICE_ID,
            });

            const lastSent = await client.cryptoStore.getLastSentOutboundGroupSession(RECEIVER_DEVICE.user_id, RECEIVER_DEVICE.device_id, roomId);
            expect(lastSent).toMatchObject({
                sessionId: STATIC_OUTBOUND_SESSION.sessionId,
                index: expect.any(Number),
            });

            const result2 = await client.crypto.encryptRoomEvent(roomId, "org.example.test", {
                isTest: true,
                hello: "world",
                n: 42,
            });
            expect(getSpy.callCount).toBe(2);
            expect(joinedSpy.callCount).toBe(2);
            expect(devicesSpy.callCount).toBe(2);
            expect(toDeviceSpy.callCount).toBe(1);
            expect(result2).toMatchObject({
                algorithm: "m.megolm.v1.aes-sha2",
                sender_key: "BZ2AhgUQPramkd0qQ6m6rcIM9cMwNE1fjI784sW3dSM",
                ciphertext: expect.any(String),
                session_id: STATIC_OUTBOUND_SESSION.sessionId,
                device_id: TEST_DEVICE_ID,
            });

            const lastSent2 = await client.cryptoStore.getLastSentOutboundGroupSession(RECEIVER_DEVICE.user_id, RECEIVER_DEVICE.device_id, roomId);
            expect(lastSent2).toMatchObject({
                sessionId: STATIC_OUTBOUND_SESSION.sessionId,
                index: expect.any(Number),
            });
            expect(lastSent2.index).toEqual(lastSent.index);
        });
    });

    describe('processInboundDeviceMessage', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(async () => {
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedStaticOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            // client crypto not prepared for the one test which wants that state
        });

        afterEach(async () => {
            LogService.setLogger(new ConsoleLogger());
        });

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.processInboundDeviceMessage(null);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should ignore invalid formats', async () => {
            await client.crypto.prepare([]);

            const logSpy = simple.stub().callFn((mod, msg) => {
                expect(mod).toEqual("CryptoClient");
                expect(msg).toEqual("Received invalid encrypted message");
            });
            LogService.setLogger({ warn: logSpy } as any as ILogger);

            await client.crypto.processInboundDeviceMessage(null);
            await client.crypto.processInboundDeviceMessage(undefined);
            await client.crypto.processInboundDeviceMessage({
                content: null,
                type: "m.room.encrypted",
                sender: "@bob:example.org"
            });
            await client.crypto.processInboundDeviceMessage({
                type: "m.room.encrypted",
                sender: "@bob:example.org"
            } as any);
            await client.crypto.processInboundDeviceMessage({
                content: <any>{ msg: true },
                type: null,
                sender: "@bob:example.org"
            });
            await client.crypto.processInboundDeviceMessage({
                content: <any>{ msg: true },
                sender: "@bob:example.org"
            } as any);
            await client.crypto.processInboundDeviceMessage({
                content: <any>{ msg: true },
                type: "m.room.encrypted",
                sender: null
            });
            await client.crypto.processInboundDeviceMessage({
                content: <any>{ msg: true },
                type: "m.room.encrypted"
            } as any);
            expect(logSpy.callCount).toBe(8);
        });

        it('should ignore invalid message types', async () => {
            await client.crypto.prepare([]);

            const logSpy = simple.stub().callFn((mod, msg) => {
                expect(mod).toEqual("CryptoClient");
                expect(msg).toEqual("Unknown to-device message type: org.example");
            });
            LogService.setLogger({ warn: logSpy } as any as ILogger);

            await client.crypto.processInboundDeviceMessage({
                content: <any>{ test: true },
                type: "org.example",
                sender: "@bob:example.org"
            });
            expect(logSpy.callCount).toBe(1);
        });

        it('should ignore unknown algorithms', async () => {
            await client.crypto.prepare([]);

            const logSpy = simple.stub().callFn((mod, msg) => {
                expect(mod).toEqual("CryptoClient");
                expect(msg).toEqual("Received encrypted message with unknown encryption algorithm");
            });
            LogService.setLogger({ warn: logSpy } as any as ILogger);

            await client.crypto.processInboundDeviceMessage({
                content: <any>{
                    algorithm: "wrong",
                    ciphertext: {
                        "recv_key": {
                            type: 0,
                            body: "encrypted",
                        },
                    },
                    sender_key: "missing",
                },
                type: "m.room.encrypted",
                sender: "@bob:example.org",
            });
            expect(logSpy.callCount).toBe(1);
        });

        it('should ignore messages not intended for us', async () => {
            await client.crypto.prepare([]);

            const logSpy = simple.stub().callFn((mod, msg) => {
                expect(mod).toEqual("CryptoClient");
                expect(msg).toEqual("Received encrypted message not intended for us (ignoring message)");
            });
            LogService.setLogger({ warn: logSpy } as any as ILogger);

            await client.crypto.processInboundDeviceMessage({
                content: <any>{
                    algorithm: EncryptionAlgorithm.OlmV1Curve25519AesSha2,
                    ciphertext: {
                        "wrong_receive_key": {
                            type: 0,
                            body: "encrypted",
                        },
                    },
                    sender_key: "missing",
                },
                type: "m.room.encrypted",
                sender: "@bob:example.org",
            });
            expect(logSpy.callCount).toBe(1);
        });

        it('should ignore messages with invalid ciphertext', async () => {
            await client.crypto.prepare([]);

            const logSpy = simple.stub().callFn((mod, msg) => {
                expect(mod).toEqual("CryptoClient");
                expect(msg).toEqual("Received invalid encrypted message (ignoring message)");
            });
            LogService.setLogger({ warn: logSpy } as any as ILogger);

            await client.crypto.processInboundDeviceMessage({
                content: <any>{
                    algorithm: EncryptionAlgorithm.OlmV1Curve25519AesSha2,
                    ciphertext: {
                        [(<any>client.crypto).deviceCurve25519]: {
                            type: "test", // !!
                            body: "encrypted",
                        },
                    },
                    sender_key: "missing",
                },
                type: "m.room.encrypted",
                sender: "@bob:example.org",
            });
            await client.crypto.processInboundDeviceMessage({
                content: <any>{
                    algorithm: EncryptionAlgorithm.OlmV1Curve25519AesSha2,
                    ciphertext: {
                        [(<any>client.crypto).deviceCurve25519]: {
                            type: 0,
                            body: null, // !!
                        },
                    },
                    sender_key: "missing",
                },
                type: "m.room.encrypted",
                sender: "@bob:example.org",
            });
            expect(logSpy.callCount).toBe(2);
        });

        it('should ignore messages from unknown devices', async () => {
            await client.crypto.prepare([]);

            const logSpy = simple.stub().callFn((mod, msg) => {
                expect(mod).toEqual("CryptoClient");
                expect(msg).toEqual("Received encrypted message from unknown identity key (ignoring message):");
            });
            LogService.setLogger({ warn: logSpy } as any as ILogger);

            const sender = "@bob:example.org";
            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(sender);
                return [STATIC_TEST_DEVICES["NTTFKSVBSI"]];
            };

            await client.crypto.processInboundDeviceMessage({
                content: <any>{
                    algorithm: EncryptionAlgorithm.OlmV1Curve25519AesSha2,
                    ciphertext: {
                        [(<any>client.crypto).deviceCurve25519]: {
                            type: 0,
                            body: "encrypted",
                        },
                    },
                    sender_key: "missing",
                },
                type: "m.room.encrypted",
                sender: sender,
            });
            expect(logSpy.callCount).toBe(1);
        });

        describe('decryption', () => {
            const senderDevice: UserDevice = {
                user_id: "@bob:example.org",
                device_id: "TEST_DEVICE_FOR_SENDER",
                keys: {},
                signatures: {},
                algorithms: [EncryptionAlgorithm.MegolmV1AesSha2, EncryptionAlgorithm.OlmV1Curve25519AesSha2],
                unsigned: {},
            };
            const session: IOlmSession = {
                sessionId: "",
                pickled: "",
                lastDecryptionTs: Date.now(),
            };
            const altSession: IOlmSession = { // not used in encryption
                sessionId: "",
                pickled: "",
                lastDecryptionTs: Date.now(),
            };

            async function makeMessage(payload: IOlmPayload, inbounds = true): Promise<IToDeviceMessage<IOlmEncrypted>> {
                const senderAccount = new (await prepareOlm()).Account();
                const receiverAccount = await (<any>client.crypto).getOlmAccount();
                const session1 = new (await prepareOlm()).Session();
                const session2 = new (await prepareOlm()).Session();
                const session3 = new (await prepareOlm()).Session();
                const session4 = new (await prepareOlm()).Session();
                try {
                    senderAccount.create();

                    const keys = JSON.parse(senderAccount.identity_keys());
                    senderDevice.keys[`${DeviceKeyAlgorithm.Curve25519}:${senderDevice.device_id}`] = keys['curve25519'];
                    senderDevice.keys[`${DeviceKeyAlgorithm.Ed25519}:${senderDevice.device_id}`] = keys['ed25519'];

                    receiverAccount.generate_one_time_keys(2);
                    const { curve25519: otks } = JSON.parse(receiverAccount.one_time_keys());
                    const keyIds = Object.keys(otks);
                    const key1 = otks[keyIds[keyIds.length - 2]];
                    const key2 = otks[keyIds[keyIds.length - 1]];
                    receiverAccount.mark_keys_as_published();

                    session1.create_outbound(senderAccount, JSON.parse(receiverAccount.identity_keys())['curve25519'], key1);
                    session2.create_outbound(senderAccount, JSON.parse(receiverAccount.identity_keys())['curve25519'], key2);

                    if (payload.keys?.ed25519 === "populated") {
                        payload.keys.ed25519 = keys['ed25519'];
                    }

                    const encrypted1 = session1.encrypt(JSON.stringify(payload));
                    const encrypted2 = session2.encrypt(JSON.stringify(payload));

                    if (inbounds) {
                        session3.create_inbound_from(receiverAccount, keys['curve25519'], encrypted1.body);
                        session4.create_inbound_from(receiverAccount, keys['curve25519'], encrypted2.body);

                        session.sessionId = session3.session_id();
                        session.pickled = session3.pickle((<any>client.crypto).pickleKey);
                        altSession.sessionId = session4.session_id();
                        altSession.pickled = session4.pickle((<any>client.crypto).pickleKey);

                        receiverAccount.remove_one_time_keys(session3);
                        receiverAccount.remove_one_time_keys(session4);
                    }

                    return {
                        type: "m.room.encrypted",
                        content: {
                            algorithm: EncryptionAlgorithm.OlmV1Curve25519AesSha2,
                            sender_key: keys['curve25519'],
                            ciphertext: {
                                [JSON.parse(receiverAccount.identity_keys())['curve25519']]: encrypted1,
                            },
                        },
                        sender: senderDevice.user_id,
                    };
                } finally {
                    senderAccount.free();
                    session1.free();
                    session2.free();
                    session3.free();
                    session4.free();
                    await (<any>client.crypto).storeAndFreeOlmAccount(receiverAccount);
                }
            }

            beforeEach(async () => {
                await client.crypto.prepare([]);
                client.cryptoStore.getActiveUserDevices = async (uid) => {
                    expect(uid).toEqual(senderDevice.user_id);
                    return [senderDevice];
                };
                client.cryptoStore.getOlmSessions = async (uid, did) => {
                    expect(uid).toEqual(senderDevice.user_id);
                    expect(did).toEqual(senderDevice.device_id);
                    return [altSession, session];
                };

                session.pickled = "";
                session.sessionId = "";
                altSession.pickled = "";
                altSession.sessionId = "";

                LogService.setLogger({
                    error: (mod, msg, ...rest) => {
                        console.error(mod, msg, ...rest);
                        expect(mod).toEqual("CryptoClient");
                        expect(msg).not.toEqual("Non-fatal error while processing to-device message:");
                    },
                    warn: (...rest) => console.warn(...rest),
                } as any as ILogger);
            });

            afterEach(async () => {
                LogService.setLogger(new ConsoleLogger());
            });

            it('should decrypt with a known Olm session', async () => {
                const plaintext = {
                    keys: {
                        ed25519: "populated",
                    },
                    recipient_keys: {
                        ed25519: (<any>client.crypto).deviceEd25519,
                    },
                    recipient: await client.getUserId(),
                    sender: senderDevice.user_id,
                    content: {
                        tests: true,
                    },
                    type: "m.room_key",
                };
                const deviceMessage = await makeMessage(plaintext);

                const handleSpy = simple.stub().callFn(async (d, dev, m) => {
                    expect(d).toMatchObject(plaintext);
                    expect(dev).toMatchObject(senderDevice as any);
                    expect(m).toMatchObject(deviceMessage as any);
                });
                (<any>client.crypto).handleInboundRoomKey = handleSpy;

                await client.crypto.processInboundDeviceMessage(deviceMessage);
                expect(handleSpy.callCount).toBe(1);
            });

            it('should decrypt with an unknown but storable Olm session', async () => {
                const plaintext = {
                    keys: {
                        ed25519: "populated",
                    },
                    recipient_keys: {
                        ed25519: (<any>client.crypto).deviceEd25519,
                    },
                    recipient: await client.getUserId(),
                    sender: senderDevice.user_id,
                    content: {
                        tests: true,
                    },
                    type: "m.room_key",
                };
                const deviceMessage = await makeMessage(plaintext, false);

                const handleSpy = simple.stub().callFn(async (d, dev, m) => {
                    expect(d).toMatchObject(plaintext);
                    expect(dev).toMatchObject(senderDevice as any);
                    expect(m).toMatchObject(deviceMessage as any);
                });
                (<any>client.crypto).handleInboundRoomKey = handleSpy;

                const storeSpy = simple.stub().callFn(async (uid, did, s) => {
                    expect(uid).toEqual(senderDevice.user_id);
                    expect(did).toEqual(senderDevice.device_id);
                    expect(s).toMatchObject({
                        pickled: expect.any(String),
                        sessionId: expect.any(String),
                        lastDecryptionTs: expect.any(Number),
                    });
                });
                client.cryptoStore.storeOlmSession = storeSpy;

                client.cryptoStore.getOlmSessions = async (uid, did) => {
                    expect(uid).toEqual(senderDevice.user_id);
                    expect(did).toEqual(senderDevice.device_id);
                    return [];
                };

                await client.crypto.processInboundDeviceMessage(deviceMessage);
                expect(handleSpy.callCount).toBe(1);
                expect(storeSpy.callCount).toBe(2); // once for the inbound session, once after decrypt
            });

            it('should try to create a new Olm session with an unknown type 1 message', async () => {
                const plaintext = {
                    keys: {
                        ed25519: "populated",
                    },
                    recipient_keys: {
                        ed25519: (<any>client.crypto).deviceEd25519,
                    },
                    recipient: await client.getUserId(),
                    sender: senderDevice.user_id,
                    content: {
                        tests: true,
                    },
                    type: "m.room_key",
                };
                const deviceMessage = await makeMessage(plaintext, false);
                const ciphertext = deviceMessage['content']['ciphertext'];
                ciphertext[Object.keys(ciphertext)[0]]['type'] = 1;

                const handleSpy = simple.stub().callFn(async (d, dev, m) => {
                    expect(d).toMatchObject(plaintext);
                    expect(dev).toMatchObject(senderDevice as any);
                    expect(m).toMatchObject(deviceMessage as any);
                });
                (<any>client.crypto).handleInboundRoomKey = handleSpy;

                const storeSpy = simple.stub().callFn(async (uid, did, s) => {
                    expect(uid).toEqual(senderDevice.user_id);
                    expect(did).toEqual(senderDevice.device_id);
                    expect(s).toMatchObject({
                        pickled: expect.any(String),
                        sessionId: expect.any(String),
                        lastDecryptionTs: expect.any(Number),
                    });
                });
                client.cryptoStore.storeOlmSession = storeSpy;

                const establishSpy = simple.stub().callFn(async (d) => {
                    expect(d).toMatchObject(senderDevice as any);
                });
                (<any>client.crypto).establishNewOlmSession = establishSpy;

                client.cryptoStore.getOlmSessions = async (uid, did) => {
                    expect(uid).toEqual(senderDevice.user_id);
                    expect(did).toEqual(senderDevice.device_id);
                    return [];
                };

                await client.crypto.processInboundDeviceMessage(deviceMessage);
                expect(handleSpy.callCount).toBe(0);
                expect(storeSpy.callCount).toBe(0);
                expect(establishSpy.callCount).toBe(1);
            });

            it('should fail decryption if the message validation failed', async () => {
                let expectedAddl: any;
                let warnCalled = false;
                LogService.setLogger({
                    error: (mod, msg, ...rest) => {
                        console.error(mod, msg, ...rest);
                        expect(mod).toEqual("CryptoClient");
                        expect(msg).not.toEqual("Non-fatal error while processing to-device message:");
                    },
                    warn: (mod, msg, addl, ...rest) => {
                        console.warn(mod, msg, addl, ...rest);
                        warnCalled = true;
                        expect(mod).toEqual("CryptoClient");
                        expect(msg).toEqual("Successfully decrypted to-device message, but it failed validation. Ignoring message.");
                        expect(addl).toMatchObject(expectedAddl);
                    },
                } as any as ILogger);

                const plainTemplate = {
                    keys: {
                        ed25519: "populated",
                    },
                    recipient_keys: {
                        ed25519: (<any>client.crypto).deviceEd25519,
                    },
                    recipient: await client.getUserId(),
                    sender: senderDevice.user_id,
                    content: {
                        tests: true,
                    },
                    type: "m.room_key",
                };
                const addlTemplate = {
                    wasForUs: true,
                    wasFromThem: true,
                    hasType: true,
                    hasContent: true,
                    ourKeyMatches: true,
                    theirKeyMatches: true,
                };

                const makeTestCase = (p: Partial<typeof plainTemplate>, a: Partial<typeof addlTemplate>) => {
                    return [
                        JSON.parse(JSON.stringify({ ...plainTemplate, ...p })),
                        JSON.parse(JSON.stringify({ ...addlTemplate, ...a })),
                    ];
                };

                const cases = [
                    makeTestCase({ recipient: "@wrong:example.org" }, { wasForUs: false }),
                    makeTestCase({ sender: "@wrong:example.org" }, { wasFromThem: false }),
                    makeTestCase({ type: 12 } as any, { hasType: false }),
                    makeTestCase({ type: null } as any, { hasType: false }),
                    makeTestCase({ content: 12 } as any, { hasContent: false }),
                    makeTestCase({ content: null } as any, { hasContent: false }),
                    makeTestCase({ content: "wrong" } as any, { hasContent: false }),
                    makeTestCase({ recipient_keys: null }, { ourKeyMatches: false }),
                    makeTestCase({ recipient_keys: {} } as any, { ourKeyMatches: false }),
                    makeTestCase({ recipient_keys: { ed25519: "wrong" } }, { ourKeyMatches: false }),
                    makeTestCase({ keys: null }, { theirKeyMatches: false }),
                    makeTestCase({ keys: {} } as any, { theirKeyMatches: false }),
                    makeTestCase({ keys: { ed25519: "wrong" } }, { theirKeyMatches: false }),
                ];
                for (let i = 0; i < cases.length; i++) {
                    const testCase = cases[i];
                    const plaintext = testCase[0];
                    expectedAddl = testCase[1];
                    warnCalled = false;

                    console.log(JSON.stringify({ i, testCase }, null, 2));

                    const deviceMessage = await makeMessage(plaintext as any);

                    const handleSpy = simple.stub().callFn(async (d, dev, m) => {
                        expect(d).toMatchObject(plaintext);
                        expect(dev).toMatchObject(senderDevice as any);
                        expect(m).toMatchObject(deviceMessage as any);
                    });
                    (<any>client.crypto).handleInboundRoomKey = handleSpy;

                    await client.crypto.processInboundDeviceMessage(deviceMessage);
                    expect(handleSpy.callCount).toBe(0);
                    expect(warnCalled).toBe(true);
                }
            });
        });
    });

    describe('handleInboundRoomKey', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(async () => {
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedStaticOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            await client.crypto.prepare([]);
        });

        afterEach(async () => {
            LogService.setLogger(new ConsoleLogger());
        });

        it('should validate the incoming key', async () => {
            let expectedMessage = "";
            const logSpy = simple.stub().callFn((mod, msg) => {
                expect(mod).toEqual("CryptoClient");
                expect(msg).toEqual(expectedMessage);
            });
            LogService.setLogger({ warn: logSpy } as any as ILogger);

            const expectLogCall = () => {
                expect(logSpy.callCount).toBe(1);
                logSpy.reset();
            };

            expectedMessage = "Ignoring m.room_key for unknown encryption algorithm";
            await (<any>client.crypto).handleInboundRoomKey({ content: { algorithm: "wrong" } }, null, null);
            expectLogCall();
            await (<any>client.crypto).handleInboundRoomKey({ content: null }, null, null);
            expectLogCall();

            expectedMessage = "Ignoring invalid m.room_key";
            await (<any>client.crypto).handleInboundRoomKey({ content: { algorithm: EncryptionAlgorithm.MegolmV1AesSha2 } }, null, null);
            expectLogCall();
            await (<any>client.crypto).handleInboundRoomKey({
                content: {
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                    room_id: "test"
                }
            }, null, null);
            expectLogCall();
            await (<any>client.crypto).handleInboundRoomKey({
                content: {
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                    room_id: "test",
                    session_id: "test"
                }
            }, null, null);
            expectLogCall();

            expectedMessage = "Ignoring m.room_key message from unexpected sender";
            await (<any>client.crypto).handleInboundRoomKey({
                content: {
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                    room_id: "test",
                    session_id: "test",
                    session_key: "test"
                }
            }, {
                device_id: "DEVICE",
                keys: {
                    "curve25519:DEVICE": "key_goes_here",
                },
            }, {
                content: {
                    sender_key: "wrong",
                },
            });
            expectLogCall();
        });

        it('should not store known inbound sessions', async () => {
            const storeSpy = simple.stub().callFn(async () => {
                throw new Error("Called wrongly");
            });
            (<any>client.crypto).storeInboundGroupSession = storeSpy;

            const readSpy = simple.stub().callFn(async (uid, did, rid, sid) => {
                expect(uid).toEqual("@user:example.org");
                expect(did).toEqual("DEVICE");
                expect(rid).toEqual("!test:example.org");
                expect(sid).toEqual("test_session");
                return { testing: true } as any; // return value not important
            });
            client.cryptoStore.getInboundGroupSession = readSpy;

            await (<any>client.crypto).handleInboundRoomKey({
                content: {
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                    room_id: "!test:example.org",
                    session_id: "test_session",
                    session_key: "session_key_goes_here",
                },
            }, {
                device_id: "DEVICE",
                user_id: "@user:example.org",
                keys: {
                    "curve25519:DEVICE": "key_goes_here",
                },
            }, {
                content: {
                    sender_key: "key_goes_here",
                },
            });
            expect(storeSpy.callCount).toBe(0);
            expect(readSpy.callCount).toBe(1);
        });

        it('should store unknown inbound sessions', async () => {
            const content = {
                algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                room_id: "!test:example.org",
                session_id: "test_session",
                session_key: "session_key_goes_here",
            };
            const storeSpy = simple.stub().callFn(async (c, uid, did) => {
                expect(uid).toEqual("@user:example.org");
                expect(did).toEqual("DEVICE");
                expect(c).toMatchObject(content);
            });
            (<any>client.crypto).storeInboundGroupSession = storeSpy;

            const readSpy = simple.stub().callFn(async (uid, did, rid, sid) => {
                expect(uid).toEqual("@user:example.org");
                expect(did).toEqual("DEVICE");
                expect(rid).toEqual("!test:example.org");
                expect(sid).toEqual("test_session");
                return null; // assume not known
            });
            client.cryptoStore.getInboundGroupSession = readSpy;

            await (<any>client.crypto).handleInboundRoomKey({
                content: content,
            }, {
                device_id: "DEVICE",
                user_id: "@user:example.org",
                keys: {
                    "curve25519:DEVICE": "key_goes_here",
                },
            }, {
                content: {
                    sender_key: "key_goes_here",
                },
            });
            expect(storeSpy.callCount).toBe(1);
            expect(readSpy.callCount).toBe(1);
        });
    });

    describe('storeInboundGroupSession', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(async () => {
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedStaticOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            await client.crypto.prepare([]);
        });

        afterEach(async () => {
            LogService.setLogger(new ConsoleLogger());
        });

        it('should ignore mismatched session IDs', async () => {
            const session = new (await prepareOlm()).OutboundGroupSession();
            try {
                session.create();

                const key: IMRoomKey = {
                    session_key: session.session_key(),
                    session_id: "wrong",
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                    room_id: "!room:example.org",
                };

                const storeSpy = simple.stub().callFn(async (s) => {
                    expect(s).toMatchObject({
                        roomId: key.room_id,
                        sessionId: key.session_id,
                        senderDeviceId: TEST_DEVICE_ID,
                        senderUserId: userId,
                        pickled: expect.any(String),
                    });
                });
                client.cryptoStore.storeInboundGroupSession = storeSpy;

                const logSpy = simple.stub().callFn((mod, msg) => {
                    expect(mod).toEqual("CryptoClient");
                    expect(msg).toEqual("Ignoring m.room_key with mismatched session_id");
                });
                LogService.setLogger({ warn: logSpy } as any as ILogger);

                await (<any>client.crypto).storeInboundGroupSession(key, userId, TEST_DEVICE_ID);
                expect(logSpy.callCount).toBe(1);
                expect(storeSpy.callCount).toBe(0);
            } finally {
                session.free();
            }
        });

        it('should store sessions', async () => {
            const session = new (await prepareOlm()).OutboundGroupSession();
            try {
                session.create();

                const key: IMRoomKey = {
                    session_key: session.session_key(),
                    session_id: session.session_id(),
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                    room_id: "!room:example.org",
                };

                const storeSpy = simple.stub().callFn(async (s) => {
                    expect(s).toMatchObject({
                        roomId: key.room_id,
                        sessionId: key.session_id,
                        senderDeviceId: TEST_DEVICE_ID,
                        senderUserId: userId,
                        pickled: expect.any(String),
                    });
                });
                client.cryptoStore.storeInboundGroupSession = storeSpy;

                await (<any>client.crypto).storeInboundGroupSession(key, userId, TEST_DEVICE_ID);
                expect(storeSpy.callCount).toBe(1);
            } finally {
                session.free();
            }
        });
    });

    describe('establishNewOlmSession', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(async () => {
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedStaticOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            await client.crypto.prepare([]);
        });

        it('should force new session creation', async () => {
            const session = {
                test: true,
            };

            const device = {
                user_id: userId,
                device_id: TEST_DEVICE_ID,
                // rest don't matter
            };

            const genSpy = simple.stub().callFn(async (m, f) => {
                expect(m).toMatchObject({[userId]: [TEST_DEVICE_ID]});
                expect(f).toBe(true);
                return {
                    [userId]: {
                        [TEST_DEVICE_ID]: session,
                    },
                };
            });
            (<any>client.crypto).getOrCreateOlmSessions = genSpy;

            const sendSpy = simple.stub().callFn(async (d, s, t, c) => {
                expect(d).toMatchObject(device);
                expect(s).toMatchObject(session);
                expect(t).toEqual("m.dummy");
                expect(JSON.stringify(c)).toEqual("{}");
            });
            (<any>client.crypto).encryptAndSendOlmMessage = sendSpy;

            await (<any>client.crypto).establishNewOlmSession(device);
            expect(genSpy.callCount).toBe(1);
            expect(sendSpy.callCount).toBe(1);
        });
    });

    describe('decryptRoomEvent', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(async () => {
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedStaticOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            // client crypto not prepared for the one test which wants that state
        });

        afterEach(async () => {
            LogService.setLogger(new ConsoleLogger());
        });

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.decryptRoomEvent(null, null);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should fail if the algorithm is not known', async () => {
            await client.crypto.prepare([]);

            const event = new EncryptedRoomEvent({
                content: {
                    algorithm: "wrong",
                },
            });
            const roomId = "!room:example.org";

            try {
                await client.crypto.decryptRoomEvent(event, roomId);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Unable to decrypt: Unknown algorithm");
            }
        });

        it('should fail if the sending device is unknown', async () => {
            await client.crypto.prepare([]);

            const event = new EncryptedRoomEvent({
                content: {
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                    sender_key: "sender",
                    ciphertext: "cipher",
                    session_id: "session",
                    device_id: TEST_DEVICE_ID,
                },
                sender: userId,
            });
            const roomId = "!room:example.org";

            const getSpy = simple.stub().callFn(async (uid, did) => {
                expect(uid).toEqual(userId);
                expect(did).toEqual(event.content.device_id);
                return null;
            });
            client.cryptoStore.getActiveUserDevice = getSpy;

            try {
                await client.crypto.decryptRoomEvent(event, roomId);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Unable to decrypt: Unknown device for sender");
            }

            expect(getSpy.callCount).toBe(1);
        });

        it('should fail if the sending device has a key mismatch', async () => {
            await client.crypto.prepare([]);

            const event = new EncryptedRoomEvent({
                content: {
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                    sender_key: "wrong",
                    ciphertext: "cipher",
                    session_id: "session",
                    device_id: TEST_DEVICE_ID,
                },
                sender: userId,
            });
            const roomId = "!room:example.org";

            const getSpy = simple.stub().callFn(async (uid, did) => {
                expect(uid).toEqual(userId);
                expect(did).toEqual(event.content.device_id);
                return RECEIVER_DEVICE;
            });
            client.cryptoStore.getActiveUserDevice = getSpy;

            try {
                await client.crypto.decryptRoomEvent(event, roomId);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Unable to decrypt: Device key mismatch");
            }

            expect(getSpy.callCount).toBe(1);
        });

        it('should fail if the session is unknown', async () => {
            await client.crypto.prepare([]);

            const event = new EncryptedRoomEvent({
                content: {
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                    sender_key: RECEIVER_DEVICE.keys[`${DeviceKeyAlgorithm.Curve25519}:${RECEIVER_DEVICE.device_id}`],
                    ciphertext: "cipher",
                    session_id: "test",
                    device_id: TEST_DEVICE_ID,
                },
                sender: userId,
            });
            const roomId = "!room:example.org";

            const getDeviceSpy = simple.stub().callFn(async (uid, did) => {
                expect(uid).toEqual(userId);
                expect(did).toEqual(event.content.device_id);
                return RECEIVER_DEVICE;
            });
            client.cryptoStore.getActiveUserDevice = getDeviceSpy;

            const getSessionSpy = simple.stub().callFn(async (uid, did, rid, sid) => {
                expect(uid).toEqual(userId);
                expect(did).toEqual(event.content.device_id);
                expect(rid).toEqual(roomId);
                expect(sid).toEqual(event.content.session_id);
                return null;
            });
            client.cryptoStore.getInboundGroupSession = getSessionSpy;

            try {
                await client.crypto.decryptRoomEvent(event, roomId);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Unable to decrypt: Unknown inbound session ID");
            }

            expect(getDeviceSpy.callCount).toBe(1);
            expect(getSessionSpy.callCount).toBe(1);
        });

        it('should fail the decryption looks like a replay attack', async () => {
            await client.crypto.prepare([]);

            await client.cryptoStore.setActiveUserDevices(RECEIVER_DEVICE.user_id, [RECEIVER_DEVICE]);

            // Make an encrypted event, and store the outbound keys as inbound
            const plainType = "org.example.plain";
            const plainContent = {
                tests: true,
                hello: "world",
            };
            let event: EncryptedRoomEvent;
            const roomId = "!room:example.org";
            const outboundSession = new (await prepareOlm()).OutboundGroupSession();
            try {
                outboundSession.create();
                await (<any>client.crypto).storeInboundGroupSession({
                    room_id: roomId,
                    session_id: outboundSession.session_id(),
                    session_key: outboundSession.session_key(),
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                }, RECEIVER_DEVICE.user_id, RECEIVER_DEVICE.device_id);
                event = new EncryptedRoomEvent({
                    sender: RECEIVER_DEVICE.user_id,
                    type: "m.room.encrypted",
                    event_id: "$sent",
                    content: {
                        algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                        sender_key: RECEIVER_DEVICE.keys[`${DeviceKeyAlgorithm.Curve25519}:${RECEIVER_DEVICE.device_id}`],
                        ciphertext: outboundSession.encrypt(JSON.stringify({
                            type: plainType,
                            content: plainContent,
                            room_id: roomId,
                        })),
                        session_id: outboundSession.session_id(),
                        device_id: RECEIVER_DEVICE.device_id,
                    },
                });
            } finally {
                outboundSession.free();
            }

            const getIndexSpy = simple.stub().callFn(async (rid, sid, idx) => {
                expect(rid).toEqual(roomId);
                expect(sid).toEqual(event.content.session_id);
                expect(idx).toBe(0);
                return "$wrong";
            });
            client.cryptoStore.getEventForMessageIndex = getIndexSpy;

            try {
                await client.crypto.decryptRoomEvent(event, roomId);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Unable to decrypt: Message replay attack");
            }

            expect(getIndexSpy.callCount).toBe(1);
        });

        it('should succeed at re-decryption (valid replay)', async () => {
            await client.crypto.prepare([]);

            await client.cryptoStore.setActiveUserDevices(RECEIVER_DEVICE.user_id, [RECEIVER_DEVICE]);

            // Make an encrypted event, and store the outbound keys as inbound
            const plainType = "org.example.plain";
            const plainContent = {
                tests: true,
                hello: "world",
            };
            let event: EncryptedRoomEvent;
            const roomId = "!room:example.org";
            const outboundSession = new (await prepareOlm()).OutboundGroupSession();
            try {
                outboundSession.create();
                await (<any>client.crypto).storeInboundGroupSession({
                    room_id: roomId,
                    session_id: outboundSession.session_id(),
                    session_key: outboundSession.session_key(),
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                }, RECEIVER_DEVICE.user_id, RECEIVER_DEVICE.device_id);
                event = new EncryptedRoomEvent({
                    sender: RECEIVER_DEVICE.user_id,
                    type: "m.room.encrypted",
                    event_id: "$sent",
                    content: {
                        algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                        sender_key: RECEIVER_DEVICE.keys[`${DeviceKeyAlgorithm.Curve25519}:${RECEIVER_DEVICE.device_id}`],
                        ciphertext: outboundSession.encrypt(JSON.stringify({
                            type: plainType,
                            content: plainContent,
                            room_id: roomId,
                        })),
                        session_id: outboundSession.session_id(),
                        device_id: RECEIVER_DEVICE.device_id,
                    },
                });
            } finally {
                outboundSession.free();
            }

            const getIndexSpy = simple.stub().callFn(async (rid, sid, idx) => {
                expect(rid).toEqual(roomId);
                expect(sid).toEqual(event.content.session_id);
                expect(idx).toBe(0);
                return event.eventId;
            });
            client.cryptoStore.getEventForMessageIndex = getIndexSpy;

            const setIndexSpy = simple.stub().callFn(async (rid, eid, sid, idx) => {
                expect(rid).toEqual(roomId);
                expect(eid).toEqual(event.eventId);
                expect(sid).toEqual(event.content.session_id);
                expect(idx).toBe(0);
            });
            client.cryptoStore.setMessageIndexForEvent = setIndexSpy;

            const result = await client.crypto.decryptRoomEvent(event, roomId);
            expect(result).toBeDefined();
            expect(result.type).toEqual(plainType);
            expect(result.content).toMatchObject(plainContent);
            expect(result.raw).toMatchObject(Object.assign({}, event.raw, {type: plainType, content: plainContent}));
            expect(getIndexSpy.callCount).toBe(1);
            expect(setIndexSpy.callCount).toBe(1);
        });

        it('should succeed at decryption', async () => {
            await client.crypto.prepare([]);

            await client.cryptoStore.setActiveUserDevices(RECEIVER_DEVICE.user_id, [RECEIVER_DEVICE]);

            // Make an encrypted event, and store the outbound keys as inbound
            const plainType = "org.example.plain";
            const plainContent = {
                tests: true,
                hello: "world",
            };
            const roomId = "!room:example.org";
            let event: EncryptedRoomEvent;
            const outboundSession = new (await prepareOlm()).OutboundGroupSession();
            try {
                outboundSession.create();
                await (<any>client.crypto).storeInboundGroupSession({
                    room_id: roomId,
                    session_id: outboundSession.session_id(),
                    session_key: outboundSession.session_key(),
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                }, RECEIVER_DEVICE.user_id, RECEIVER_DEVICE.device_id);
                event = new EncryptedRoomEvent({
                    sender: RECEIVER_DEVICE.user_id,
                    type: "m.room.encrypted",
                    event_id: "$sent",
                    content: {
                        algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                        sender_key: RECEIVER_DEVICE.keys[`${DeviceKeyAlgorithm.Curve25519}:${RECEIVER_DEVICE.device_id}`],
                        ciphertext: outboundSession.encrypt(JSON.stringify({
                            type: plainType,
                            content: plainContent,
                            room_id: roomId,
                        })),
                        session_id: outboundSession.session_id(),
                        device_id: RECEIVER_DEVICE.device_id,
                    },
                });
            } finally {
                outboundSession.free();
            }

            const getIndexSpy = simple.stub().callFn(async (rid, sid, idx) => {
                expect(rid).toEqual(roomId);
                expect(sid).toEqual(event.content.session_id);
                expect(idx).toBe(0);
                return null; // assume not known
            });
            client.cryptoStore.getEventForMessageIndex = getIndexSpy;

            const setIndexSpy = simple.stub().callFn(async (rid, eid, sid, idx) => {
                expect(rid).toEqual(roomId);
                expect(eid).toEqual(event.eventId);
                expect(sid).toEqual(event.content.session_id);
                expect(idx).toBe(0);
            });
            client.cryptoStore.setMessageIndexForEvent = setIndexSpy;

            const result = await client.crypto.decryptRoomEvent(event, roomId);
            expect(result).toBeDefined();
            expect(result.type).toEqual(plainType);
            expect(result.content).toMatchObject(plainContent);
            expect(result.raw).toMatchObject(Object.assign({}, event.raw, {type: plainType, content: plainContent}));
            expect(getIndexSpy.callCount).toBe(1);
            expect(setIndexSpy.callCount).toBe(1);
        });
    });

    describe('encryptMedia', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(async () => {
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedStaticOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            // client crypto not prepared for the one test which wants that state
        });

        afterEach(async () => {
            LogService.setLogger(new ConsoleLogger());
        });

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.encryptMedia(null);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should encrypt media', async () => {
            await client.crypto.prepare([]);

            const inputBuffer = Buffer.from("test");
            const inputStr = inputBuffer.join('');

            const result = await client.crypto.encryptMedia(inputBuffer);
            expect(result).toBeDefined();
            expect(result.buffer).toBeDefined();
            expect(result.buffer.join('')).not.toEqual(inputStr);
            expect(result.file).toBeDefined();
            expect(result.file.hashes).toBeDefined();
            expect(result.file.hashes.sha256).not.toEqual("n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg");
            expect(result.file).toMatchObject({
                hashes: {
                    sha256: expect.any(String),
                },
                key: {
                    alg: "A256CTR",
                    ext: true,
                    key_ops: ['encrypt', 'decrypt'],
                    kty: "oct",
                    k: expect.any(String),
                },
                iv: expect.any(String),
                v: "v2",
            });
        });
    });

    describe('decryptMedia', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        // Created from Element Web
        const testFileContents = "THIS IS A TEST FILE.";
        const mediaFileContents = Buffer.from("eB15hJlkw8WwgYxwY2mu8vS250s=", "base64");
        const testFile: EncryptedFile = {
            v: "v2",
            key: {
                alg: "A256CTR",
                ext: true,
                k: "l3OtQ3IJzfJa85j2WMsqNu7J--C-I1hzPxFvinR48mM",
                key_ops: [
                    "encrypt",
                    "decrypt"
                ],
                kty: "oct"
            },
            iv: "KJQOebQS1wwAAAAAAAAAAA",
            hashes: {
                sha256: "Qe4YzmVoPaEcLQeZwFZ4iMp/dlgeFph6mi5DmCaCOzg"
            },
            url: "mxc://localhost/uiWuISEVWixompuiiYyUoGrx",
        };

        function copyOfTestFile(): EncryptedFile {
            return JSON.parse(JSON.stringify(testFile));
        }

        beforeEach(async () => {
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedStaticOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            // client crypto not prepared for the one test which wants that state
        });

        afterEach(async () => {
            LogService.setLogger(new ConsoleLogger());
        });

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.encryptMedia(null);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should be symmetrical', async () => {
            await client.crypto.prepare([]);

            const mxc = "mxc://example.org/test";
            const inputBuffer = Buffer.from("test");
            const encrypted = await client.crypto.encryptMedia(inputBuffer);

            const downloadSpy = simple.stub().callFn(async (u) => {
                expect(u).toEqual(mxc);
                return {data: encrypted.buffer, contentType: "application/octet-stream"};
            });
            client.downloadContent = downloadSpy;

            const result = await client.crypto.decryptMedia({
                url: mxc,
                ...encrypted.file,
            });
            expect(result.join('')).toEqual(inputBuffer.join(''));
            expect(downloadSpy.callCount).toBe(1);
        });

        it('should fail on unknown or invalid fields', async () => {
            await client.crypto.prepare([]);

            try {
                const f = copyOfTestFile();
                // @ts-ignore
                f.v = "wrong";
                await client.crypto.decryptMedia(f);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Unknown encrypted file version");
            }

            try {
                const f = copyOfTestFile();
                // @ts-ignore
                f.key.kty = "wrong";
                await client.crypto.decryptMedia(f);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Improper JWT: Missing or invalid fields");
            }

            try {
                const f = copyOfTestFile();
                // @ts-ignore
                f.key.alg = "wrong";
                await client.crypto.decryptMedia(f);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Improper JWT: Missing or invalid fields");
            }

            try {
                const f = copyOfTestFile();
                // @ts-ignore
                f.key.ext = "wrong";
                await client.crypto.decryptMedia(f);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Improper JWT: Missing or invalid fields");
            }

            try {
                const f = copyOfTestFile();
                // @ts-ignore
                f.key.key_ops = ["wrong"];
                await client.crypto.decryptMedia(f);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Missing required key_ops");
            }

            try {
                const f = copyOfTestFile();
                // @ts-ignore
                f.hashes = {};
                await client.crypto.decryptMedia(f);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Missing SHA256 hash");
            }
        });

        it('should fail on mismatched SHA256 hashes', async () => {
            await client.crypto.prepare([]);

            const downloadSpy = simple.stub().callFn(async (u) => {
                expect(u).toEqual(testFile.url);
                return {data: Buffer.from(mediaFileContents), contentType: "application/octet-stream"};
            });
            client.downloadContent = downloadSpy;

            try {
                const f = copyOfTestFile();
                f.hashes.sha256 = "wrong";
                await client.crypto.decryptMedia(f);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("SHA256 mismatch");
            }

            expect(downloadSpy.callCount).toBe(1);
        });

        it('should decrypt', async () => {
            await client.crypto.prepare([]);

            const downloadSpy = simple.stub().callFn(async (u) => {
                expect(u).toEqual(testFile.url);
                return {data: Buffer.from(mediaFileContents), contentType: "application/octet-stream"};
            });
            client.downloadContent = downloadSpy;

            const f = copyOfTestFile();
            const result = await client.crypto.decryptMedia(f);
            expect(result.toString()).toEqual(testFileContents);
            expect(downloadSpy.callCount).toBe(1);
        });
    });

    describe('updateFallbackKey', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(async () => {
            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedStaticOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            // client crypto not prepared for the one test which wants that state
        });

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.updateFallbackKey();

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should create new keys', async () => {
            await client.crypto.prepare([]);

            const uploadSpy = simple.stub().callFn(async (k) => {
                expect(k).toMatchObject({
                    keyId: expect.any(String),
                    key: {
                        key: expect.any(String),
                        fallback: true,
                        signatures: {
                            [userId]: {
                                [`${DeviceKeyAlgorithm.Ed25519}:${TEST_DEVICE_ID}`]: expect.any(String),
                            },
                        },
                    },
                });
                return null; // return not used
            });
            client.uploadFallbackKey = uploadSpy;

            await client.crypto.updateFallbackKey();
            expect(uploadSpy.callCount).toBe(1);
        });
    });
});

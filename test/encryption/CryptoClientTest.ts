import * as expect from "expect";
import * as simple from "simple-mock";
import {
    DeviceKeyAlgorithm,
    EncryptionAlgorithm,
    IOlmSession,
    MatrixClient,
    OTKAlgorithm,
    OTKCounts,
    RoomEncryptionAlgorithm,
} from "../../src";
import { createTestClient, TEST_DEVICE_ID } from "../MatrixClientTest";
import {
    feedOlmAccount,
    feedStaticOlmAccount,
    RECEIVER_DEVICE,
    RECEIVER_OLM_SESSION,
    STATIC_OUTBOUND_SESSION
} from "../TestUtils";
import { DeviceTracker } from "../../src/e2ee/DeviceTracker";

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
                await client.crypto.sign({doesnt: "matter"});

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
            result = await client.crypto.verifySignature({wrong: "object"}, key, signature);
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
                return {one_time_keys: {}, failures: {}};
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
                return {one_time_keys: {}, failures: {}};
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
                                            [`${DeviceKeyAlgorithm.Ed25119}:${claimDeviceId}`]: "Definitely real",
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

            client.cryptoStore.getUserDevices = async (uid) => {
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
                                            [`${DeviceKeyAlgorithm.Ed25119}:${targetDeviceId}`]: "Definitely real",
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
                                            [`${DeviceKeyAlgorithm.Ed25119}:${claimDeviceId}`]: "Definitely real",
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

            client.cryptoStore.getUserDevices = async (uid) => {
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
                                            [`${DeviceKeyAlgorithm.Ed25119}:${targetDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                            [claimDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${claimDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures: {
                                        [claimUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25119}:${claimDeviceId}`]: "Definitely real",
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

            client.cryptoStore.getUserDevices = async (uid) => {
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
                                            [`${DeviceKeyAlgorithm.Ed25119}:${targetDeviceId}`]: "Definitely real",
                                        },
                                    },
                                },
                            },
                            [claimDeviceId]: {
                                [`${OTKAlgorithm.Signed}:${claimDeviceId}`]: {
                                    key: "zKbLg+NrIjpnagy+pIY6uPL4ZwEG2v+8F9lmgsnlZzs",
                                    signatures: {
                                        [claimUserId]: {
                                            [`${DeviceKeyAlgorithm.Ed25119}:${claimDeviceId}`]: "Definitely real",
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

            client.cryptoStore.getUserDevices = async (uid) => {
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
                                            [`${DeviceKeyAlgorithm.Ed25119}:${claimDeviceId}`]: "Definitely real",
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

            client.cryptoStore.getUserDevices = async (uid) => {
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
                                            [`${DeviceKeyAlgorithm.Ed25119}:${claimDeviceId}`]: "Definitely real",
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

            client.cryptoStore.getUserDevices = async (uid) => {
                expect(uid).toEqual(claimUserId);
                return [{
                    user_id: claimUserId,
                    device_id: claimDeviceId,
                    keys: {
                        [`${DeviceKeyAlgorithm.Curve25519}:${claimDeviceId}`]: "zPsrUlEM3DKRcBYKMHgZTLmYJU1FJDzBRnH6DsTxHH8",
                        [`${DeviceKeyAlgorithm.Ed25119}:${claimDeviceId}`]: "ED25519 KEY GOES HERE",
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
                            [`${DeviceKeyAlgorithm.Ed25119}:${claimDeviceId}`]: "Definitely real",
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
                                            [`${DeviceKeyAlgorithm.Ed25119}:${claimDeviceId}`]: "Definitely real",
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

            client.cryptoStore.getUserDevices = async (uid) => {
                expect(uid).toEqual(claimUserId);
                return [{
                    user_id: claimUserId,
                    device_id: claimDeviceId,
                    keys: {
                        [`${DeviceKeyAlgorithm.Curve25519}:${claimDeviceId}`]: "zPsrUlEM3DKRcBYKMHgZTLmYJU1FJDzBRnH6DsTxHH8",
                        [`${DeviceKeyAlgorithm.Ed25119}:${claimDeviceId}`]: "ED25519 KEY GOES HERE",
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
                expect(s.usesLeft).toBe(rotationIntervals);
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
                expect(s.usesLeft).toBe(rotationIntervals);
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
                expect(s.usesLeft).toBe(rotationIntervals);
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
        });

        it.skip('should store created outbound sessions as inbound sessions', async () => {
            // TODO: Merge into above test when functionality exists.
        });

        it.skip('should get devices for invited members', async () => {
            // TODO: Support invited members, if history visibility would allow.
        });
    });
});

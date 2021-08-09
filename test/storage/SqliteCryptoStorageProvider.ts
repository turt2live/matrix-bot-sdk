import * as expect from "expect";
import * as tmp from "tmp";
import { SqliteCryptoStorageProvider } from "../../src/storage/SqliteCryptoStorageProvider";
import { TEST_DEVICE_ID } from "../MatrixClientTest";
import { EncryptionAlgorithm, IOlmSession } from "../../src";

tmp.setGracefulCleanup();

describe('SqliteCryptoStorageProvider', () => {
    it('should return the right device ID', async () => {
        const name = tmp.fileSync().name;
        let store = new SqliteCryptoStorageProvider(name);

        expect(await store.getDeviceId()).toBeFalsy();
        await store.setDeviceId(TEST_DEVICE_ID);
        expect(await store.getDeviceId()).toEqual(TEST_DEVICE_ID);
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.getDeviceId()).toEqual(TEST_DEVICE_ID);
        await store.close();
    });

    it('should return the right pickle key', async () => {
        const name = tmp.fileSync().name;
        let store = new SqliteCryptoStorageProvider(name);

        expect(await store.getPickleKey()).toBeFalsy();
        await store.setPickleKey("pickle");
        expect(await store.getPickleKey()).toEqual("pickle");
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.getPickleKey()).toEqual("pickle");
        await store.close();
    });

    it('should return the right pickle account', async () => {
        const name = tmp.fileSync().name;
        let store = new SqliteCryptoStorageProvider(name);

        expect(await store.getPickledAccount()).toBeFalsy();
        await store.setPickledAccount("pickled");
        expect(await store.getPickledAccount()).toEqual("pickled");
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.getPickledAccount()).toEqual("pickled");
        await store.close();
    });

    it('should store rooms', async () => {
        const roomId1 = "!first:example.org";
        const roomId2 = "!second:example.org";
        const roomId3 = "!no_config:example.org";

        const config1: any = {val: "test"};
        const config2 = {algorithm: EncryptionAlgorithm.MegolmV1AesSha2};

        const name = tmp.fileSync().name;
        let store = new SqliteCryptoStorageProvider(name);
        expect(await store.getRoom(roomId1)).toBeFalsy();
        expect(await store.getRoom(roomId2)).toBeFalsy();
        expect(await store.getRoom(roomId3)).toBeFalsy();
        await store.storeRoom(roomId1, config1);
        expect(await store.getRoom(roomId1)).toMatchObject(config1);
        expect(await store.getRoom(roomId2)).toBeFalsy();
        expect(await store.getRoom(roomId3)).toBeFalsy();
        await store.storeRoom(roomId2, config2);
        expect(await store.getRoom(roomId1)).toMatchObject(config1);
        expect(await store.getRoom(roomId2)).toMatchObject(config2);
        expect(await store.getRoom(roomId3)).toBeFalsy();
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.getRoom(roomId1)).toMatchObject(config1);
        expect(await store.getRoom(roomId2)).toMatchObject(config2);
        expect(await store.getRoom(roomId3)).toBeFalsy();
        await store.close();
    });

    it('should flag users as outdated by default', async () => {
        const userId = "@user:example.org";

        const name = tmp.fileSync().name;
        let store = new SqliteCryptoStorageProvider(name);
        expect(await store.isUserOutdated(userId)).toEqual(true);
        await store.flagUsersOutdated([userId]);
        expect(await store.isUserOutdated(userId)).toEqual(true);
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.isUserOutdated(userId)).toEqual(true);
        await store.setUserDevices(userId, []);
        expect(await store.isUserOutdated(userId)).toEqual(false);
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.isUserOutdated(userId)).toEqual(false);
        await store.close();
    });

    it('should track multiple users', async () => {
        const userId1 = "@user:example.org";
        const userId2 = "@two:example.org";

        // Not real UserDevices, but this is a test.
        const devices1: any = [{device_id: "one"}, {device_id: "two"}];
        const devices2: any = [{device_id: "three"}, {device_id: "four"}];

        const deviceSortFn = (a, b) => a.device_id < b.device_id ? -1 : (a.device_id === b.device_id ? 0 : 1);

        const name = tmp.fileSync().name;
        let store = new SqliteCryptoStorageProvider(name);

        expect(await store.isUserOutdated(userId1)).toEqual(true);
        expect(await store.isUserOutdated(userId2)).toEqual(true);
        await store.setUserDevices(userId1, devices1);
        await store.setUserDevices(userId2, devices2);
        expect(await store.isUserOutdated(userId1)).toEqual(false);
        expect(await store.isUserOutdated(userId2)).toEqual(false);
        expect((await store.getUserDevices(userId1)).sort(deviceSortFn)).toEqual(devices1.sort(deviceSortFn));
        expect((await store.getUserDevices(userId2)).sort(deviceSortFn)).toEqual(devices2.sort(deviceSortFn));
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.isUserOutdated(userId1)).toEqual(false);
        expect(await store.isUserOutdated(userId2)).toEqual(false);
        expect((await store.getUserDevices(userId1)).sort(deviceSortFn)).toEqual(devices1.sort(deviceSortFn));
        expect((await store.getUserDevices(userId2)).sort(deviceSortFn)).toEqual(devices2.sort(deviceSortFn));
        await store.flagUsersOutdated([userId1, userId2]);
        expect(await store.isUserOutdated(userId1)).toEqual(true);
        expect(await store.isUserOutdated(userId2)).toEqual(true);
        expect((await store.getUserDevices(userId1)).sort(deviceSortFn)).toEqual(devices1.sort(deviceSortFn));
        expect((await store.getUserDevices(userId2)).sort(deviceSortFn)).toEqual(devices2.sort(deviceSortFn));
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.isUserOutdated(userId1)).toEqual(true);
        expect(await store.isUserOutdated(userId2)).toEqual(true);
        expect((await store.getUserDevices(userId1)).sort(deviceSortFn)).toEqual(devices1.sort(deviceSortFn));
        expect((await store.getUserDevices(userId2)).sort(deviceSortFn)).toEqual(devices2.sort(deviceSortFn));
        await store.close();
    });

    it('should track current outbound sessions', async () =>  {
        const sessionIds = ["one", "two", "3"];
        const roomIds = ["!one:example.org", "!one:example.org", "!one:example.org"]; // all the same room ID intentionally
        const pickles = ["p1", "p2", "p3"];
        const expiresTs = Date.now();
        const usesLeft = 101;

        const name = tmp.fileSync().name;
        let store = new SqliteCryptoStorageProvider(name);

        await store.storeOutboundGroupSession({
            sessionId: sessionIds[0],
            roomId: roomIds[0],
            pickled: pickles[0],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: false,
        });
        await store.storeOutboundGroupSession({
            sessionId: sessionIds[1],
            roomId: roomIds[1],
            pickled: pickles[1],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        await store.storeOutboundGroupSession({
            sessionId: sessionIds[2],
            roomId: roomIds[2],
            pickled: pickles[2],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: false,
        });
        expect(await store.getOutboundGroupSession(sessionIds[0], roomIds[0])).toMatchObject({
            sessionId: sessionIds[0],
            roomId: roomIds[0],
            pickled: pickles[0],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: false,
        });
        expect(await store.getOutboundGroupSession(sessionIds[1], roomIds[1])).toMatchObject({
            sessionId: sessionIds[1],
            roomId: roomIds[1],
            pickled: pickles[1],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        expect(await store.getOutboundGroupSession(sessionIds[2], roomIds[2])).toMatchObject({
            sessionId: sessionIds[2],
            roomId: roomIds[2],
            pickled: pickles[2],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: false,
        });
        expect(await store.getCurrentOutboundGroupSession(roomIds[0])).toMatchObject({ // just testing the flag
            sessionId: sessionIds[1],
            roomId: roomIds[1],
            pickled: pickles[1],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.getOutboundGroupSession(sessionIds[0], roomIds[0])).toMatchObject({
            sessionId: sessionIds[0],
            roomId: roomIds[0],
            pickled: pickles[0],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: false,
        });
        expect(await store.getOutboundGroupSession(sessionIds[1], roomIds[1])).toMatchObject({
            sessionId: sessionIds[1],
            roomId: roomIds[1],
            pickled: pickles[1],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        expect(await store.getOutboundGroupSession(sessionIds[2], roomIds[2])).toMatchObject({
            sessionId: sessionIds[2],
            roomId: roomIds[2],
            pickled: pickles[2],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: false,
        });
        expect(await store.getCurrentOutboundGroupSession(roomIds[0])).toMatchObject({ // just testing the flag
            sessionId: sessionIds[1],
            roomId: roomIds[1],
            pickled: pickles[1],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        await store.close();
    });

    it('should overwrite any previously current outbound sessions', async () => {
        const sessionIds = ["one", "two", "3"];
        const roomIds = ["!one:example.org", "!one:example.org", "!one:example.org"]; // all the same room ID intentionally
        const pickles = ["p1", "p2", "p3"];
        const expiresTs = Date.now();
        const usesLeft = 101;

        const name = tmp.fileSync().name;
        let store = new SqliteCryptoStorageProvider(name);

        await store.storeOutboundGroupSession({
            sessionId: sessionIds[0],
            roomId: roomIds[0],
            pickled: pickles[0],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        await store.storeOutboundGroupSession({
            sessionId: sessionIds[1],
            roomId: roomIds[1],
            pickled: pickles[1],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        await store.storeOutboundGroupSession({
            sessionId: sessionIds[2],
            roomId: roomIds[2],
            pickled: pickles[2],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        expect(await store.getOutboundGroupSession(sessionIds[0], roomIds[0])).toMatchObject({
            sessionId: sessionIds[0],
            roomId: roomIds[0],
            pickled: pickles[0],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: false,
        });
        expect(await store.getOutboundGroupSession(sessionIds[1], roomIds[1])).toMatchObject({
            sessionId: sessionIds[1],
            roomId: roomIds[1],
            pickled: pickles[1],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: false,
        });
        expect(await store.getOutboundGroupSession(sessionIds[2], roomIds[2])).toMatchObject({
            sessionId: sessionIds[2],
            roomId: roomIds[2],
            pickled: pickles[2],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        expect(await store.getCurrentOutboundGroupSession(roomIds[0])).toMatchObject({ // just testing the flag
            sessionId: sessionIds[2],
            roomId: roomIds[2],
            pickled: pickles[2],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.getOutboundGroupSession(sessionIds[0], roomIds[0])).toMatchObject({
            sessionId: sessionIds[0],
            roomId: roomIds[0],
            pickled: pickles[0],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: false,
        });
        expect(await store.getOutboundGroupSession(sessionIds[1], roomIds[1])).toMatchObject({
            sessionId: sessionIds[1],
            roomId: roomIds[1],
            pickled: pickles[1],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: false,
        });
        expect(await store.getOutboundGroupSession(sessionIds[2], roomIds[2])).toMatchObject({
            sessionId: sessionIds[2],
            roomId: roomIds[2],
            pickled: pickles[2],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        expect(await store.getCurrentOutboundGroupSession(roomIds[0])).toMatchObject({ // just testing the flag
            sessionId: sessionIds[2],
            roomId: roomIds[2],
            pickled: pickles[2],
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        await store.close();
    });

    it('should count usages of outbound sessions', async () => {
        const sessionId = "session";
        const roomId = "!room:example.org";
        const usesLeft = 100;
        const expiresTs = Date.now();
        const pickle = "pickled";

        const name = tmp.fileSync().name;
        let store = new SqliteCryptoStorageProvider(name);

        await store.storeOutboundGroupSession({
            sessionId: sessionId,
            roomId: roomId,
            pickled: pickle,
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        expect(await store.getOutboundGroupSession(sessionId, roomId)).toMatchObject({
            sessionId: sessionId,
            roomId: roomId,
            pickled: pickle,
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        });
        await store.useOutboundGroupSession(sessionId, roomId);
        expect(await store.getOutboundGroupSession(sessionId, roomId)).toMatchObject({
            sessionId: sessionId,
            roomId: roomId,
            pickled: pickle,
            expiresTs: expiresTs,
            usesLeft: usesLeft - 1,
            isCurrent: true,
        });
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.getOutboundGroupSession(sessionId, roomId)).toMatchObject({
            sessionId: sessionId,
            roomId: roomId,
            pickled: pickle,
            expiresTs: expiresTs,
            usesLeft: usesLeft - 1,
            isCurrent: true,
        });
        await store.close();
    });

    it('should track sent outbound sessions', async () => {
        const sessionId = "session";
        const roomId = "!room:example.org";
        const usesLeft = 100;
        const expiresTs = Date.now();
        const pickle = "pickled";
        const userId = "@user:example.org";
        const index = 1;
        const deviceId = "DEVICE";

        const name = tmp.fileSync().name;
        let store = new SqliteCryptoStorageProvider(name);

        await store.storeSentOutboundGroupSession({
            sessionId: sessionId,
            roomId: roomId,
            pickled: pickle,
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        }, index, {
            device_id: deviceId,
            keys: {},
            user_id: userId,
            signatures: {},
            algorithms: [EncryptionAlgorithm.MegolmV1AesSha2],
            unsigned: {},
        });
        await store.storeSentOutboundGroupSession({
            sessionId: sessionId,
            roomId: roomId,
            pickled: pickle,
            expiresTs: expiresTs,
            usesLeft: usesLeft,
            isCurrent: true,
        }, index, {
            device_id: deviceId + "_NOTUSED",
            keys: {},
            user_id: userId,
            signatures: {},
            algorithms: [EncryptionAlgorithm.MegolmV1AesSha2],
            unsigned: {},
        });
        expect(await store.getLastSentOutboundGroupSession(userId, deviceId, roomId)).toMatchObject({
            sessionId: sessionId,
            index: index,
        });
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.getLastSentOutboundGroupSession(userId, deviceId, roomId)).toMatchObject({
            sessionId: sessionId,
            index: index,
        });
        await store.close();
    });

    it('should fetch single user devices', async () => {
        const userId1 = "@user:example.org";
        const userId2 = "@two:example.org";

        // Not real UserDevices, but this is a test.
        const devices1: any = [{device_id: "one"}, {device_id: "two"}];
        const devices2: any = [{device_id: "three"}, {device_id: "four"}];

        const name = tmp.fileSync().name;
        let store = new SqliteCryptoStorageProvider(name);

        await store.setUserDevices(userId1, devices1);
        await store.setUserDevices(userId2, devices2);
        expect(await store.getUserDevice(userId1, devices1[0].device_id)).toMatchObject(devices1[0]);
        expect(await store.getUserDevice(userId1, devices1[1].device_id)).toMatchObject(devices1[1]);
        expect(await store.getUserDevice(userId2, devices2[0].device_id)).toMatchObject(devices2[0]);
        expect(await store.getUserDevice(userId2, devices2[1].device_id)).toMatchObject(devices2[1]);
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.getUserDevice(userId1, devices1[0].device_id)).toMatchObject(devices1[0]);
        expect(await store.getUserDevice(userId1, devices1[1].device_id)).toMatchObject(devices1[1]);
        expect(await store.getUserDevice(userId2, devices2[0].device_id)).toMatchObject(devices2[0]);
        expect(await store.getUserDevice(userId2, devices2[1].device_id)).toMatchObject(devices2[1]);
        await store.close();
    });

    it('should track current Olm sessions', async () => {
        const userId1 = "@user:example.org";
        const userId2 = "@two:example.org";

        const deviceId1 = "ONE";
        const deviceId2 = "TWO";

        const session1: IOlmSession = {
            sessionId: "SESSION_ONE",
            pickled: "pickled_one",
            lastDecryptionTs: Date.now(),
        };
        const session2: IOlmSession = {
            sessionId: "SESSION_TWO",
            pickled: "pickled_two",
            lastDecryptionTs: Date.now() + 5,
        };
        const session3: IOlmSession = {
            sessionId: "SESSION_THREE",
            pickled: "pickled_three",
            lastDecryptionTs: Date.now() - 10,
        };
        const session4: IOlmSession = {
            sessionId: "SESSION_FOUR",
            pickled: "pickled_four",
            lastDecryptionTs: Date.now() + 10,
        };

        const name = tmp.fileSync().name;
        let store = new SqliteCryptoStorageProvider(name);

        await store.storeOlmSession(userId1, deviceId1, session1);
        await store.storeOlmSession(userId2, deviceId2, session2);
        expect(await store.getCurrentOlmSession(userId1, deviceId1)).toMatchObject(session1 as any);
        expect(await store.getCurrentOlmSession(userId2, deviceId2)).toMatchObject(session2 as any);
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.getCurrentOlmSession(userId1, deviceId1)).toMatchObject(session1 as any);
        expect(await store.getCurrentOlmSession(userId2, deviceId2)).toMatchObject(session2 as any);

        // insert an updated session for the first user to ensure the lastDecryptionTs logic works
        await store.storeOlmSession(userId1, deviceId1, session4);
        expect(await store.getCurrentOlmSession(userId1, deviceId1)).toMatchObject(session4 as any);
        expect(await store.getCurrentOlmSession(userId2, deviceId2)).toMatchObject(session2 as any);
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.getCurrentOlmSession(userId1, deviceId1)).toMatchObject(session4 as any);
        expect(await store.getCurrentOlmSession(userId2, deviceId2)).toMatchObject(session2 as any);

        // now test that we'll keep session 4 even after inserting session 3 (an older session)
        await store.storeOlmSession(userId1, deviceId1, session3);
        expect(await store.getCurrentOlmSession(userId1, deviceId1)).toMatchObject(session4 as any);
        expect(await store.getCurrentOlmSession(userId2, deviceId2)).toMatchObject(session2 as any);
        await store.close();
        store = new SqliteCryptoStorageProvider(name);
        expect(await store.getCurrentOlmSession(userId1, deviceId1)).toMatchObject(session4 as any);
        expect(await store.getCurrentOlmSession(userId2, deviceId2)).toMatchObject(session2 as any);

        await store.close();
    });
});

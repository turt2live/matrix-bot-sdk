import * as expect from "expect";
import * as tmp from "tmp";
import { SqliteCryptoStorageProvider } from "../../src/storage/SqliteCryptoStorageProvider";
import { TEST_DEVICE_ID } from "../MatrixClientTest";
import { EncryptionAlgorithm } from "../../src";

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
});

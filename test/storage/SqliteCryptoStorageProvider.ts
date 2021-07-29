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
});

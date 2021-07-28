import * as expect from "expect";
import * as simple from "simple-mock";
import { EncryptionEventContent, MatrixClient, RoomEncryptionAlgorithm, RoomTracker } from "../../src";
import { createTestClient } from "../MatrixClientTest";

function prepareQueueSpies(client: MatrixClient, roomId: string, content: Partial<EncryptionEventContent> = {}, storedContent: Partial<EncryptionEventContent> = null): simple.Stub<any>[] {
    const readSpy = simple.stub().callFn<any>((key: string) => {
        expect(key).toEqual("tracked_room." + roomId);
        return Promise.resolve(storedContent ? JSON.stringify(storedContent) : null);
    });

    const stateSpy = simple.stub().callFn((rid: string, eventType: string, stateKey: string) => {
        expect(rid).toEqual(roomId);
        expect(eventType).toEqual("m.room.encryption");
        expect(stateKey).toEqual("");
        return Promise.resolve(content);
    });

    const storeSpy = simple.stub().callFn((key: string, s: string) => {
        expect(key).toEqual("tracked_room." + roomId);
        const tryStoreContent = JSON.parse(s);
        expect(tryStoreContent).toMatchObject({
            ...content,
            algorithm: content['algorithm'] ?? 'UNKNOWN',
        });
        return Promise.resolve();
    });

    client.storageProvider.readValue = readSpy;
    client.storageProvider.storeValue = storeSpy;
    client.getRoomStateEvent = stateSpy;

    return [readSpy, stateSpy, storeSpy];
}

describe('RoomTracker', () => {
    it('should queue room updates when rooms are joined', async () => {
        const roomId = "!a:example.org";

        const { client } = createTestClient();

        const tracker = new RoomTracker(client);

        let queueSpy: simple.Stub<any>;
        await new Promise<void>(resolve => {
            queueSpy = simple.stub().callFn((rid: string) => {
                expect(rid).toEqual(roomId);
                resolve();
                return Promise.resolve();
            });
            tracker.queueRoomCheck = queueSpy;
            client.emit("room.join", roomId);
        });
        expect(queueSpy.callCount).toEqual(1);
    });

    it('should queue room updates when encryption events are received', async () => {
        const roomId = "!a:example.org";

        const { client } = createTestClient();

        const tracker = new RoomTracker(client);

        let queueSpy: simple.Stub<any>;
        await new Promise<void>(resolve => {
            queueSpy = simple.stub().callFn((rid: string) => {
                expect(rid).toEqual(roomId);
                resolve();
                return Promise.resolve();
            });
            tracker.queueRoomCheck = queueSpy;
            client.emit("room.event", roomId, {
                type: "not-m.room.encryption",
                state_key: "",
            });
            client.emit("room.event", roomId, {
                type: "m.room.encryption",
                state_key: "2",
            });
            client.emit("room.event", roomId, {
                type: "m.room.encryption",
                state_key: "",
            });
        });
        await new Promise<void>(resolve => setTimeout(() => resolve(), 250));
        expect(queueSpy.callCount).toEqual(1);
    });

    describe('prepare', () => {
        it('should queue updates for rooms', async () => {
            const roomIds = ["!a:example.org", "!b:example.org"];

            const { client } = createTestClient();

            const queueSpy = simple.stub().callFn((rid: string) => {
                expect(rid).toEqual(roomIds[queueSpy.callCount - 1]);
                return Promise.resolve();
            });

            const tracker = new RoomTracker(client);
            tracker.queueRoomCheck = queueSpy;
            await tracker.prepare(roomIds);
            expect(queueSpy.callCount).toEqual(2);
        });
    });

    describe('queueRoomCheck', () => {
        it('should store unknown rooms', async () => {
            const roomId = "!b:example.org";
            const content = { algorithm: RoomEncryptionAlgorithm.MegolmV1AesSha2, rid: "1" };

            const { client } = createTestClient();

            const [readSpy, stateSpy, storeSpy] = prepareQueueSpies(client, roomId, content);

            const tracker = new RoomTracker(client);
            await tracker.queueRoomCheck(roomId);
            expect(readSpy.callCount).toEqual(1);
            expect(stateSpy.callCount).toEqual(1);
            expect(storeSpy.callCount).toEqual(1);
        });

        it('should skip known rooms', async () => {
            const roomId = "!b:example.org";
            const content = { algorithm: RoomEncryptionAlgorithm.MegolmV1AesSha2, rid: "1" };

            const { client } = createTestClient();

            const [readSpy, stateSpy, storeSpy] = prepareQueueSpies(client, roomId, { algorithm: "no" }, content);

            const tracker = new RoomTracker(client);
            await tracker.queueRoomCheck(roomId);
            expect(readSpy.callCount).toEqual(1);
            expect(stateSpy.callCount).toEqual(0);
            expect(storeSpy.callCount).toEqual(0);
        });

        it('should not store unencrypted rooms', async () => {
            const roomId = "!b:example.org";
            const content = { algorithm: RoomEncryptionAlgorithm.MegolmV1AesSha2, rid: "1" };

            const { client } = createTestClient();

            const [readSpy, stateSpy, storeSpy] = prepareQueueSpies(client, roomId, content);
            client.getRoomStateEvent = async (rid: string, et: string, sk: string) => {
                await stateSpy(rid, et, sk);
                throw new Error("Simulated 404");
            };

            const tracker = new RoomTracker(client);
            await tracker.queueRoomCheck(roomId);
            expect(readSpy.callCount).toEqual(1);
            expect(stateSpy.callCount).toEqual(1);
            expect(storeSpy.callCount).toEqual(0);
        });
    });

    describe('getRoomCryptoConfig', () => {
        it('should return the config as-is', async () => {
            const roomId = "!a:example.org";
            const content: Partial<EncryptionEventContent> = {algorithm: RoomEncryptionAlgorithm.MegolmV1AesSha2};

            const { client } = createTestClient();

            const readSpy = simple.stub().callFn((key: string) => {
                expect(key).toEqual("tracked_room." + roomId);
                return Promise.resolve(JSON.stringify(content));
            });

            client.storageProvider.readValue = readSpy;

            const tracker = new RoomTracker(client);
            const config = await tracker.getRoomCryptoConfig(roomId);
            expect(readSpy.callCount).toEqual(1);
            expect(config).toMatchObject(content);
        });

        it('should queue unknown rooms', async () => {
            const roomId = "!a:example.org";
            const content: Partial<EncryptionEventContent> = {algorithm: RoomEncryptionAlgorithm.MegolmV1AesSha2};

            const { client } = createTestClient();

            const readSpy = simple.stub().callFn((key: string) => {
                expect(key).toEqual("tracked_room." + roomId);
                if (readSpy.callCount === 1) return Promise.resolve(null);
                return Promise.resolve(JSON.stringify(content));
            });
            const queueSpy = simple.stub().callFn((rid: string) => {
                expect(rid).toEqual(roomId);
                return Promise.resolve();
            });

            client.storageProvider.readValue = readSpy;

            const tracker = new RoomTracker(client);
            tracker.queueRoomCheck = queueSpy;
            const config = await tracker.getRoomCryptoConfig(roomId);
            expect(readSpy.callCount).toEqual(2);
            expect(queueSpy.callCount).toEqual(1);
            expect(config).toMatchObject(content);
        });

        it('should return empty for unencrypted rooms', async () => {
            const roomId = "!a:example.org";

            const { client } = createTestClient();

            const readSpy = simple.stub().callFn((key: string) => {
                expect(key).toEqual("tracked_room." + roomId);
                return Promise.resolve(null);
            });
            const queueSpy = simple.stub().callFn((rid: string) => {
                expect(rid).toEqual(roomId);
                return Promise.resolve();
            });

            client.storageProvider.readValue = readSpy;

            const tracker = new RoomTracker(client);
            tracker.queueRoomCheck = queueSpy;
            const config = await tracker.getRoomCryptoConfig(roomId);
            expect(readSpy.callCount).toEqual(2);
            expect(queueSpy.callCount).toEqual(1);
            expect(config).toMatchObject({ });
        });
    });
});

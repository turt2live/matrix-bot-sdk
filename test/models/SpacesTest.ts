import * as expect from "expect";
import * as simple from "simple-mock";
import { createTestClient } from "../MatrixClientTest";
import { Space } from "../../src";

describe('Space', () => {
    describe('createChildSpace', () => {
        it('should call the right endpoint', async () => {
            const {client} = createTestClient();

            const via = 'example.org';
            (<any>client).userId = `@alice:${via}`;

            const parentRoomId = "!parent:example.org";
            const childRoomId = "!child:example.org";
            const createOpts = {
                name: "TEST SPACE",
                topic: "This is a topic",
                localpart: "my-space",
                isPublic: true,
            };
            const parentEvContent = {
                via: [via],
            };
            const childEvContent = {
                via: [via],
            };

            const createSpy = simple.spy(async (opts) => {
                expect(opts).toMatchObject(createOpts);
                return new Space(childRoomId, client);
            });
            client.createSpace = createSpy;

            const calledFor = [];
            const expectedCalledFor = ["m.space.parent", "m.space.child"];
            const stateEventSpy = simple.spy(async (roomId, type, stateKey, content) => {
                calledFor.push(type);
                if (type === "m.space.parent") {
                    expect(stateKey).toBe(parentRoomId);
                    expect(content).toMatchObject(parentEvContent);
                    expect(roomId).toBe(childRoomId);
                } else if (type === "m.space.child") {
                    expect(stateKey).toBe(childRoomId);
                    expect(content).toMatchObject(childEvContent);
                    expect(roomId).toBe(parentRoomId);
                } else {
                    throw new Error("unexpected event");
                }
            });
            client.sendStateEvent = stateEventSpy;

            const parent = new Space(parentRoomId, client);
            const child = await parent.createChildSpace(createOpts);
            expect(child).toBeDefined();
            expect(child.roomId).toBe(childRoomId);
            expect(child.client).toBe(client);
            expect(createSpy.callCount).toBe(1);
            expect(stateEventSpy.callCount).toBe(2);
            expect(calledFor).toMatchObject(expectedCalledFor);
        });
    });

    describe('addChildSpace', () => {
        it('should call the right endpoint', async () => {
            const {client, http} = createTestClient();

            const via = 'example.org';
            (<any>client).userId = `@alice:${via}`;

            const parentRoomId = "!parent:example.org";
            const childRoomId = "!child:example.org";
            const createOpts = {
                name: "TEST SPACE",
                topic: "This is a topic",
                localpart: "my-space",
                isPublic: true,
            };
            const parentEvContent = {
                room_id: childRoomId,
                via: [via],
            };
            const childEvContent = {
                present: true,
                via: [via],
            };

            const createSpy = simple.spy(async (opts) => {
                expect(opts).toMatchObject(createOpts);
                return new MSC1772Space(childRoomId, client);
            });
            client.unstableApis.createSpace = createSpy;

            const calledFor = [];
            const expectedCalledFor = ["org.matrix.msc1772.room.parent", "org.matrix.msc1772.space.child"];
            const stateEventSpy = simple.spy(async (roomId, type, stateKey, content) => {
                calledFor.push(type);
                if (type === "org.matrix.msc1772.room.parent") {
                    expect(stateKey).toBe("");
                    expect(content).toMatchObject(parentEvContent);
                    expect(roomId).toBe(childRoomId);
                } else if (type === "org.matrix.msc1772.space.child") {
                    expect(stateKey).toBe(childRoomId);
                    expect(content).toMatchObject(childEvContent);
                    expect(roomId).toBe(parentRoomId);
                } else {
                    throw new Error("unexpected event");
                }
            });
            client.sendStateEvent = stateEventSpy;

            const child = new MSC1772Space(childRoomId, client);
            const parent = new MSC1772Space(parentRoomId, client);
            await parent.addChildSpace(child);
            expect(createSpy.callCount).toBe(0);
            expect(stateEventSpy.callCount).toBe(2);
            expect(calledFor).toMatchObject(expectedCalledFor);
        });
    });

    describe('addChildRoom', () => {
        it('should call the right endpoint', async () => {
            const {client, http} = createTestClient();

            const via = 'example.org';
            (<any>client).userId = `@alice:${via}`;

            const parentRoomId = "!parent:example.org";
            const childRoomId = "!child:example.org";
            const createOpts = {
                name: "TEST SPACE",
                topic: "This is a topic",
                localpart: "my-space",
                isPublic: true,
            };
            const parentEvContent = {
                room_id: childRoomId,
                via: [via],
            };
            const childEvContent = {
                present: true,
                via: [via],
            };

            const createSpy = simple.spy(async (opts) => {
                expect(opts).toMatchObject(createOpts);
                return new MSC1772Space(childRoomId, client);
            });
            client.unstableApis.createSpace = createSpy;

            const calledFor = [];
            const expectedCalledFor = ["org.matrix.msc1772.room.parent", "org.matrix.msc1772.space.child"];
            const stateEventSpy = simple.spy(async (roomId, type, stateKey, content) => {
                calledFor.push(type);
                if (type === "org.matrix.msc1772.room.parent") {
                    expect(stateKey).toBe("");
                    expect(content).toMatchObject(parentEvContent);
                    expect(roomId).toBe(childRoomId);
                } else if (type === "org.matrix.msc1772.space.child") {
                    expect(stateKey).toBe(childRoomId);
                    expect(content).toMatchObject(childEvContent);
                    expect(roomId).toBe(parentRoomId);
                } else {
                    throw new Error("unexpected event");
                }
            });
            client.sendStateEvent = stateEventSpy;

            const parent = new MSC1772Space(parentRoomId, client);
            await parent.addChildRoom(childRoomId);
            expect(createSpy.callCount).toBe(0);
            expect(stateEventSpy.callCount).toBe(2);
            expect(calledFor).toMatchObject(expectedCalledFor);
        });
    });

    describe('removeChildSpace', () => {
        it('should call the right endpoint', async () => {
            const {client, http} = createTestClient();

            const via = 'example.org';
            (<any>client).userId = `@alice:${via}`;

            const parentRoomId = "!parent:example.org";
            const childRoomId = "!child:example.org";
            const childEvContent = {
                present: false,
                via: [via],
            };

            const stateEventSpy = simple.spy(async (roomId, type, stateKey, content) => {
                expect(type).toBe("org.matrix.msc1772.space.child");
                expect(stateKey).toBe(childRoomId);
                expect(content).toMatchObject(childEvContent);
                expect(roomId).toBe(parentRoomId);
            });
            client.sendStateEvent = stateEventSpy;

            const child = new MSC1772Space(childRoomId, client);
            const parent = new MSC1772Space(parentRoomId, client);
            await parent.removeChildSpace(child);
            expect(stateEventSpy.callCount).toBe(1);
        });
    });

    describe('removeChildRoom', () => {
        it('should call the right endpoint', async () => {
            const {client, http} = createTestClient();

            const via = 'example.org';
            (<any>client).userId = `@alice:${via}`;

            const parentRoomId = "!parent:example.org";
            const childRoomId = "!child:example.org";
            const childEvContent = {
                present: false,
                via: [via],
            };

            const stateEventSpy = simple.spy(async (roomId, type, stateKey, content) => {
                expect(type).toBe("org.matrix.msc1772.space.child");
                expect(stateKey).toBe(childRoomId);
                expect(content).toMatchObject(childEvContent);
                expect(roomId).toBe(parentRoomId);
            });
            client.sendStateEvent = stateEventSpy;

            const parent = new MSC1772Space(parentRoomId, client);
            await parent.removeChildRoom(childRoomId);
            expect(stateEventSpy.callCount).toBe(1);
        });
    });

    describe('getChildEntities', () => {
        it('should return the viable room IDs', async () => {
            const {client, http} = createTestClient();

            const via = 'example.org';
            (<any>client).userId = `@alice:${via}`;

            const parentRoomId = "!parent:example.org";
            const expectedRoomIds = ["!room2:example.org", "!room4:example.org"];
            const stateEvents = [
                {type: "m.room.create", content: {}, state_key: ""},
                {type: "org.matrix.msc1772.space.child", content: {present: false}, state_key: "!room1:example.org"},
                {type: "org.matrix.msc1772.space.child", content: {present: true}, state_key: expectedRoomIds[0]},
                {type: "org.matrix.msc1772.space.child", content: {}, state_key: "!room3:example.org"},
                {type: "org.matrix.msc1772.space.child", content: {present: true}, state_key: expectedRoomIds[1]},
            ];
            client.getRoomState = async (roomId) => {
                expect(roomId).toBe(parentRoomId);
                return stateEvents;
            };

            const parent = new MSC1772Space(parentRoomId, client);
            const roomIds = await parent.getChildEntities();
            expect(roomIds).toMatchObject(expectedRoomIds);
        });
    });
});

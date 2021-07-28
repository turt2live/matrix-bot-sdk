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
            const childEvContent = {
                via: [via],
            };

            const createSpy = simple.spy(async (opts) => {
                expect(opts).toMatchObject(createOpts);
                return new Space(childRoomId, client);
            });
            client.createSpace = createSpy;

            const calledFor = [];
            const expectedCalledFor = ["m.space.child"];
            const stateEventSpy = simple.spy(async (roomId, type, stateKey, content) => {
                calledFor.push(type);
                if (type === "m.space.child") {
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
            expect(stateEventSpy.callCount).toBe(1);
            expect(calledFor).toMatchObject(expectedCalledFor);
        });
    });

    describe('addChildSpace', () => {
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
            const childEvContent = {
                via: [via],
            };

            const createSpy = simple.spy(async (opts) => {
                expect(opts).toMatchObject(createOpts);
                return new Space(childRoomId, client);
            });
            client.createSpace = createSpy;

            const calledFor = [];
            const expectedCalledFor = ["m.space.child"];
            const stateEventSpy = simple.spy(async (roomId, type, stateKey, content) => {
                calledFor.push(type);
                if (type === "m.space.child") {
                    expect(stateKey).toBe(childRoomId);
                    expect(content).toMatchObject(childEvContent);
                    expect(roomId).toBe(parentRoomId);
                } else {
                    throw new Error("unexpected event");
                }
            });
            client.sendStateEvent = stateEventSpy;

            const child = new Space(childRoomId, client);
            const parent = new Space(parentRoomId, client);
            await parent.addChildSpace(child);
            expect(createSpy.callCount).toBe(0);
            expect(stateEventSpy.callCount).toBe(1);
            expect(calledFor).toMatchObject(expectedCalledFor);
        });
    });

    describe('addChildRoom', () => {
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
            const childEvContent = {
                via: [via],
            };

            const createSpy = simple.spy(async (opts) => {
                expect(opts).toMatchObject(createOpts);
                return new Space(childRoomId, client);
            });
            client.createSpace = createSpy;

            const calledFor = [];
            const expectedCalledFor = ["m.space.child"];
            const stateEventSpy = simple.spy(async (roomId, type, stateKey, content) => {
                calledFor.push(type);
                if (type === "m.space.child") {
                    expect(stateKey).toBe(childRoomId);
                    expect(content).toMatchObject(childEvContent);
                    expect(roomId).toBe(parentRoomId);
                } else {
                    throw new Error("unexpected event");
                }
            });
            client.sendStateEvent = stateEventSpy;

            const parent = new Space(parentRoomId, client);
            await parent.addChildRoom(childRoomId);
            expect(createSpy.callCount).toBe(0);
            expect(stateEventSpy.callCount).toBe(1);
            expect(calledFor).toMatchObject(expectedCalledFor);
        });
    });

    describe('removeChildSpace', () => {
        it('should call the right endpoint', async () => {
            const {client} = createTestClient();

            const via = 'example.org';
            (<any>client).userId = `@alice:${via}`;

            const parentRoomId = "!parent:example.org";
            const childRoomId = "!child:example.org";
            const childEvContent = { };

            const stateEventSpy = simple.spy(async (roomId, type, stateKey, content) => {
                expect(type).toBe("m.space.child");
                expect(stateKey).toBe(childRoomId);
                expect(content).toMatchObject(childEvContent);
                expect(roomId).toBe(parentRoomId);
            });
            client.sendStateEvent = stateEventSpy;

            const child = new Space(childRoomId, client);
            const parent = new Space(parentRoomId, client);
            await parent.removeChildSpace(child);
            expect(stateEventSpy.callCount).toBe(1);
        });
    });

    describe('removeChildRoom', () => {
        it('should call the right endpoint', async () => {
            const {client} = createTestClient();

            const via = 'example.org';
            (<any>client).userId = `@alice:${via}`;

            const parentRoomId = "!parent:example.org";
            const childRoomId = "!child:example.org";
            const childEvContent = { };

            const stateEventSpy = simple.spy(async (roomId, type, stateKey, content) => {
                expect(type).toBe("m.space.child");
                expect(stateKey).toBe(childRoomId);
                expect(content).toMatchObject(childEvContent);
                expect(roomId).toBe(parentRoomId);
            });
            client.sendStateEvent = stateEventSpy;

            const parent = new Space(parentRoomId, client);
            await parent.removeChildRoom(childRoomId);
            expect(stateEventSpy.callCount).toBe(1);
        });
    });

    describe('getChildEntities', () => {
        it('should return the viable child rooms', async () => {
            const {client} = createTestClient();

            const via = 'example.org';
            const via2 = '2.example.org';
            (<any>client).userId = `@alice:${via}`;

            const parentRoomId = "!parent:example.org";
            const expectedRoomIds = ["!room2:example.org", "!room4:example.org"];
            const stateEvents = [
                {type: "m.room.create", content: { type: 'm.space' }, state_key: ""},
                {type: "m.space.child", content: { suggested: true, via: [via] }, state_key: "!room1:example.org"},
                {type: "m.space.child", content: { suggested: false, via: [via] }, state_key: expectedRoomIds[0]},
                {type: "m.space.child", content: { suggested: true, via: [via2] }, state_key: "!room3:example.org"},
                {type: "m.space.child", content: { suggested: false, via: [via2] }, state_key: expectedRoomIds[1]},
            ];
            client.getRoomState = async (roomId) => {
                expect(roomId).toBe(parentRoomId);
                return stateEvents;
            };

            const parent = new Space(parentRoomId, client);
            const children = await parent.getChildEntities();
            expect(Object.keys(children).length).toBe(4);
            expect(children["!room1:example.org"]).toBeDefined();
            expect(children["!room1:example.org"].content).toMatchObject(stateEvents[1].content);
            expect(children["!room2:example.org"]).toBeDefined();
            expect(children["!room2:example.org"].content).toMatchObject(stateEvents[2].content);
            expect(children["!room3:example.org"]).toBeDefined();
            expect(children["!room3:example.org"].content).toMatchObject(stateEvents[3].content);
            expect(children["!room4:example.org"]).toBeDefined();
            expect(children["!room4:example.org"].content).toMatchObject(stateEvents[4].content);
        });
    });

    describe('inviteUser', () => {
        it('should call the right endpoint', async () => {
            const {client} = createTestClient();

            const parentRoomId = "!parent:example.org";
            const targetUserId = "@alice:example.org";
            client.inviteUser = async (userId: string, roomId: string) => {
                expect(userId).toBe(targetUserId);
                expect(roomId).toBe(roomId);
                return {};
            };

            const space = new Space(parentRoomId, client);
            await space.inviteUser(targetUserId);
        });
    });
});

import * as expect from "expect";
import { IStorageProvider, MatrixClient, setRequestFn, SynchronousMatrixClient } from "../src";
import * as simple from "simple-mock";
import * as MockHttpBackend from 'matrix-mock-request';

class TestSyncMatrixClient extends SynchronousMatrixClient {
    constructor(client: MatrixClient) {
        super(client);
    }

    public async doProcessSync(raw: any) {
        // HACK: We shouldn't have to do this, and should be testing the startSyncInterval function
        const fn = (<any>this).handleEvent.bind(this);
        return super.processSync(raw, fn);
    }
}

export function createSyncTestClient(storage: IStorageProvider = null): { client: TestSyncMatrixClient, http: MockHttpBackend, hsUrl: string, accessToken: string } {
    const http = new MockHttpBackend();
    const hsUrl = "https://localhost";
    const accessToken = "s3cret";
    const client = new MatrixClient(hsUrl, accessToken, storage);
    setRequestFn(http.requestFn);

    return {http, hsUrl, accessToken, client: new TestSyncMatrixClient(client)};
}

describe('SynchronousMatrixClient', () => {
    describe('processSync', () => {
        interface ProcessSyncClient {
            userId: string;
        }

        it('should process non-room account data', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const events = [
                {
                    type: "m.room.member",
                    content: {
                        example: true,
                    },
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((ev) => {
                expect(ev).toMatchObject(events[0]);
            });
            const syncSpy = simple.mock(realClient, 'onAccountData').callFn((ev) => {
                expect(ev).toMatchObject(events[0]);
            });
            realClient.on("account_data", spy);

            await realClient.doProcessSync({account_data: {events: events}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should process left rooms', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 0},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomLeave').callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.leave", spy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}};
            await realClient.doProcessSync({rooms: {leave: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should process left rooms account data', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.member",
                    content: {
                        example: true,
                    },
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomAccountData').callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.account_data", spy);

            const roomsObj = {};
            roomsObj[roomId] = {account_data: {events: events}};
            await realClient.doProcessSync({rooms: {leave: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should use the most recent leave event', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 2},
                },
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 1},
                },
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 3},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomLeave').callFn((rid, ev) => {
                expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.leave", spy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}};
            await realClient.doProcessSync({rooms: {leave: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should not be affected by irrelevant events during leaves', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.not_member",
                    state_key: userId,
                    unsigned: {age: 1},
                },
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 1},
                },
                {
                    type: "m.room.member",
                    state_key: userId + "_wrong_member",
                    unsigned: {age: 1},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomLeave').callFn((rid, ev) => {
                expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.leave", spy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}};
            await realClient.doProcessSync({rooms: {leave: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should not process leaves detached from events', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.not_member",
                    state_key: userId,
                    unsigned: {age: 1},
                },
                // Intentionally don't include a membership event
                // {
                //     type: "m.room.member",
                //     state_key: userId,
                //     unsigned: {age: 1},
                // },
                {
                    type: "m.room.member",
                    state_key: userId + "_wrong_member",
                    unsigned: {age: 1},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                // expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomLeave').callFn((rid, ev) => {
                // expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.leave", spy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}};
            await realClient.doProcessSync({rooms: {leave: roomsObj}});
            expect(spy.callCount).toBe(0);
            expect(syncSpy.callCount).toBe(0);
        });

        it('should not get hung up on not having an age available for leaves', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.member",
                    state_key: userId,
                }
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomLeave').callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.leave", spy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}};
            await realClient.doProcessSync({rooms: {leave: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should process room invites', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                // TODO: Surely the 'invite' membership should be in some sort of content field?
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomInvite').callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.invite", spy);

            const roomsObj = {};
            roomsObj[roomId] = {invite_state: {events: events}};
            await realClient.doProcessSync({rooms: {invite: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should use the most recent invite event', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                // TODO: Surely the 'invite' membership should be in some sort of content field?
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 2},
                    content: {membership: "invite"},
                },
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 1},
                    content: {membership: "invite"},
                },
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 3},
                    content: {membership: "invite"},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomInvite').callFn((rid, ev) => {
                expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.invite", spy);

            const roomsObj = {};
            roomsObj[roomId] = {invite_state: {events: events}};
            await realClient.doProcessSync({rooms: {invite: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should not be affected by irrelevant events during invites', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                // TODO: Surely the 'invite' membership should be in some sort of content field?
                {
                    type: "m.room.not_member",
                    state_key: userId,
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
                {
                    type: "m.room.member",
                    state_key: userId + "_wrong_member",
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomInvite').callFn((rid, ev) => {
                expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.invite", spy);

            const roomsObj = {};
            roomsObj[roomId] = {invite_state: {events: events}};
            await realClient.doProcessSync({rooms: {invite: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should not process invites detached from events', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                // TODO: Surely the 'invite' membership should be in some sort of content field?
                {
                    type: "m.room.not_member",
                    state_key: userId,
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
                // Intentionally don't send a membership event
                // {
                //     type: "m.room.member",
                //     state_key: userId,
                //     unsigned: {age: 0},
                //     content: {membership: "invite"},
                // },
                {
                    type: "m.room.member",
                    state_key: userId + "_wrong_member",
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                // expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomInvite').callFn((rid, ev) => {
                // expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.invite", spy);

            const roomsObj = {};
            roomsObj[roomId] = {invite_state: {events: events}};
            await realClient.doProcessSync({rooms: {invite: roomsObj}});
            expect(spy.callCount).toBe(0);
            expect(syncSpy.callCount).toBe(0);
        });

        it('should not get hung up by not having an age available for invites', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                // TODO: Surely the 'invite' membership should be in some sort of content field?
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomInvite').callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.invite", spy);

            const roomsObj = {};
            roomsObj[roomId] = {invite_state: {events: events}};
            await realClient.doProcessSync({rooms: {invite: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should process room joins', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";

            client.userId = userId;

            const spy = simple.stub().callFn((rid) => {
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomJoin').callFn((rid) => {
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.join", spy);

            const roomsObj = {};
            roomsObj[roomId] = {};
            await realClient.doProcessSync({rooms: {join: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should process joined room account data', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.member",
                    content: {
                        example: true,
                    },
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomAccountData').callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.account_data", spy);

            const roomsObj = {};
            roomsObj[roomId] = {account_data: {events: events}};
            await realClient.doProcessSync({rooms: {join: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should not duplicate room joins', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";

            client.userId = userId;

            const spy = simple.stub().callFn((rid) => {
                expect(rid).toEqual(roomId);
            });
            const syncSpy = simple.mock(realClient, 'onRoomJoin').callFn((rid) => {
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.join", spy);

            const roomsObj = {};
            roomsObj[roomId] = {};
            await realClient.doProcessSync({rooms: {join: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
            await realClient.doProcessSync({rooms: {join: roomsObj}});
            expect(spy.callCount).toBe(1);
            expect(syncSpy.callCount).toBe(1);
        });

        it('should process events for joined rooms', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.not_message",
                    content: {body: "hello world 1"},
                },
                {
                    type: "m.room.message",
                    content: {body: "hello world 2"},
                },
                {
                    type: "m.room.not_message",
                    content: {body: "hello world 3"},
                },
                {
                    type: "m.room.message",
                    content: {body: "hello world 4"},
                },
            ];

            client.userId = userId;

            const joinSpy = simple.stub();
            const inviteSpy = simple.stub();
            const leaveSpy = simple.stub();
            const messageSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev["type"]).toEqual("m.room.message");
            });
            const eventSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
            });
            const syncJoinSpy = simple.mock(realClient, 'onRoomJoin').callFn(() => {});
            const syncInviteSpy = simple.mock(realClient, 'onRoomInvite').callFn(() => {});
            const syncLeaveSpy = simple.mock(realClient, 'onRoomLeave').callFn(() => {});
            const syncMessageSpy = simple.mock(realClient, 'onRoomMessage').callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev["type"]).toEqual("m.room.message");
            });
            const syncEventSpy = simple.mock(realClient, 'onRoomEvent').callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
            });
            realClient.on("room.join", joinSpy);
            realClient.on("room.invite", inviteSpy);
            realClient.on("room.leave", leaveSpy);
            realClient.on("room.message", messageSpy);
            realClient.on("room.event", eventSpy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}, invite_state: {events: events}};
            await realClient.doProcessSync({rooms: {join: roomsObj, leave: roomsObj, invite: roomsObj}});
            expect(joinSpy.callCount).toBe(1); // We'll technically be joining the room for the first time
            expect(syncJoinSpy.callCount).toBe(1); // We'll technically be joining the room for the first time
            expect(inviteSpy.callCount).toBe(0);
            expect(syncInviteSpy.callCount).toBe(0);
            expect(leaveSpy.callCount).toBe(0);
            expect(syncLeaveSpy.callCount).toBe(0);
            expect(messageSpy.callCount).toBe(2);
            expect(syncMessageSpy.callCount).toBe(2);
            expect(eventSpy.callCount).toBe(4);
            expect(syncEventSpy.callCount).toBe(4);
        });

        it('should process tombstone events', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.tombstone",
                    content: {body: "hello world 1"},
                    state_key: "",
                },
                {
                    type: "m.room.create",
                    content: {predecessor: {room_id: "!old:example.org"}},
                    state_key: "",
                },
            ];

            client.userId = userId;

            const joinSpy = simple.stub();
            const inviteSpy = simple.stub();
            const leaveSpy = simple.stub();
            const archiveSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev["type"]).toEqual("m.room.tombstone");
            });
            const eventSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
            });
            const syncJoinSpy = simple.mock(realClient, 'onRoomJoin').callFn(() => {});
            const syncInviteSpy = simple.mock(realClient, 'onRoomInvite').callFn(() => {});
            const syncLeaveSpy = simple.mock(realClient, 'onRoomLeave').callFn(() => {});
            const syncArchiveSpy = simple.mock(realClient, 'onRoomArchived').callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev["type"]).toEqual("m.room.tombstone");
            });
            const syncEventSpy = simple.mock(realClient, 'onRoomEvent').callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
            });
            realClient.on("room.join", joinSpy);
            realClient.on("room.invite", inviteSpy);
            realClient.on("room.leave", leaveSpy);
            realClient.on("room.archived", archiveSpy);
            realClient.on("room.event", eventSpy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}, invite_state: {events: events}};
            await realClient.doProcessSync({rooms: {join: roomsObj, leave: roomsObj, invite: roomsObj}});
            expect(joinSpy.callCount).toBe(1); // We'll technically be joining the room for the first time
            expect(syncJoinSpy.callCount).toBe(1); // We'll technically be joining the room for the first time
            expect(inviteSpy.callCount).toBe(0);
            expect(syncInviteSpy.callCount).toBe(0);
            expect(leaveSpy.callCount).toBe(0);
            expect(syncLeaveSpy.callCount).toBe(0);
            expect(archiveSpy.callCount).toBe(1);
            expect(syncArchiveSpy.callCount).toBe(1);
            expect(eventSpy.callCount).toBe(2);
            expect(syncEventSpy.callCount).toBe(2);
        });

        it('should process create events with a predecessor', async () => {
            const {client: realClient} = createSyncTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.tombstone",
                    content: {body: "hello world 1"},
                    state_key: "",
                },
                {
                    type: "m.room.create",
                    content: {predecessor: {room_id: "!old:example.org"}},
                    state_key: "",
                },
            ];

            client.userId = userId;

            const joinSpy = simple.stub();
            const inviteSpy = simple.stub();
            const leaveSpy = simple.stub();
            const upgradedSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev["type"]).toEqual("m.room.create");
            });
            const eventSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
            });
            const syncJoinSpy = simple.mock(realClient, 'onRoomJoin').callFn(() => {});
            const syncInviteSpy = simple.mock(realClient, 'onRoomInvite').callFn(() => {});
            const syncLeaveSpy = simple.mock(realClient, 'onRoomLeave').callFn(() => {});
            const syncUpgradedSpy = simple.mock(realClient, 'onRoomUpgraded').callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev["type"]).toEqual("m.room.create");
            });
            const syncEventSpy = simple.mock(realClient, 'onRoomEvent').callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
            });
            realClient.on("room.join", joinSpy);
            realClient.on("room.invite", inviteSpy);
            realClient.on("room.leave", leaveSpy);
            realClient.on("room.upgraded", upgradedSpy);
            realClient.on("room.event", eventSpy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}, invite_state: {events: events}};
            await realClient.doProcessSync({rooms: {join: roomsObj, leave: roomsObj, invite: roomsObj}});
            expect(joinSpy.callCount).toBe(1); // We'll technically be joining the room for the first time
            expect(syncJoinSpy.callCount).toBe(1); // We'll technically be joining the room for the first time
            expect(inviteSpy.callCount).toBe(0);
            expect(syncInviteSpy.callCount).toBe(0);
            expect(leaveSpy.callCount).toBe(0);
            expect(syncLeaveSpy.callCount).toBe(0);
            expect(upgradedSpy.callCount).toBe(1);
            expect(syncUpgradedSpy.callCount).toBe(1);
            expect(eventSpy.callCount).toBe(2);
            expect(syncEventSpy.callCount).toBe(2);
        });
    });
});

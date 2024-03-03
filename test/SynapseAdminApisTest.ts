import HttpBackend from 'matrix-mock-request';

import {
    IStorageProvider,
    MatrixClient,
    SynapseAdminApis,
    SynapseRegistrationToken,
    SynapseRegistrationTokenOptions,
    SynapseRegistrationTokenUpdateOptions,
    SynapseRoomList,
    SynapseRoomProperty,
    SynapseUser,
    SynapseUserList,
    SynapseUserProperties,
} from "../src";
import { createTestClient } from "./TestUtils";

export function createTestSynapseAdminClient(
    storage: IStorageProvider = null,
): {
    client: SynapseAdminApis;
    mxClient: MatrixClient;
    http: HttpBackend;
    hsUrl: string;
    accessToken: string;
} {
    const result = createTestClient(storage);
    const mxClient = result.client;
    const client = new SynapseAdminApis(mxClient);

    delete result.client;

    return { ...result, client, mxClient };
}

describe('SynapseAdminApis', () => {
    describe('isAdmin', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestSynapseAdminClient();

            const userId = "@someone:example.org";
            const response = { admin: true };

            http.when("GET", "/_synapse/admin/v1/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/users/${encodeURIComponent(userId)}/admin`);
                return response;
            });

            const [result] = await Promise.all([client.isAdmin(userId), http.flushAllExpected()]);
            expect(result).toEqual(response.admin);
        });

        it('should return false when the user is not an admin', async () => {
            const { client, http, hsUrl } = createTestSynapseAdminClient();

            const userId = "@someone:example.org";
            const response = { admin: false };

            http.when("GET", "/_synapse/admin/v1/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/users/${encodeURIComponent(userId)}/admin`);
                return response;
            });

            const [result] = await Promise.all([client.isAdmin(userId), http.flushAllExpected()]);
            expect(result).toEqual(response.admin);
        });
    });

    describe('isSelfAdmin', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestSynapseAdminClient();

            const userId = "@someone:example.org";
            const response = { admin: true };

            http.when("GET", "/_matrix/client/v3/account/whoami").respond(200, (path, content) => {
                return { user_id: userId };
            });
            http.when("GET", "/_synapse/admin/v1/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/users/${encodeURIComponent(userId)}/admin`);
                return response;
            });

            const [result] = await Promise.all([client.isSelfAdmin(), http.flushAllExpected()]);
            expect(result).toEqual(response.admin);
        });

        it('should return false if the client is not an admin', async () => {
            const { client, http, hsUrl } = createTestSynapseAdminClient();

            const userId = "@someone:example.org";

            http.when("GET", "/_matrix/client/v3/account/whoami").respond(200, (path, content) => {
                return { user_id: userId };
            });
            http.when("GET", "/_synapse/admin/v1/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/users/${encodeURIComponent(userId)}/admin`);
                return { errcode: "M_FORBIDDEN", error: "You are not a server admin" };
            });

            const [result] = await Promise.all([client.isSelfAdmin(), http.flushAllExpected()]);
            expect(result).toEqual(false);
        });
    });

    describe('getUser', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestSynapseAdminClient();

            const userId = "@someone:example.org";
            const response: SynapseUser = {
                displayname: "foobar",
                threepids: [{
                    medium: "email",
                    address: "foobar@example.org",
                }],
                avatar_url: "mxc://example.org/animage",
                admin: true,
                deactivated: false,
            };

            http.when("GET", "/_synapse/admin/v2/users").respond(200, (path) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
                return response;
            });

            const [result] = await Promise.all([client.getUser(userId), http.flushAllExpected()]);
            expect(result).toEqual(response);
        });

        it('should throw if the user cannot be found', async () => {
            const { client, http, hsUrl } = createTestSynapseAdminClient();

            const userId = "@someone:example.org";

            http.when("GET", "/_synapse/admin/v2/users").respond(404, (path) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
                return { error: "User not found", errcode: "M_NOT_FOUND" };
            });

            try {
                await Promise.all([client.getUser(userId), http.flushAllExpected()]);
            } catch (ex) {
                expect(ex.statusCode).toBe(404);
                return;
            }
            throw Error('Expected to throw');
        });
    });

    describe('upsertUser', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestSynapseAdminClient();

            const userId = "@someone:example.org";
            const response: SynapseUser = {
                displayname: "foobar",
                threepids: [{
                    medium: "email",
                    address: "foobar@example.org",
                }],
                avatar_url: "mxc://example.org/animage",
                admin: true,
                deactivated: false,
            };

            const request: SynapseUserProperties = {
                ...response,
                password: "foobar",
            };

            http.when("PUT", "/_synapse/admin/v2/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
                expect(content).toEqual(request);
                return response;
            });

            const [result] = await Promise.all([client.upsertUser(userId, request), http.flushAllExpected()]);
            expect(result).toEqual(response);
        });
    });

    describe('listUsers', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestSynapseAdminClient();

            const response: SynapseUserList = {
                users: [{
                    name: "@someone:example.org",
                    displayname: "foobar",
                    avatar_url: "mxc://example.org/animage",
                    admin: 1,
                    deactivated: 0,
                    is_guest: 0,
                    user_type: null,
                    password_hash: "$hashbrown",
                }],
                next_token: "foo",
                total: 1,
            };

            const request = {
                from: "foo",
                limit: 5,
                name: "bar",
                guests: true,
                deactivated: false,
            };

            http.when("GET", "/_synapse/admin/v2/users").respond(200, (path, _content, req) => {
                expect(req.queryParams).toEqual(request);
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users`);
                return response;
            });

            const [result] = await Promise.all([client.listUsers(
                request.from, request.limit, request.name, request.guests, request.deactivated,
            ), http.flushAllExpected()]);
            expect(result).toEqual(response);
        });
    });

    describe('listAllUsers', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestSynapseAdminClient();

            const user1 = {
                name: "@someone:example.org",
                displayname: "foobar",
                avatar_url: "mxc://example.org/animage",
                admin: 1,
                deactivated: 0,
                is_guest: 0,
                user_type: null,
                password_hash: "$hashbrown",
            };

            const user2 = {
                name: "@else:example.org",
                displayname: "barbaz",
                avatar_url: "mxc://example.org/animage2",
                admin: 1,
                deactivated: 0,
                is_guest: 0,
                user_type: null,
                password_hash: "$mmmm-hashbrown",
            };

            const request = {
                limit: 1,
                name: "bar",
                guests: true,
                deactivated: false,
            };

            http.when("GET", "/_synapse/admin/v2/users").respond(200, (path, _content, req) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users`);
                expect(req.queryParams).toEqual(request);
                return {
                    next_token: 'from-token',
                    total: 2,
                    users: [user1],
                };
            });
            const iterable = await client.listAllUsers({ name: "bar", guests: true, deactivated: false, limit: 1 });
            const flush = http.flushAllExpected();
            const resultUser1 = await iterable.next();
            expect(resultUser1).toEqual({ done: false, value: user1 });

            http.when("GET", "/_synapse/admin/v2/users").respond(200, (path, _content, req) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users`);
                expect(req.queryParams).toEqual({ ...request, from: 'from-token' });
                return {
                    total: 2,
                    users: [user2],
                };
            });
            const resultUser2 = await iterable.next();
            expect(resultUser2).toEqual({ done: false, value: user2 });
            expect(await iterable.next()).toEqual({ done: true });

            await flush;
        });
    });

    describe('listRooms', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestSynapseAdminClient();

            const response: SynapseRoomList = {
                rooms: [{
                    room_id: "!room:example.org",
                    canonical_alias: "#room:example.org",
                    creator: "@alice:example.org",
                    encryption: "org.example.algorithm",
                    federatable: true,
                    guest_access: "can_join",
                    history_visibility: "world_readable",
                    join_rules: "public",
                    joined_local_members: 1,
                    joined_members: 2,
                    name: "Test Room",
                    public: true,
                    state_events: 43,
                    version: "6",
                }],
                next_batch: "next",
                offset: "prev",
                prev_batch: "prev",
                total_rooms: 1,
            };

            const request = {
                search_term: "lookup",
                from: "from",
                limit: 1000,
                order_by: SynapseRoomProperty.CanFederate,
                dir: "b",
            };

            http.when("GET", "/_synapse/admin/v1/rooms").respond(200, (path, _content, req) => {
                expect(req.queryParams).toEqual(request);
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/rooms`);
                return response;
            });

            const [result] = await Promise.all([client.listRooms(
                request.search_term, request.from, request.limit, request.order_by, request.dir === 'b',
            ), http.flushAllExpected()]);
            expect(result).toEqual(response);
        });

        describe('getRoomState', () => {
            it('should call the right endpoint', async () => {
                const { client, http, hsUrl } = createTestSynapseAdminClient();

                const roomId = "!room:example.org";
                const state = [
                    { type: "m.room.create", content: {}, state_key: "" },
                    { type: "m.room.member", content: { membership: "join" }, state_key: "@alice:example.org" },
                    { type: "m.room.member", content: { membership: "leave" }, state_key: "@bob:example.org" },
                ];

                http.when("GET", "/_synapse/admin/v1/rooms").respond(200, (path, _content, req) => {
                    expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`);
                    return { state };
                });

                const [result] = await Promise.all([client.getRoomState(roomId), http.flushAllExpected()]);
                expect(result).toMatchObject(state);
            });
        });

        describe('deleteRoom', () => {
            it('should call the right endpoint', async () => {
                const { client, http, hsUrl } = createTestSynapseAdminClient();

                const roomId = "!room:example.org";

                http.when("DELETE", "/_synapse/admin/v2/rooms").respond(200, (path, _content, req) => {
                    expect(JSON.parse(req.rawData)).toMatchObject({ purge: true });
                    expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/rooms/${encodeURIComponent(roomId)}`);
                    return {};
                });

                await Promise.all([client.deleteRoom(roomId), http.flushAllExpected()]);
            });
        });

        describe('getDeleteRoomState', () => {
            it('should call the right endpoint', async () => {
                const { client, http, hsUrl } = createTestSynapseAdminClient();

                const roomId = "!room:example.org";
                const state = [
                    {
                        "delete_id": "delete_id1",
                        "status": "failed",
                        "error": "error message",
                        "shutdown_room": {
                            "kicked_users": [],
                            "failed_to_kick_users": [],
                            "local_aliases": [],
                            "new_room_id": null,
                        },
                    }, {
                        "delete_id": "delete_id2",
                        "status": "purging",
                        "shutdown_room": {
                            "kicked_users": [
                                "@foobar:example.com",
                            ],
                            "failed_to_kick_users": [],
                            "local_aliases": [
                                "#badroom:example.com",
                                "#evilsaloon:example.com",
                            ],
                            "new_room_id": "!newroomid:example.com",
                        },
                    },
                ];

                http.when("GET", "/_synapse/admin/v2/rooms").respond(200, (path, _content, req) => {
                    expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/rooms/${encodeURIComponent(roomId)}/delete_status`);
                    return { results: state };
                });

                const [result] = await Promise.all([client.getDeleteRoomState(roomId), http.flushAllExpected()]);
                expect(result).toMatchObject(state);
            });
        });

        describe('listRegistrationTokens', () => {
            it('should call the right endpoint', async () => {
                const { client, http } = createTestSynapseAdminClient();

                const tokens: SynapseRegistrationToken[] = [
                    { token: "foo", uses_allowed: null, pending: 5, completed: 25, expiry_time: null },
                    { token: "bar", uses_allowed: 15, pending: 5, completed: 8, expiry_time: 10000000 },
                ];

                http.when("GET", "/_synapse/admin/v1/registration_tokens").respond(200, () => {
                    return { registration_tokens: tokens };
                });

                const [result] = await Promise.all([client.listRegistrationTokens(), http.flushAllExpected()]);
                expect(result).toEqual(tokens);
            });
        });

        describe('getRegistrationToken', () => {
            it('should call the right endpoint', async () => {
                const { client, http } = createTestSynapseAdminClient();

                const token: SynapseRegistrationToken = {
                    token: "foo", uses_allowed: null, pending: 5, completed: 25, expiry_time: null,
                };

                http.when("GET", "/_synapse/admin/v1/registration_tokens/foo").respond(200, () => {
                    return token;
                });

                http.when("GET", "/_synapse/admin/v1/registration_tokens/not-a-token").respond(404, (path) => {
                    return {
                        errcode: "M_NOT_FOUND",
                        error: "No such registration token: not-a-token",
                    };
                });

                const flush = http.flushAllExpected();

                const result = await client.getRegistrationToken(token.token);
                expect(result).toEqual(token);

                const resultNull = await client.getRegistrationToken("not-a-token");
                expect(resultNull).toEqual(null);

                await flush;
            });
        });

        describe('createRegistrationToken', () => {
            it('should call the right endpoint', async () => {
                const { client, http } = createTestSynapseAdminClient();

                const responseToken: SynapseRegistrationToken = {
                    token: "foo", uses_allowed: null, pending: 5, completed: 25, expiry_time: null,
                };
                const options: SynapseRegistrationTokenOptions = {
                    token: "foo",
                    uses_allowed: null,
                };

                http.when("POST", "/_synapse/admin/v1/registration_tokens/new").respond(200, (_path, content) => {
                    expect(options).toMatchObject(content);
                    return responseToken;
                });

                const [result] = await Promise.all([client.createRegistrationToken(options), http.flushAllExpected()]);
                expect(result).toEqual(responseToken);
            });
        });

        describe('updateRegistrationToken', () => {
            it('should call the right endpoint', async () => {
                const { client, http } = createTestSynapseAdminClient();

                const responseToken: SynapseRegistrationToken = {
                    token: "foo", uses_allowed: null, pending: 5, completed: 25, expiry_time: null,
                };

                const options: SynapseRegistrationTokenUpdateOptions = {
                    uses_allowed: null,
                };

                http.when("PUT", "/_synapse/admin/v1/registration_tokens/foo").respond(200, (_path, content) => {
                    expect(options).toMatchObject(content);
                    return responseToken;
                });

                const [result] = await Promise.all([client.updateRegistrationToken("foo", options), http.flushAllExpected()]);
                expect(result).toEqual(responseToken);
            });
        });

        describe('deleteRegistrationToken', () => {
            it('should call the right endpoint', async () => {
                const { client, http } = createTestSynapseAdminClient();

                http.when("DELETE", "/_synapse/admin/v1/registration_tokens/foo").respond(200, () => {
                    return {};
                });

                await Promise.all([client.deleteRegistrationToken("foo"), http.flushAllExpected()]);
            });
        });

        describe('makeRoomAdmin', () => {
            it('should call the right endpoint', async () => {
                const { client, http, hsUrl } = createTestSynapseAdminClient();

                const roomId = "!room:example.org";
                const userId = "@alice:example.org";

                http.when("POST", "/_synapse/admin/v1/rooms").respond(200, (path, content, req) => {
                    expect(content).toMatchObject({ user_id: userId });
                    expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/make_room_admin`);
                    return {};
                });

                await Promise.all([client.makeRoomAdmin(roomId, userId), http.flushAllExpected()]);
            });
        });

        describe('getEventNearestToTimestamp', () => {
            it('should use the right endpoint', async () => {
                const { client, http, hsUrl } = createTestSynapseAdminClient();
                const roomId = "!abc123:example.org";
                const dir = "f";
                const timestamp = 1234;

                const eventId = "$def456:example.org";
                const originServerTs = 4567;

                http.when("GET", "/_synapse/admin/v1/rooms").respond(200, (path, _content, req) => {
                    expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/timestamp_to_event`);
                    expect(req.queryParams['dir']).toEqual(dir);
                    expect(req.queryParams['ts']).toEqual(timestamp);

                    return {
                        event_id: eventId,
                        origin_server_ts: originServerTs,
                    };
                });

                const [result] = await Promise.all([client.getEventNearestToTimestamp(roomId, timestamp, dir), http.flushAllExpected()]);
                expect(result).toBeDefined();
                expect(result.event_id).toEqual(eventId);
                expect(result.origin_server_ts).toEqual(originServerTs);
            });
        });
    });
});

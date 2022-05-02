import * as expect from "expect";
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
    SynapseUserProperties
} from "../src";
import * as MockHttpBackend from 'matrix-mock-request';
import { createTestClient } from "./MatrixClientTest";

export function createTestSynapseAdminClient(storage: IStorageProvider = null): { client: SynapseAdminApis, mxClient: MatrixClient, http: MockHttpBackend, hsUrl: string, accessToken: string } {
    const result = createTestClient(storage);
    const mxClient = result.client;
    const client = new SynapseAdminApis(mxClient);

    delete result.client;

    return {...result, client, mxClient};
}

describe('SynapseAdminApis', () => {
    describe('isAdmin', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestSynapseAdminClient();

            const userId = "@someone:example.org";
            const response = {admin: true};

            http.when("GET", "/_synapse/admin/v1/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/users/${encodeURIComponent(userId)}/admin`);
                return response;
            });

            http.flushAllExpected();
            const result = await client.isAdmin(userId);
            expect(result).toEqual(response.admin);
        });

        it('should return false when the user is not an admin', async () => {
            const {client, http, hsUrl} = createTestSynapseAdminClient();

            const userId = "@someone:example.org";
            const response = {admin: false};

            http.when("GET", "/_synapse/admin/v1/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/users/${encodeURIComponent(userId)}/admin`);
                return response;
            });

            http.flushAllExpected();
            const result = await client.isAdmin(userId);
            expect(result).toEqual(response.admin);
        });
    });

    describe('isSelfAdmin', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestSynapseAdminClient();

            const userId = "@someone:example.org";
            const response = {admin: true};

            http.when("GET", "/_matrix/client/r0/account/whoami").respond(200, (path, content) => {
                return {user_id: userId};
            });
            http.when("GET", "/_synapse/admin/v1/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/users/${encodeURIComponent(userId)}/admin`);
                return response;
            });

            http.flushAllExpected();
            const result = await client.isSelfAdmin();
            expect(result).toEqual(response.admin);
        });

        it('should return false if the client is not an admin', async () => {
            const {client, http, hsUrl} = createTestSynapseAdminClient();

            const userId = "@someone:example.org";

            http.when("GET", "/_matrix/client/r0/account/whoami").respond(200, (path, content) => {
                return {user_id: userId};
            });
            http.when("GET", "/_synapse/admin/v1/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/users/${encodeURIComponent(userId)}/admin`);
                return {errcode: "M_FORBIDDEN", error: "You are not a server admin"};
            });

            http.flushAllExpected();
            const result = await client.isSelfAdmin();
            expect(result).toEqual(false);
        });
    });

    describe('getUser', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestSynapseAdminClient();

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

            http.flushAllExpected();
            const result = await client.getUser(userId);
            expect(result).toEqual(response);
        });

        it('should throw if the user cannot be found', async () => {
            const {client, http, hsUrl} = createTestSynapseAdminClient();

            const userId = "@someone:example.org";

            http.when("GET", "/_synapse/admin/v2/users").respond(404, (path) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
                return {error: "User not found", errcode: "M_NOT_FOUND"};
            });

            http.flushAllExpected();
            try {
                await client.getUser(userId);
            } catch (ex) {
                expect(ex.statusCode).toBe(404);
                return;
            }
            throw Error('Expected to throw');
        });
    });

    describe('upsertUser', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestSynapseAdminClient();

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
            }

            http.when("PUT", "/_synapse/admin/v2/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
                expect(content).toEqual(request);
                return response;
            });

            http.flushAllExpected();
            const result = await client.upsertUser(userId, request);
            expect(result).toEqual(response);
        });
    });

    describe('listUsers', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestSynapseAdminClient();

            const response: SynapseUserList = {
                users: [{
                    name: "@someone:example.org",
                    displayname: "foobar",
                    avatar_url: "mxc://example.org/animage",
                    admin: 1,
                    deactivated: 0,
                    is_guest: 0,
                    user_type: null,
                    password_hash: "$hashbrown"
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
            }

            http.when("GET", "/_synapse/admin/v2/users").respond(200, (path, _content, req) => {
                expect(req.opts.qs).toEqual(request);
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users`);
                return response;
            });

            http.flushAllExpected();
            const result = await client.listUsers(
                request.from, request.limit, request.name, request.guests, request.deactivated
            );
            expect(result).toEqual(response);
        });
    });

    describe('listRooms', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestSynapseAdminClient();

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
                expect(req.opts.qs).toEqual(request);
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/rooms`);
                return response;
            });

            http.flushAllExpected();
            const result = await client.listRooms(
                request.search_term, request.from, request.limit, request.order_by, request.dir === 'b',
            );
            expect(result).toEqual(response);
        });

        describe('getRoomState', () => {
            it('should call the right endpoint', async () => {
                const {client, http, hsUrl} = createTestSynapseAdminClient();

                const roomId = "!room:example.org";
                const state = [
                    {type: "m.room.create", content: {}, state_key: ""},
                    {type: "m.room.member", content: {membership: "join"}, state_key: "@alice:example.org"},
                    {type: "m.room.member", content: {membership: "leave"}, state_key: "@bob:example.org"},
                ];

                http.when("GET", "/_synapse/admin/v1/rooms").respond(200, (path, _content, req) => {
                    expect(path).toEqual(`${hsUrl}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`);
                    return {state};
                });

                http.flushAllExpected();
                const result = await client.getRoomState(roomId);
                expect(result).toMatchObject(state);
            });
        });

        describe('deleteRoom', () => {
            it('should call the right endpoint', async () => {
                const {client, http, hsUrl} = createTestSynapseAdminClient();

                const roomId = "!room:example.org";

                http.when("DELETE", "/_synapse/admin/v2/rooms").respond(200, (path, _content, req) => {
                    expect(JSON.parse(req.opts.body)).toMatchObject({purge: true});
                    expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/rooms/${encodeURIComponent(roomId)}`);
                    return {};
                });

                http.flushAllExpected();
                await client.deleteRoom(roomId);
            });
        });

        describe('getDeleteRoomState', () => {
            it('should call the right endpoint', async () => {
                const {client, http, hsUrl} = createTestSynapseAdminClient();

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
                            "new_room_id": null
                        }
                    }, {
                        "delete_id": "delete_id2",
                        "status": "purging",
                        "shutdown_room": {
                            "kicked_users": [
                                "@foobar:example.com"
                            ],
                            "failed_to_kick_users": [],
                            "local_aliases": [
                                "#badroom:example.com",
                                "#evilsaloon:example.com"
                            ],
                            "new_room_id": "!newroomid:example.com"
                        }
                    }
                ];

                http.when("GET", "/_synapse/admin/v2/rooms").respond(200, (path, _content, req) => {
                    expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/rooms/${encodeURIComponent(roomId)}/delete_status`);
                    return { results: state };
                });

                http.flushAllExpected();
                const result = await client.getDeleteRoomState(roomId);
                expect(result).toMatchObject(state);
            });
        });

        describe('listRegistrationTokens', () => {
            it('should call the right endpoint', async () => {
                const {client, http, hsUrl} = createTestSynapseAdminClient();

                const tokens: SynapseRegistrationToken[] = [
                    {token: "foo", uses_allowed: null, pending: 5, completed: 25, expiry_time: null},
                    {token: "bar", uses_allowed: 15, pending: 5, completed: 8, expiry_time: 10000000}
                ];

                http.when("GET", "/_synapse/admin/v1/registration_tokens").respond(200, () => {
                    return {registration_tokens: tokens};
                });

                http.flushAllExpected();
                const result = await client.listRegistrationTokens();
                expect(result).toEqual(tokens);
            });
        });

        describe('getRegistrationToken', () => {
            it('should call the right endpoint', async () => {
                const {client, http, hsUrl} = createTestSynapseAdminClient();

                const token: SynapseRegistrationToken = {
                    token: "foo", uses_allowed: null, pending: 5, completed: 25, expiry_time: null
                };

                http.when("GET", "/_synapse/admin/v1/registration_tokens/foo").respond(200, () => {
                    return token;
                });

                http.when("GET", "/_synapse/admin/v1/registration_tokens/not-a-token").respond(404, (path) => {
                    return {
                        errcode: "M_NOT_FOUND",
                        error: "No such registration token: not-a-token"
                    }
                });

                http.flushAllExpected();
                const result = await client.getRegistrationToken(token.token);
                expect(result).toEqual(token);

                const resultNull = await client.getRegistrationToken("not-a-token");
                expect(resultNull).toEqual(null);
            });
        });

        describe('createRegistrationToken', () => {
            it('should call the right endpoint', async () => {
                const {client, http, hsUrl} = createTestSynapseAdminClient();

                const responseToken: SynapseRegistrationToken = {
                    token: "foo", uses_allowed: null, pending: 5, completed: 25, expiry_time: null
                };
                const options: SynapseRegistrationTokenOptions = {
                    token: "foo",
                    uses_allowed: null,
                }

                http.when("POST", "/_synapse/admin/v1/registration_tokens/new").respond(200, (_path, content) => {
                    expect(options).toMatchObject(content);
                    return responseToken;
                });

                http.flushAllExpected();
                const result = await client.createRegistrationToken(options);
                expect(result).toEqual(responseToken);
            });
        });

        describe('updateRegistrationToken', () => {
            it('should call the right endpoint', async () => {
                const {client, http, hsUrl} = createTestSynapseAdminClient();

                const responseToken: SynapseRegistrationToken = {
                    token: "foo", uses_allowed: null, pending: 5, completed: 25, expiry_time: null
                };
            
                const options: SynapseRegistrationTokenUpdateOptions = {
                    uses_allowed: null,
                }

                http.when("PUT", "/_synapse/admin/v1/registration_tokens/foo").respond(200, (_path, content) => {
                    expect(options).toMatchObject(content);
                    return responseToken;
                });

                http.flushAllExpected();
                const result = await client.updateRegistrationToken("foo", options);
                expect(result).toEqual(responseToken);
            });
        });

        describe('deleteRegistrationToken', () => {
            it('should call the right endpoint', async () => {
                const {client, http, hsUrl} = createTestSynapseAdminClient();

                http.when("DELETE", "/_synapse/admin/v1/registration_tokens/foo").respond(200, () => {
                    return {};
                });

                http.flushAllExpected();
                await client.deleteRegistrationToken("foo");
            });
        });
    });
});

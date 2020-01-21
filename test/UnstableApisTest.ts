import * as expect from "expect";
import { GroupProfile, IStorageProvider, MatrixClient, UnstableApis } from "../src";
import * as MockHttpBackend from 'matrix-mock-request';
import { createTestClient } from "./MatrixClientTest";

export function createTestUnstableClient(storage: IStorageProvider = null): { client: UnstableApis, mxClient: MatrixClient, http: MockHttpBackend, hsUrl: string, accessToken: string } {
    const result = createTestClient(storage);
    const mxClient = result.client;
    const client = new UnstableApis(mxClient);

    delete result.client;

    return {...result, client, mxClient};
}

describe('UnstableApis', () => {
    describe('createGroup', () => {
        it('should call the right endpoint', async () => {
            const {client, http} = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const localpart = "testing";

            http.when("POST", "/_matrix/client/unstable/create_group").respond(200, (path, content) => {
                expect(content).toMatchObject({localpart: localpart});
                return {group_id: groupId};
            });

            http.flushAllExpected();
            const result = await client.createGroup(localpart);
            expect(result).toEqual(groupId);
        });
    });

    describe('inviteUserToGroup', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const userId = "@someone:example.org";
            const state = "join";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/users/invite/${encodeURIComponent(userId)}`);
                expect(content).toMatchObject({});
                return {state: state};
            });

            http.flushAllExpected();
            const result = await client.inviteUserToGroup(groupId, userId);
            expect(result).toEqual(state);
        });
    });

    describe('kickUserFromGroup', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const userId = "@someone:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/users/remove/${encodeURIComponent(userId)}`);
                expect(content).toMatchObject({});
                return {};
            });

            http.flushAllExpected();
            const result = await client.kickUserFromGroup(groupId, userId);
            expect(result).toMatchObject({});
        });
    });

    describe('setGroupProfile', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const profile: GroupProfile = {
                avatar_url: "mxc://example.org/testing",
                long_description: "This is the long description",
                name: "This is the group name",
                short_description: "This is the short description",
            };

            http.when("POST", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/profile`);
                expect(content).toMatchObject(<any>profile);
                return {};
            });

            http.flushAllExpected();
            await client.setGroupProfile(groupId, profile);
        });
    });

    describe('setGroupJoinPolicy', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const policy = "invite";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/settings/m.join_policy`);
                expect(content).toMatchObject({"m.join_policy": {type: policy}});
                return {};
            });

            http.flushAllExpected();
            await client.setGroupJoinPolicy(groupId, policy);
        });
    });

    describe('addRoomToGroup', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const roomId = "!someroom:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/rooms/${encodeURIComponent(roomId)}`);
                expect(content["m.visibility"]["type"]).toEqual("public");
                return {};
            });

            http.flushAllExpected();
            const result = await client.addRoomToGroup(groupId, roomId);
            expect(result).toMatchObject({});
        });
    });

    describe('updateGroupRoomVisibility', () => {
        it('should call the right endpoint for private rooms', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const roomId = "!someroom:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/rooms/${encodeURIComponent(roomId)}/config/m.visibility`);
                expect(content["type"]).toEqual("private");
                return {};
            });

            http.flushAllExpected();
            const result = await client.updateGroupRoomVisibility(groupId, roomId, false);
            expect(result).toMatchObject({});
        });

        it('should call the right endpoint for public rooms', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const roomId = "!someroom:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/rooms/${encodeURIComponent(roomId)}/config/m.visibility`);
                expect(content["type"]).toEqual("public");
                return {};
            });

            http.flushAllExpected();
            const result = await client.updateGroupRoomVisibility(groupId, roomId, true);
            expect(result).toMatchObject({});
        });
    });

    describe('removeRoomFromGroup', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const roomId = "!someroom:example.org";

            http.when("DELETE", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/rooms/${encodeURIComponent(roomId)}`);
                return {};
            });

            http.flushAllExpected();
            const result = await client.removeRoomFromGroup(groupId, roomId);
            expect(result).toMatchObject({});
        });
    });

    describe('getGroupProfile', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";

            http.when("GET", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/profile`);
                return {
                    name: "Test Group",
                    avatar_url: "mxc://some/avatar",
                    short_description: "Short description of group",
                    long_description: "Long description of group",
                };
            });

            http.flushAllExpected();
            const result = await client.getGroupProfile(groupId);
            expect(result.name).toEqual("Test Group");
            expect(result.avatar_url).toEqual("mxc://some/avatar");
            expect(result.short_description).toEqual("Short description of group");
            expect(result.long_description).toEqual("Long description of group");
        });
    });

    describe('getGroupUsers', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const joinedUser = "@someuser:example.org";

            http.when("GET", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/users`);
                return {
                    chunk: [
                        {
                            user_id: joinedUser,
                        },
                    ],
                };
            });

            http.flushAllExpected();
            const result = await client.getGroupUsers(groupId);
            expect(result.length).toEqual(1);
            expect(result[0].user_id).toEqual(joinedUser);
        });
    });

    describe('getGroupInvitedUsers', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const invitedUser = "@someuser:example.org";

            http.when("GET", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/invited_users`);
                return {
                    chunk: [
                        {
                            user_id: invitedUser,
                        },
                    ],
                };
            });

            http.flushAllExpected();
            const result = await client.getGroupInvitedUsers(groupId);
            expect(result.length).toEqual(1);
            expect(result[0].user_id).toEqual(invitedUser);
        });
    });

    describe('getGroupRooms', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const roomId = "!someroom:example.org";

            http.when("GET", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/rooms`);
                return {
                    chunk: [
                        {
                            room_id: roomId,
                        },
                    ],
                };
            });

            http.flushAllExpected();
            const result = await client.getGroupRooms(groupId);
            expect(result.length).toEqual(1);
            expect(result[0].room_id).toEqual(roomId);
        });
    });

    describe('acceptGroupInvite', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/accept_invite`);
                return {};
            });

            http.flushAllExpected();
            const result = await client.acceptGroupInvite(groupId);
            expect(result).toMatchObject({});
        });
    });

    describe('joinGroup', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/join`);
                return {};
            });

            http.flushAllExpected();
            const result = await client.joinGroup(groupId);
            expect(result).toMatchObject({});
        });
    });

    describe('leaveGroup', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/leave`);
                return {};
            });

            http.flushAllExpected();
            const result = await client.leaveGroup(groupId);
            expect(result).toMatchObject({});
        });
    });

    describe('setGroupPublicity', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/update_publicity`);
                expect(content.publicise).toEqual(true);
                return {};
            });

            http.flushAllExpected();
            const result = await client.setGroupPublicity(groupId, true);
            expect(result).toMatchObject({});
        });
    });

    describe('getJoinedGroups', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const groupId = "+testing:example.org";

            http.when("GET", "/_matrix/client/unstable/joined_groups").respond(200, (path, content) => {
                return {
                    groups: [groupId],
                };
            });

            http.flushAllExpected();
            const result = await client.getJoinedGroups();
            expect(result.length).toEqual(1);
            expect(result[0]).toEqual(groupId);
        });
    });

    describe('getPublicisedGroups', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const userId = "@someuser:example.org";
            const groupId = "+testing:example.org";

            http.when("GET", "/_matrix/client/unstable/publicised_groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/publicised_groups/${encodeURIComponent(userId)}`);
                return {
                    groups: [groupId],
                };
            });

            http.flushAllExpected();
            const result = await client.getPublicisedGroups(userId);
            expect(result.length).toEqual(1);
            expect(result[0]).toEqual(groupId);
        });
    });

    describe('addReactionToEvent', () => {
        it('should send an m.reaction event', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const roomId = "!test:example.org";
            const originalEventId = "$orig:example.org";
            const newEventId = "$new:example.org";
            const emoji = "😀";
            const expectedReaction = {
                "m.relates_to": {
                    event_id: originalEventId,
                    key: emoji,
                    rel_type: "m.annotation",
                },
            };

            http.when("PUT", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                const idx = path.indexOf(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/send/m.reaction/`);
                expect(idx).toBe(0);
                expect(content).toMatchObject(expectedReaction);
                return {event_id: newEventId};
            });

            http.flushAllExpected();
            const result = await client.addReactionToEvent(roomId, originalEventId, emoji);
            expect(result).toEqual(newEventId);
        });
    });
});

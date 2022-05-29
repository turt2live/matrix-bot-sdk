import { GroupProfile, IStorageProvider, MatrixClient, MSC2380MediaInfo, UnstableApis } from "../src";
import * as MockHttpBackend from 'matrix-mock-request';
import { createTestClient } from "./TestUtils";

export function createTestUnstableClient(storage: IStorageProvider = null): { client: UnstableApis, mxClient: MatrixClient, http: MockHttpBackend, hsUrl: string, accessToken: string } {
    const result = createTestClient(storage);
    const mxClient = result.client;
    const client = new UnstableApis(mxClient);

    delete result.client;

    return { ...result, client, mxClient };
}

describe('UnstableApis', () => {
    describe('getRoomAliases', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const aliases = ["#test:example.org", "#test2:example.org"];
            const roomId = "!room:example.org";

            http.when("GET", "/_matrix/client/unstable/org.matrix.msc2432/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/org.matrix.msc2432/rooms/${encodeURIComponent(roomId)}/aliases`);
                return { aliases: aliases };
            });

            const [result] = await Promise.all([client.getRoomAliases(roomId), http.flushAllExpected()]);
            expect(result).toMatchObject(aliases);
        });
    });

    describe('createGroup', () => {
        it('should call the right endpoint', async () => {
            const { client, http } = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const localpart = "testing";

            http.when("POST", "/_matrix/client/unstable/create_group").respond(200, (path, content) => {
                expect(content).toMatchObject({ localpart: localpart });
                return { group_id: groupId };
            });

            const [result] = await Promise.all([client.createGroup(localpart), http.flushAllExpected()]);
            expect(result).toEqual(groupId);
        });
    });

    describe('inviteUserToGroup', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const userId = "@someone:example.org";
            const state = "join";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/users/invite/${encodeURIComponent(userId)}`);
                expect(content).toMatchObject({});
                return { state: state };
            });

            const [result] = await Promise.all([client.inviteUserToGroup(groupId, userId), http.flushAllExpected()]);
            expect(result).toEqual(state);
        });
    });

    describe('kickUserFromGroup', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const userId = "@someone:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/users/remove/${encodeURIComponent(userId)}`);
                expect(content).toMatchObject({});
                return {};
            });

            const [result] = await Promise.all([client.kickUserFromGroup(groupId, userId), http.flushAllExpected()]);
            expect(result).toMatchObject({});
        });
    });

    describe('setGroupProfile', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

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

            await Promise.all([client.setGroupProfile(groupId, profile), http.flushAllExpected()]);
        });
    });

    describe('setGroupJoinPolicy', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const policy = "invite";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/settings/m.join_policy`);
                expect(content).toMatchObject({ "m.join_policy": { type: policy } });
                return {};
            });

            await Promise.all([client.setGroupJoinPolicy(groupId, policy), http.flushAllExpected()]);
        });
    });

    describe('addRoomToGroup', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const roomId = "!someroom:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/rooms/${encodeURIComponent(roomId)}`);
                expect(content["m.visibility"]["type"]).toEqual("public");
                return {};
            });

            const [result] = await Promise.all([client.addRoomToGroup(groupId, roomId), http.flushAllExpected()]);
            expect(result).toMatchObject({});
        });
    });

    describe('updateGroupRoomVisibility', () => {
        it('should call the right endpoint for private rooms', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const roomId = "!someroom:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/rooms/${encodeURIComponent(roomId)}/config/m.visibility`);
                expect(content["type"]).toEqual("private");
                return {};
            });

            const [result] = await Promise.all([client.updateGroupRoomVisibility(groupId, roomId, false), http.flushAllExpected()]);
            expect(result).toMatchObject({});
        });

        it('should call the right endpoint for public rooms', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const roomId = "!someroom:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/rooms/${encodeURIComponent(roomId)}/config/m.visibility`);
                expect(content["type"]).toEqual("public");
                return {};
            });

            const [result] = await Promise.all([client.updateGroupRoomVisibility(groupId, roomId, true), http.flushAllExpected()]);
            expect(result).toMatchObject({});
        });
    });

    describe('removeRoomFromGroup', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const groupId = "+testing:example.org";
            const roomId = "!someroom:example.org";

            http.when("DELETE", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/rooms/${encodeURIComponent(roomId)}`);
                return {};
            });

            const [result] = await Promise.all([client.removeRoomFromGroup(groupId, roomId), http.flushAllExpected()]);
            expect(result).toMatchObject({});
        });
    });

    describe('getGroupProfile', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

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

            const [result] = await Promise.all([client.getGroupProfile(groupId), http.flushAllExpected()]);
            expect(result.name).toEqual("Test Group");
            expect(result.avatar_url).toEqual("mxc://some/avatar");
            expect(result.short_description).toEqual("Short description of group");
            expect(result.long_description).toEqual("Long description of group");
        });
    });

    describe('getGroupUsers', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

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

            const [result] = await Promise.all([client.getGroupUsers(groupId), http.flushAllExpected()]);
            expect(result.length).toEqual(1);
            expect(result[0].user_id).toEqual(joinedUser);
        });
    });

    describe('getGroupInvitedUsers', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

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

            const [result] = await Promise.all([client.getGroupInvitedUsers(groupId), http.flushAllExpected()]);
            expect(result.length).toEqual(1);
            expect(result[0].user_id).toEqual(invitedUser);
        });
    });

    describe('getGroupRooms', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

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

            const [result] = await Promise.all([client.getGroupRooms(groupId), http.flushAllExpected()]);
            expect(result.length).toEqual(1);
            expect(result[0].room_id).toEqual(roomId);
        });
    });

    describe('acceptGroupInvite', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const groupId = "+testing:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/accept_invite`);
                return {};
            });

            const [result] = await Promise.all([client.acceptGroupInvite(groupId), http.flushAllExpected()]);
            expect(result).toMatchObject({});
        });
    });

    describe('joinGroup', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const groupId = "+testing:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/join`);
                return {};
            });

            const [result] = await Promise.all([client.joinGroup(groupId), http.flushAllExpected()]);
            expect(result).toMatchObject({});
        });
    });

    describe('leaveGroup', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const groupId = "+testing:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/leave`);
                return {};
            });

            const [result] = await Promise.all([client.leaveGroup(groupId), http.flushAllExpected()]);
            expect(result).toMatchObject({});
        });
    });

    describe('setGroupPublicity', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const groupId = "+testing:example.org";

            http.when("PUT", "/_matrix/client/unstable/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/update_publicity`);
                expect(content.publicise).toEqual(true);
                return {};
            });

            const [result] = await Promise.all([client.setGroupPublicity(groupId, true), http.flushAllExpected()]);
            expect(result).toMatchObject({});
        });
    });

    describe('getJoinedGroups', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const groupId = "+testing:example.org";

            http.when("GET", "/_matrix/client/unstable/joined_groups").respond(200, (path, content) => {
                return {
                    groups: [groupId],
                };
            });

            const [result] = await Promise.all([client.getJoinedGroups(), http.flushAllExpected()]);
            expect(result.length).toEqual(1);
            expect(result[0]).toEqual(groupId);
        });
    });

    describe('getPublicisedGroups', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const userId = "@someuser:example.org";
            const groupId = "+testing:example.org";

            http.when("GET", "/_matrix/client/unstable/publicised_groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/publicised_groups/${encodeURIComponent(userId)}`);
                return {
                    groups: [groupId],
                };
            });

            const [result] = await Promise.all([client.getPublicisedGroups(userId), http.flushAllExpected()]);
            expect(result.length).toEqual(1);
            expect(result[0]).toEqual(groupId);
        });
    });

    describe('addReactionToEvent', () => {
        it('should send an m.reaction event', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

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
                return { event_id: newEventId };
            });

            const [result] = await Promise.all([client.addReactionToEvent(roomId, originalEventId, emoji), http.flushAllExpected()]);
            expect(result).toEqual(newEventId);
        });
    });

    describe('getRelationsForEvent', () => {
        test.each([
            [null, null],
            ['org.example.relation', null],
            ['org.example.relation', 'org.example.event_type'],
        ])("should call the right endpoint for rel=%p and type=%p", async (relType, eventType) => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const roomId = "!room:example.org";
            const eventId = "$event";
            const response = {
                original_event: { eventContents: true },
                chunk: [
                    { eventContents: true },
                    { eventContents: true },
                    { eventContents: true },
                ],
            };

            http.when("GET", "/_matrix/client/unstable/rooms").respond(200, (path, content) => {
                const relTypeComponent = relType ? `/${encodeURIComponent(relType)}` : '';
                const eventTypeComponent = eventType ? `/${encodeURIComponent(eventType)}` : '';
                const idx = path.indexOf(`${hsUrl}/_matrix/client/unstable/rooms/${encodeURIComponent(roomId)}/relations/${encodeURIComponent(eventId)}${relTypeComponent}${eventTypeComponent}`);
                expect(idx).toBe(0);
                return response;
            });

            const [result] = await Promise.all([client.getRelationsForEvent(roomId, eventId, relType, eventType), http.flushAllExpected()]);
            expect(result).toEqual(response);
        });
    });

    describe('getMediaInfo', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const domain = "example.org";
            const mediaId = "abc123";
            const mxc = `mxc://${domain}/${mediaId}`;
            const response: MSC2380MediaInfo = {
                content_type: "image/png",
                size: 12,
            };

            http.when("GET", "/_matrix/media/unstable/info").respond(200, (path, content) => {
                const idx = path.indexOf(`${hsUrl}/_matrix/media/unstable/info/${encodeURIComponent(domain)}/${encodeURIComponent(mediaId)}`);
                expect(idx).toBe(0);
                return response;
            });

            const [result] = await Promise.all([client.getMediaInfo(mxc), http.flushAllExpected()]);
            expect(result).toEqual(response);
        });

        test.each([
            ["invalid", "'mxcUrl' does not begin with mxc://"],
            ["mxc://", "Missing domain or media ID"],
            ["mxc://domainonly", "Missing domain or media ID"],
            ["mxc://emptymedia/", "Missing domain or media ID"],
        ])("should fail if the MXC URI is invalid: %p / %p", async (val, err) => {
            const { client } = createTestUnstableClient();

            await expect(client.getMediaInfo(val)).rejects.toThrow(err);
        });
    });
});

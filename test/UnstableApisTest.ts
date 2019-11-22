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

            http.when("POST", "/_matrix/client/r0/create_group").respond(200, (path, content) => {
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

            http.when("PUT", "/_matrix/client/r0/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/groups/${encodeURIComponent(groupId)}/admin/users/invite/${encodeURIComponent(userId)}`);
                expect(content).toMatchObject({});
                return {state: state};
            });

            http.flushAllExpected();
            const result = await client.inviteUserToGroup(groupId, userId);
            expect(result).toEqual(state);
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

            http.when("POST", "/_matrix/client/r0/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/groups/${encodeURIComponent(groupId)}/profile`);
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

            http.when("PUT", "/_matrix/client/r0/groups").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/groups/${encodeURIComponent(groupId)}/settings/m.join_policy`);
                expect(content).toMatchObject({"m.join_policy": {type: policy}});
                return {};
            });

            http.flushAllExpected();
            await client.setGroupJoinPolicy(groupId, policy);
        });
    });
});

import * as expect from "expect";
import { AdminApis, IStorageProvider, MatrixClient, WhoisInfo } from "../src";
import * as MockHttpBackend from 'matrix-mock-request';
import { createTestClient } from "./MatrixClientTest";
import { SynapseAdminApis, SynapseUpsertUserBody, SynapseUserListResponse, SynapseUserRecord } from "../src/SynapseAdminApis";

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

            http.when("GET", "/_synapse/admin/v2/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}/admin`);
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

            http.when("GET", "/_synapse/admin/v2/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}/admin`);
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
            http.when("GET", "/_synapse/admin/v2/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}/admin`);
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
            http.when("GET", "/_synapse/admin/v2/users").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}/admin`);
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
            const response: SynapseUserRecord = {
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
            const response: SynapseUserRecord = {
                displayname: "foobar",
                threepids: [{
                    medium: "email",
                    address: "foobar@example.org",
                }],
                avatar_url: "mxc://example.org/animage",
                admin: true, 
                deactivated: false,
            };

            const request: SynapseUpsertUserBody = {
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

            const response: SynapseUserListResponse = {
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
});

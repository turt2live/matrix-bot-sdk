import * as expect from "expect";
import { AdminApis, IStorageProvider, MatrixClient, WhoisInfo } from "../src";
import * as MockHttpBackend from 'matrix-mock-request';
import { createTestClient } from "./MatrixClientTest";
import { SynapseAdminApis } from "../src/SynapseAdminApis";

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
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
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
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
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
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
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
                expect(path).toEqual(`${hsUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
                return {errcode: "M_FORBIDDEN", error: "You are not a server admin"};
            });

            http.flushAllExpected();
            const result = await client.isSelfAdmin();
            expect(result).toEqual(false);
        });
    });
});

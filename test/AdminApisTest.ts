import * as expect from "expect";
import { AdminApis, IStorageProvider, MatrixClient, WhoisInfo } from "../src";
import * as MockHttpBackend from 'matrix-mock-request';
import { createTestClient } from "./MatrixClientTest";

export function createTestAdminClient(storage: IStorageProvider = null): { client: AdminApis, mxClient: MatrixClient, http: MockHttpBackend, hsUrl: string, accessToken: string } {
    const result = createTestClient(storage);
    const mxClient = result.client;
    const client = new AdminApis(mxClient);

    delete result.client;

    return {...result, client, mxClient};
}

describe('AdminApis', () => {

    describe('whoisUser', () => {

        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestAdminClient();

            const userId = "@someone:example.org";
            const response: WhoisInfo = {
                user_id: userId,
                devices: {
                    foobar: {
                        sessions: [{
                            connections: [{
                                ip: "127.0.0.1",
                                last_seen: 1000,
                                user_agent: "FakeDevice/1.0.0",
                            }],
                        }],
                    },
                },
            };

            http.when("GET", "/_matrix/client/r0/admin/whois").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/admin/whois/${encodeURIComponent(userId)}`);
                return response;
            });

            http.flushAllExpected();
            const result = await client.whoisUser(userId);
            expect(result).toMatchObject(<any>response);
        });
    });
});

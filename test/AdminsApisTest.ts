import * as expect from "expect";
import { IStorageProvider, MatrixClient, AdminApis, IAdminWhois } from "../src";
import * as MockHttpBackend from 'matrix-mock-request';
import { createTestClient } from "./MatrixClientTest";

export function createTestAdminClient(storage: IStorageProvider = null): { client: AdminApis, mxClient: MatrixClient, http: MockHttpBackend, hsUrl: string, accessToken: string } {
    const result = createTestClient(storage);
    const mxClient = result.client;
    const client = new AdminApis(mxClient);

    delete result.client;

    return {...result, client, mxClient};
}

// @ts-ignore
describe('AdminApis', () => {
    //@ts-check
    describe('getUserWhois', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http} = createTestAdminClient();

            const userId = "@someone:example.org";

            http.when("GET", "/_matrix/client/r0/admin/whois/" + encodeURIComponent(userId)).respond(200, (path) => {
                return {
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
                } as IAdminWhois;
            });

            http.flushAllExpected();
            const result = await client.getUserWhois(userId);
            expect(result.user_id).toEqual(userId);
            expect(result.devices.foobar.sessions[0].connections[0].ip).toEqual("127.0.0.1");
            expect(result.devices.foobar.sessions[0].connections[0].last_seen).toEqual(1000);
            expect(result.devices.foobar.sessions[0].connections[0].user_agent).toEqual("FakeDevice/1.0.0");
        });
    });
});
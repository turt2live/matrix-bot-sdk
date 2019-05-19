import * as expect from "expect";
import { GroupProfile, IStorageProvider, MatrixAuth, MatrixClient, UnstableApis } from "../src";
import * as MockHttpBackend from 'matrix-mock-request';
import { createTestClient } from "./MatrixClientTest";

export function createTestAuth(): { auth: MatrixAuth, http: MockHttpBackend, hsUrl: string } {
    const result = createTestClient();

    const mxClient = result.client;
    const hsUrl = result.hsUrl;
    const http = result.http;

    const auth = new MatrixAuth(hsUrl);

    // Overwrite the function for which client to return. We want to use the
    // one which uses our http thing.
    auth['createTemplateclient'] = () => mxClient;

    return {hsUrl, http, auth};
}

// @ts-ignore
describe('MatrixAuth', () => {
    // @ts-ignore
    describe('passwordRegister', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {auth, http, hsUrl} = createTestAuth();

            const username = "testing_username";
            const password = "P@ssw0rd";
            const accessToken = "1234";

            http.when("POST", "/_matrix/client/r0/register").respond(200, (path, content) => {
                expect(content).toMatchObject({username, password});
                return {access_token: accessToken};
            });

            http.flushAllExpected();
            const client = await auth.passwordRegister(username, password);
            expect(client.homeserverUrl).toEqual(hsUrl);
            expect(client.accessToken).toEqual(accessToken);
        });

        // TODO: Enable test.
        // We can't test this currently because matrix-mock-request doesn't support sending the response
        // object for errors.
        // @ts-ignore
        xit('should support UIA', async () => {
            const {auth, http, hsUrl} = createTestAuth();

            const username = "testing_username";
            const password = "P@ssw0rd";
            const accessToken = "1234";
            const sessionId = "5678";

            // First is UIA
            http.when("POST", "/_matrix/client/r0/register").respond(401, (path, content) => {
                expect(content).toMatchObject({username, password});
                return {
                    session: sessionId,
                    flows: [
                        {stages: ["m.login.dummy"]},
                    ],
                    params: {},
                };
            });
            http.when("POST", "/_matrix/client/r0/register").respond(200, (path, content) => {
                expect(content).toMatchObject({
                    username,
                    password,
                    auth: {
                        type: "m.login.dummy",
                        session: sessionId,
                    },
                });
                return {access_token: accessToken};
            });

            http.flushAllExpected();
            const client = await auth.passwordRegister(username, password);
            expect(client.homeserverUrl).toEqual(hsUrl);
            expect(client.accessToken).toEqual(accessToken);
        });
    });

    // @ts-ignore
    describe('passwordLogin', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {auth, http, hsUrl} = createTestAuth();

            const username = "testing_username";
            const password = "P@ssw0rd";
            const accessToken = "1234";

            http.when("POST", "/_matrix/client/r0/login").respond(200, (path, content) => {
                expect(content).toMatchObject({
                    type: "m.login.password",
                    identifier: {
                        type: "m.id.user",
                        user: username,
                    },
                    password,
                });
                return {access_token: accessToken};
            });

            http.flushAllExpected();
            const client = await auth.passwordLogin(username, password);
            expect(client.homeserverUrl).toEqual(hsUrl);
            expect(client.accessToken).toEqual(accessToken);
        });
    });
});

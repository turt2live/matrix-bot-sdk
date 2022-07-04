import HttpBackend from 'matrix-mock-request';

import { MatrixAuth } from "../src";
import { createTestClient } from "./TestUtils";

export function createTestAuth(): { auth: MatrixAuth, http: HttpBackend, hsUrl: string } {
    const result = createTestClient();

    const mxClient = result.client;
    const hsUrl = result.hsUrl;
    const http = result.http;

    const auth = new MatrixAuth(hsUrl);

    // Overwrite the function for which client to return. We want to use the
    // one which uses our http thing.
    auth['createTemplateClient'] = () => mxClient;

    return { hsUrl, http, auth };
}

describe('MatrixAuth', () => {
    describe('passwordRegister', () => {
        it('should call the right endpoint', async () => {
            const { auth, http, hsUrl } = createTestAuth();

            const username = "testing_username";
            const password = "P@ssw0rd";
            const accessToken = "1234";

            http.when("POST", "/_matrix/client/v3/register").respond(200, (path, content) => {
                expect(content).toMatchObject({ username, password });
                return { access_token: accessToken };
            });

            const [client] = await Promise.all([auth.passwordRegister(username, password), http.flushAllExpected()]);
            expect(client.homeserverUrl).toEqual(hsUrl);
            expect(client.accessToken).toEqual(accessToken);
        });

        // TODO: Enable test.
        // We can't test this currently because matrix-mock-request doesn't support sending the response
        // object for errors.

        xit('should support UIA', async () => {
            const { auth, http, hsUrl } = createTestAuth();

            const username = "testing_username";
            const password = "P@ssw0rd";
            const accessToken = "1234";
            const sessionId = "5678";

            // First is UIA
            http.when("POST", "/_matrix/client/v3/register").respond(401, (path, content) => {
                expect(content).toMatchObject({ username, password });
                return {
                    session: sessionId,
                    flows: [
                        { stages: ["m.login.dummy"] },
                    ],
                    params: {},
                };
            });
            http.when("POST", "/_matrix/client/v3/register").respond(200, (path, content) => {
                expect(content).toMatchObject({
                    username,
                    password,
                    auth: {
                        type: "m.login.dummy",
                        session: sessionId,
                    },
                });
                return { access_token: accessToken };
            });

            const [client] = await Promise.all([auth.passwordRegister(username, password), http.flushAllExpected()]);
            expect(client.homeserverUrl).toEqual(hsUrl);
            expect(client.accessToken).toEqual(accessToken);
        });
    });

    describe('passwordLogin', () => {
        it('should call the right endpoint', async () => {
            const { auth, http, hsUrl } = createTestAuth();

            const username = "testing_username";
            const password = "P@ssw0rd";
            const accessToken = "1234";

            http.when("POST", "/_matrix/client/v3/login").respond(200, (path, content) => {
                expect(content).toMatchObject({
                    type: "m.login.password",
                    identifier: {
                        type: "m.id.user",
                        user: username,
                    },
                    password,
                });
                return { access_token: accessToken };
            });

            const [client] = await Promise.all([auth.passwordLogin(username, password), http.flushAllExpected()]);
            expect(client.homeserverUrl).toEqual(hsUrl);
            expect(client.accessToken).toEqual(accessToken);
        });
    });
});

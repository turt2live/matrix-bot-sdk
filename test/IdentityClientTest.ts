import { IdentityClient, MatrixClient, setRequestFn, Threepid } from "../src";
import * as MockHttpBackend from 'matrix-mock-request';
import { createTestClient } from "./MatrixClientTest";
import * as simple from "simple-mock";

export async function createTestIdentityClient(): Promise<{ client: IdentityClient, mxClient: MatrixClient, http: MockHttpBackend, identityUrl: string, accessToken: string }> {
    const result = createTestClient();
    const mxClient = result.client;

    const idServer = "id.example.org";

    const idAccessToken = "t0ken";
    result.http.when("POST", "/_matrix/identity/v2/account/register").respond(200, {token: idAccessToken});
    mxClient.getOpenIDConnectToken = () => Promise.resolve({
        access_token: "s3cret",
        expires_in: 1200,
        matrix_server_name: "localhost",
        token_type: "Bearer",
    });

    const flush = result.http.flushAllExpected();
    const client = await mxClient.getIdentityServerClient(idServer);

    delete result.client;
    delete result.hsUrl;
    delete result.accessToken;

    await flush;

    return {...result, client, mxClient, accessToken: idAccessToken, identityUrl: `https://${idServer}`};
}

describe('IdentityClient', () => {
    describe('getAccount', () => {
        it('should call the right endpoint', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const accountResponse = {
                user_id: "@alice:example.org",
            };

            http.when("GET", "/_matrix/identity/v2/account").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/account`);
                return accountResponse;
            });

            const flush = http.flushAllExpected();
            const resp = await client.getAccount();
            expect(resp).toMatchObject(accountResponse);
            await flush;
        });
    });

    describe('getTermsOfService', () => {
        it('should call the right endpoint', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const response = {
                policies: {
                    test1: {
                        en: {
                            name: "Test Policy",
                            url: "https://terms.example.org/v1/en/test1"
                        },
                        version: "1",
                    },
                    test2: {
                        en: {
                            name: "Test Policy (English)",
                            url: "https://terms.example.org/v1.1/en/test2"
                        },
                        fr: {
                            name: "Test Policy (French)",
                            url: "https://terms.example.org/v1.1/fr/test2"
                        },
                        version: "1.1",
                    },
                },
            };

            http.when("GET", "/_matrix/identity/v2/terms").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/terms`);
                return response;
            });

            const flush = http.flushAllExpected();
            const result = await client.getTermsOfService();
            expect(result).toEqual(response);
            await flush;
        });
    });

    describe('acceptTerms', () => {
        it('should call the right endpoint', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const urls = ["https://terms.example.org/v1/en/test1", "https://terms.example.org/v1/en/test2"];

            http.when("POST", "/_matrix/identity/v2/terms").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/terms`);
                expect(content).toMatchObject({user_accepts: urls});
                return {};
            });

            const flush = http.flushAllExpected();
            await client.acceptTerms(urls);
            await flush;
        });
    });

    describe('acceptAllTerms', () => {
        it('should pick English over other languages', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const policies = {
                policies: {
                    test1: {
                        en: {
                            name: "Test Policy",
                            url: "https://terms.example.org/v1/en/test1"
                        },
                        version: "1",
                    },
                    test2: {
                        en: {
                            name: "Test Policy (English)",
                            url: "https://terms.example.org/v1.1/en/test2"
                        },
                        fr: {
                            name: "Test Policy (French)",
                            url: "https://terms.example.org/v1.1/fr/test2"
                        },
                        version: "1.1",
                    },
                },
            };

            const urls = ["https://terms.example.org/v1/en/test1", "https://terms.example.org/v1.1/en/test2"];

            http.when("GET", "/_matrix/identity/v2/terms").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/terms`);
                return policies;
            });

            http.when("POST", "/_matrix/identity/v2/terms").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/terms`);
                expect(content).toMatchObject({user_accepts: urls});
                return {};
            });

            const flush = http.flushAllExpected();
            await client.acceptAllTerms();
            await flush;
        });

        it('should pick other languages if English is not available', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const policies = {
                policies: {
                    test1: {
                        en: {
                            name: "Test Policy",
                            url: "https://terms.example.org/v1/en/test1"
                        },
                        version: "1",
                    },
                    test2: {
                        // en: {
                        //     name: "Test Policy (English)",
                        //     url: "https://terms.example.org/v1.1/en/test2"
                        // },
                        fr: {
                            name: "Test Policy (French)",
                            url: "https://terms.example.org/v1.1/fr/test2"
                        },
                        version: "1.1",
                    },
                },
            };

            const urls = ["https://terms.example.org/v1/en/test1", "https://terms.example.org/v1.1/fr/test2"];

            http.when("GET", "/_matrix/identity/v2/terms").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/terms`);
                return policies;
            });

            http.when("POST", "/_matrix/identity/v2/terms").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/terms`);
                expect(content).toMatchObject({user_accepts: urls});
                return {};
            });

            const flush = http.flushAllExpected();
            await client.acceptAllTerms();
            await flush;
        });

        it('should ignore invalid policies', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const policies = {
                policies: {
                    test1: {
                        en: {
                            name: "Test Policy",
                            url: "https://terms.example.org/v1/en/test1"
                        },
                        version: "1",
                    },
                    test2: {
                        // en: {
                        //     name: "Test Policy (English)",
                        //     url: "https://terms.example.org/v1.1/en/test2"
                        // },
                        // fr: {
                        //     name: "Test Policy (French)",
                        //     url: "https://terms.example.org/v1.1/fr/test2"
                        // },
                        version: "1.1",
                    },
                },
            };

            const urls = ["https://terms.example.org/v1/en/test1"];

            http.when("GET", "/_matrix/identity/v2/terms").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/terms`);
                return policies;
            });

            http.when("POST", "/_matrix/identity/v2/terms").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/terms`);
                expect(content).toMatchObject({user_accepts: urls});
                return {};
            });

            const flush = http.flushAllExpected();
            await client.acceptAllTerms();
            await flush;
        });
    });

    describe('lookup', () => {
        it('should call the right endpoint (sha256)', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const algorithms = ["sha256"];
            const pepper = "matrixrocks";
            const addresses: Threepid[] = [
                {kind: "email", address: "alice@example.com"},
                {kind: "msisdn", address: "18005552067"},
            ];
            const hashes = [
                "4kenr7N9drpCJ4AfalmlGQVsOn3o2RHjkADUpXJWZUc",
                "nlo35_T5fzSGZzJApqu8lgIudJvmOQtDaHtr-I4rU7I",
            ];
            const mappedUserId = "@alice:example.org";

            http.when("GET", "/_matrix/identity/v2/hash_details").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/hash_details`);
                return {
                    algorithms: algorithms,
                    lookup_pepper: pepper,
                };
            });

            http.when("POST", "/_matrix/identity/v2/lookup").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/lookup`);
                expect(content).toMatchObject({
                    pepper: pepper,
                    algorithm: algorithms[0],
                    addresses: hashes,
                });
                return {
                    mappings: {
                        [hashes[0]]: mappedUserId,
                    },
                };
            });

            const flush = http.flushAllExpected();
            const response = await client.lookup(addresses);
            expect(Array.isArray(response)).toBe(true);
            expect(response[0]).toEqual(mappedUserId);
            expect(response[1]).toBeFalsy();
            await flush;
        });

        it('should call the right endpoint (none/plaintext)', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const algorithms = ["none"];
            const pepper = "matrixrocks";
            const addresses: Threepid[] = [
                {kind: "email", address: "alice@example.com"},
                {kind: "msisdn", address: "18005552067"},
            ];
            const hashes = [
                "alice@example.com email",
                "18005552067 msisdn",
            ];
            const mappedUserId = "@alice:example.org";

            http.when("GET", "/_matrix/identity/v2/hash_details").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/hash_details`);
                return {
                    algorithms: algorithms,
                    lookup_pepper: pepper,
                };
            });

            http.when("POST", "/_matrix/identity/v2/lookup").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/lookup`);
                expect(content).toMatchObject({
                    pepper: pepper,
                    algorithm: algorithms[0],
                    addresses: hashes,
                });
                return {
                    mappings: {
                        [hashes[0]]: mappedUserId,
                    },
                };
            });

            const flush = http.flushAllExpected();
            const response = await client.lookup(addresses, true);
            expect(Array.isArray(response)).toBe(true);
            expect(response[0]).toEqual(mappedUserId);
            expect(response[1]).toBeFalsy();
            await flush;
        });

        it('should prefer hashing over plaintext', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const algorithms = ["none", "sha256"];
            const pepper = "matrixrocks";
            const addresses: Threepid[] = [
                {kind: "email", address: "alice@example.com"},
                {kind: "msisdn", address: "18005552067"},
            ];
            const hashes = [
                "4kenr7N9drpCJ4AfalmlGQVsOn3o2RHjkADUpXJWZUc",
                "nlo35_T5fzSGZzJApqu8lgIudJvmOQtDaHtr-I4rU7I",
            ];
            const mappedUserId = "@alice:example.org";

            http.when("GET", "/_matrix/identity/v2/hash_details").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/hash_details`);
                return {
                    algorithms: algorithms,
                    lookup_pepper: pepper,
                };
            });

            http.when("POST", "/_matrix/identity/v2/lookup").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/lookup`);
                expect(content).toMatchObject({
                    pepper: pepper,
                    algorithm: algorithms[1],
                    addresses: hashes,
                });
                return {
                    mappings: {
                        [hashes[0]]: mappedUserId,
                    },
                };
            });

            const flush = http.flushAllExpected();
            const response = await client.lookup(addresses);
            expect(Array.isArray(response)).toBe(true);
            expect(response[0]).toEqual(mappedUserId);
            expect(response[1]).toBeFalsy();
            await flush;
        });

        it('should prefer hashing over plaintext, even if allowed', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const algorithms = ["none", "sha256"];
            const pepper = "matrixrocks";
            const addresses: Threepid[] = [
                {kind: "email", address: "alice@example.com"},
                {kind: "msisdn", address: "18005552067"},
            ];
            const hashes = [
                "4kenr7N9drpCJ4AfalmlGQVsOn3o2RHjkADUpXJWZUc",
                "nlo35_T5fzSGZzJApqu8lgIudJvmOQtDaHtr-I4rU7I",
            ];
            const mappedUserId = "@alice:example.org";

            http.when("GET", "/_matrix/identity/v2/hash_details").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/hash_details`);
                return {
                    algorithms: algorithms,
                    lookup_pepper: pepper,
                };
            });

            http.when("POST", "/_matrix/identity/v2/lookup").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/lookup`);
                expect(content).toMatchObject({
                    pepper: pepper,
                    algorithm: algorithms[1],
                    addresses: hashes,
                });
                return {
                    mappings: {
                        [hashes[0]]: mappedUserId,
                    },
                };
            });

            const flush = http.flushAllExpected();
            const response = await client.lookup(addresses, true);
            expect(Array.isArray(response)).toBe(true);
            expect(response[0]).toEqual(mappedUserId);
            expect(response[1]).toBeFalsy();
            await flush;
        });

        it('should fail if no algorithms are present', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const algorithms = [];
            const pepper = "matrixrocks";
            const addresses: Threepid[] = [
                {kind: "email", address: "alice@example.com"},
                {kind: "msisdn", address: "18005552067"},
            ];

            http.when("GET", "/_matrix/identity/v2/hash_details").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/hash_details`);
                return {
                    algorithms: algorithms,
                    lookup_pepper: pepper,
                };
            });

            const flush = http.flushAllExpected();
            try {
                await client.lookup(addresses);
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message === "No supported hashing algorithm found");
            }
            await flush;
        });

        it('should fail if no relevant algorithms are present', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const algorithms = ["io.t2bot.example.custom"];
            const pepper = "matrixrocks";
            const addresses: Threepid[] = [
                {kind: "email", address: "alice@example.com"},
                {kind: "msisdn", address: "18005552067"},
            ];

            http.when("GET", "/_matrix/identity/v2/hash_details").respond(200, (path, content) => {
                expect(path).toEqual(`${identityUrl}/_matrix/identity/v2/hash_details`);
                return {
                    algorithms: algorithms,
                    lookup_pepper: pepper,
                };
            });

            const flush = http.flushAllExpected();
            try {
                await client.lookup(addresses);
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message === "No supported hashing algorithm found");
            }
            await flush;
        });
    });

    describe("doRequest", () => {
        it('should use the request function defined', async () => {
            const {client} = await createTestIdentityClient();

            const testFn = ((_, cb) => cb(null, {statusCode: 200}));
            const spy = simple.spy(testFn);
            setRequestFn(spy);

            await client.doRequest("GET", "/test");
            expect(spy.callCount).toBe(1);
        });

        it('should reject upon error', async () => {
            const {client, http} = await createTestIdentityClient();
            http.when("GET", "/test").respond(404, {error: "Not Found"});

            try {
                const flush = http.flushAllExpected();
                await client.doRequest("GET", "/test");
                await flush;

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Expected an error and didn't get one");
            } catch (e) {
                expect(e.statusCode).toBe(404);
            }
        });

        it('should return a parsed JSON body', async () => {
            const {client, http} = await createTestIdentityClient();

            const expectedResponse = {test: 1234};
            http.when("GET", "/test").respond(200, expectedResponse);

            const flush = http.flushAllExpected();
            const response = await client.doRequest("GET", "/test");
            expect(response).toMatchObject(expectedResponse);
            await flush;
        });

        it('should be kind with prefixed slashes', async () => {
            const {client, http} = await createTestIdentityClient();

            const expectedResponse = {test: 1234};
            http.when("GET", "/test").respond(200, expectedResponse);

            const flush = http.flushAllExpected();
            const response = await client.doRequest("GET", "test");
            expect(response).toMatchObject(expectedResponse);
            await flush;
        });

        it('should send the appropriate body', async () => {
            const {client, http} = await createTestIdentityClient();

            const expectedInput = {test: 1234};
            http.when("PUT", "/test").respond(200, (path, content) => {
                expect(content).toMatchObject(expectedInput);
                return {};
            });

            const flush = http.flushAllExpected();
            await client.doRequest("PUT", "/test", null, expectedInput);
            await flush;
        });

        it('should send the appropriate query string', async () => {
            const {client, http} = await createTestIdentityClient();

            const expectedInput = {test: 1234};
            http.when("GET", "/test").respond(200, (path, content, req) => {
                expect(req.opts.qs).toMatchObject(expectedInput);
                return {};
            });

            const flush = http.flushAllExpected();
            await client.doRequest("GET", "/test", expectedInput);
            await flush;
        });

        it('should send the access token in the Authorization header', async () => {
            const {client, http, accessToken} = await createTestIdentityClient();

            http.when("GET", "/test").respond(200, (path, content, req) => {
                expect(req.opts.headers["Authorization"]).toEqual(`Bearer ${accessToken}`);
                return {};
            });

            const flush = http.flushAllExpected();
            await client.doRequest("GET", "/test");
            await flush;
        });

        it('should send application/json by default', async () => {
            const {client, http} = await createTestIdentityClient();

            http.when("PUT", "/test").respond(200, (path, content, req) => {
                expect(req.opts.headers["Content-Type"]).toEqual("application/json");
                return {};
            });

            const flush = http.flushAllExpected();
            await client.doRequest("PUT", "/test", null, {test: 1});
            await flush;
        });

        it('should send the content-type of choice where possible', async () => {
            const {client, http} = await createTestIdentityClient();

            const contentType = "testing/type";
            const fakeJson = `{"BUFFER": "HACK"}`;
            Buffer.isBuffer = <any>(i => i === fakeJson);

            http.when("PUT", "/test").respond(200, (path, content, req) => {
                expect(req.opts.headers["Content-Type"]).toEqual(contentType);
                return {};
            });

            const flush = http.flushAllExpected();
            await client.doRequest("PUT", "/test", null, fakeJson, 60000, false, contentType);
            await flush;
        });

        it('should return raw responses if requested', async () => {
            const {client, http} = await createTestIdentityClient();

            const expectedOutput = {hello: "world"};

            http.when("PUT", "/test").respond(200, expectedOutput);

            const flush = http.flushAllExpected();
            const result = await client.doRequest("PUT", "/test", null, {}, 60000, true);
            // HACK: We can't check the body because of the mock library. Check the status code instead.
            expect(result.statusCode).toBe(200);
            await flush;
        });

        it('should proxy the timeout to request', async () => {
            const {client, http} = await createTestIdentityClient();

            const timeout = 10;

            http.when("GET", "/test").respond(200, (path, content, req) => {
                expect(req.opts.timeout).toBe(timeout);
            });

            const flush = http.flushAllExpected();
            await client.doRequest("GET", "/test", null, null, timeout);
            await flush;
        });
    });

    describe('makeEmailInvite', () => {
        it('should call the right endpoint', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const mxUserId = "@bob:example.org";
            client.matrixClient.getUserId = () => Promise.resolve(mxUserId);

            const inviteEmail = "alice@example.org";
            const inviteRoomId = "!room:example.org";
            const storedInvite = {
                display_name: "a...@e...",
                public_keys: [
                    "serverkey",
                    "ephemeralkey",
                ],
                token: "s3cret",
            };

            const stateStub = () => Promise.resolve(null);
            client.matrixClient.getRoomStateEvent = stateStub;
            client.matrixClient.getUserProfile = stateStub;

            http.when("POST", "/_matrix/identity/v2/store-invite").respond(200, (path, content) => {
                expect(content).toMatchObject({
                    address: inviteEmail,
                    room_id: inviteRoomId,
                    medium: "email",
                    sender: mxUserId,
                });
                return storedInvite;
            });

            const flush = http.flushAllExpected();
            const resp = await client.makeEmailInvite(inviteEmail, inviteRoomId);
            expect(resp).toMatchObject(storedInvite);
            await flush;
        });

        it('should request room state events and user profile', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const mxUserId = "@bob:example.org";
            client.matrixClient.getUserId = () => Promise.resolve(mxUserId);

            const inviteEmail = "alice@example.org";
            const inviteRoomId = "!room:example.org";
            const inviteRoomName = "Test Room";
            const inviteRoomAvatar = "mxc://example.org/roomavatar";
            const inviteRoomJoinRules = "public";
            const inviteRoomAlias = "#test:example.org";
            const senderDisplayName = "Bob Test";
            const senderAvatarUrl = "mxc://example.org/avatar";
            const storedInvite = {
                display_name: "a...@e...",
                public_keys: [
                    {public_key: "serverkey", key_validity_url: "/_matrix/identity/v1/pubkey/isvalid"},
                    {public_key: "ephemeralkey", key_validity_url: "/_matrix/identity/v1/pubkey/isvalid"},
                ],
                public_key: "serverkey",
                token: "s3cret",
            };
            const expectedStateEvents = [
                "m.room.canonical_alias",
                "m.room.name",
                "m.room.avatar",
                "m.room.join_rules",
            ];

            const calledStateEvents:string[] = [];
            const stateStub = async (roomId: string, evType: string, stateKey: string) => {
                expect(roomId).toBe(inviteRoomId);
                expect(stateKey).toBe("");
                calledStateEvents.push(evType);

                switch(evType) {
                    case "m.room.name":
                        return {name: inviteRoomName};
                    case "m.room.canonical_alias":
                        return {alias: inviteRoomAlias};
                    case "m.room.join_rules":
                        return {join_rule: inviteRoomJoinRules};
                    case "m.room.avatar":
                        return {url: inviteRoomAvatar};
                    default:
                        throw new Error("Unknown event type");
                }
            };
            client.matrixClient.getRoomStateEvent = stateStub;
            const profileSpy = simple.mock(client.matrixClient, "getUserProfile").callFn(() => {
                return Promise.resolve({displayname: senderDisplayName, avatar_url: senderAvatarUrl});
            })

            http.when("POST", "/_matrix/identity/v2/store-invite").respond(200, (path, content) => {
                expect(content).toMatchObject({
                    address: inviteEmail,
                    room_id: inviteRoomId,
                    medium: "email",
                    sender: mxUserId,
                    sender_avatar_url: senderAvatarUrl,
                    sender_display_name: senderDisplayName,
                    room_alias: inviteRoomAlias,
                    room_avatar_url: inviteRoomAvatar,
                    room_join_rules: inviteRoomJoinRules,
                    room_name: inviteRoomName,
                });
                return storedInvite;
            });

            const flush = http.flushAllExpected();
            const resp = await client.makeEmailInvite(inviteEmail, inviteRoomId);
            expect(resp).toMatchObject(storedInvite);
            expect(profileSpy.callCount).toBe(1);
            expect({calledStateEvents}).toMatchObject({calledStateEvents: expectedStateEvents});
            await flush;
        });

        it('should use the canonical alias when no explicit name is present', async () => {
            const {client, http, identityUrl} = await createTestIdentityClient();

            const mxUserId = "@bob:example.org";
            client.matrixClient.getUserId = () => Promise.resolve(mxUserId);

            const inviteEmail = "alice@example.org";
            const inviteRoomId = "!room:example.org";
            const inviteRoomAvatar = "mxc://example.org/roomavatar";
            const inviteRoomJoinRules = "public";
            const inviteRoomAlias = "#test:example.org";
            const senderDisplayName = "Bob Test";
            const senderAvatarUrl = "mxc://example.org/avatar";
            const storedInvite = {
                display_name: "a...@e...",
                public_keys: [
                    {public_key: "serverkey", key_validity_url: "/_matrix/identity/v1/pubkey/isvalid"},
                    {public_key: "ephemeralkey", key_validity_url: "/_matrix/identity/v1/pubkey/isvalid"},
                ],
                public_key: "serverkey",
                token: "s3cret",
            };
            const expectedStateEvents = [
                "m.room.canonical_alias",
                "m.room.name",
                "m.room.avatar",
                "m.room.join_rules",
            ];

            const calledStateEvents:string[] = [];
            const stateStub = async (roomId: string, evType: string, stateKey: string) => {
                expect(roomId).toBe(inviteRoomId);
                expect(stateKey).toBe("");
                calledStateEvents.push(evType);

                switch(evType) {
                    case "m.room.name":
                        throw new Error("ROOM_NAME: Not found");
                    case "m.room.canonical_alias":
                        return {alias: inviteRoomAlias};
                    case "m.room.join_rules":
                        return {join_rule: inviteRoomJoinRules};
                    case "m.room.avatar":
                        return {url: inviteRoomAvatar};
                    default:
                        throw new Error("Unknown event type");
                }
            };
            client.matrixClient.getRoomStateEvent = stateStub;
            const profileSpy = simple.mock(client.matrixClient, "getUserProfile").callFn(() => {
                return Promise.resolve({displayname: senderDisplayName, avatar_url: senderAvatarUrl});
            })

            http.when("POST", "/_matrix/identity/v2/store-invite").respond(200, (path, content) => {
                expect(content).toMatchObject({
                    address: inviteEmail,
                    room_id: inviteRoomId,
                    medium: "email",
                    sender: mxUserId,
                    sender_avatar_url: senderAvatarUrl,
                    sender_display_name: senderDisplayName,
                    room_alias: inviteRoomAlias,
                    room_avatar_url: inviteRoomAvatar,
                    room_join_rules: inviteRoomJoinRules,
                    room_name: inviteRoomAlias, // !! This is what we're testing
                });
                return storedInvite;
            });

            const flush = http.flushAllExpected();
            const resp = await client.makeEmailInvite(inviteEmail, inviteRoomId);
            expect(resp).toMatchObject(storedInvite);
            expect(profileSpy.callCount).toBe(1);
            expect({calledStateEvents}).toMatchObject({calledStateEvents: expectedStateEvents});
            await flush;
        });
    });
});

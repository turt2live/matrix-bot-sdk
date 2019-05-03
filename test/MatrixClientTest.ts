import * as expect from "expect";
import {
    IJoinRoomStrategy,
    IPreprocessor,
    IStorageProvider,
    MatrixClient,
    MemoryStorageProvider,
    setRequestFn
} from "../src";
import * as simple from "simple-mock";
import * as MockHttpBackend from 'matrix-mock-request';

export function createTestClient(storage: IStorageProvider = null): { client: MatrixClient, http: MockHttpBackend, hsUrl: string, accessToken: string } {
    const http = new MockHttpBackend();
    const hsUrl = "https://localhost";
    const accessToken = "s3cret";
    const client = new MatrixClient(hsUrl, accessToken, storage);
    setRequestFn(http.requestFn);

    return {http, hsUrl, accessToken, client};
}

// @ts-ignore
describe('MatrixClient', () => {
    // @ts-ignore
    describe("doRequest", () => {
        // @ts-ignore
        it('should use the request function defined', async () => {
            const {client} = createTestClient();

            const testFn = ((_, cb) => cb(null, {statusCode: 200}));
            const spy = simple.spy(testFn);
            setRequestFn(spy);

            await client.doRequest("GET", "/test");
            expect(spy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should reject upon error', async () => {
            const {client, http} = createTestClient();
            http.when("GET", "/test").respond(404, {error: "Not Found"});

            try {
                http.flushAllExpected();
                await client.doRequest("GET", "/test");

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Expected an error and didn't get one");
            } catch (e) {
                expect(e.statusCode).toBe(404);
            }
        });

        // @ts-ignore
        it('should return a parsed JSON body', async () => {
            const {client, http} = createTestClient();

            const expectedResponse = {test: 1234};
            http.when("GET", "/test").respond(200, expectedResponse);

            http.flushAllExpected();
            const response = await client.doRequest("GET", "/test");
            expect(response).toMatchObject(expectedResponse);
        });

        // @ts-ignore
        it('should be kind with prefixed slashes', async () => {
            const {client, http} = createTestClient();

            const expectedResponse = {test: 1234};
            http.when("GET", "/test").respond(200, expectedResponse);

            http.flushAllExpected();
            const response = await client.doRequest("GET", "test");
            expect(response).toMatchObject(expectedResponse);
        });

        // @ts-ignore
        it('should send the appropriate body', async () => {
            const {client, http} = createTestClient();

            const expectedInput = {test: 1234};
            http.when("PUT", "/test").respond(200, (path, content) => {
                expect(content).toMatchObject(expectedInput);
                return {};
            });

            http.flushAllExpected();
            await client.doRequest("PUT", "/test", null, expectedInput);
        });

        // @ts-ignore
        it('should send the appropriate query string', async () => {
            const {client, http} = createTestClient();

            const expectedInput = {test: 1234};
            http.when("GET", "/test").respond(200, (path, content, req) => {
                expect(req.opts.qs).toMatchObject(expectedInput);
                return {};
            });

            http.flushAllExpected();
            await client.doRequest("GET", "/test", expectedInput);
        });

        // @ts-ignore
        it('should send the access token in the Authorization header', async () => {
            const {client, http, accessToken} = createTestClient();

            http.when("GET", "/test").respond(200, (path, content, req) => {
                expect(req.opts.headers["Authorization"]).toEqual(`Bearer ${accessToken}`);
                return {};
            });

            http.flushAllExpected();
            await client.doRequest("GET", "/test");
        });

        // @ts-ignore
        it('should send application/json by default', async () => {
            const {client, http} = createTestClient();

            http.when("PUT", "/test").respond(200, (path, content, req) => {
                expect(req.opts.headers["Content-Type"]).toEqual("application/json");
                return {};
            });

            http.flushAllExpected();
            await client.doRequest("PUT", "/test", null, {test: 1});
        });

        // @ts-ignore
        it('should send the content-type of choice where possible', async () => {
            const {client, http} = createTestClient();

            const contentType = "testing/type";
            const fakeJson = `{"BUFFER": "HACK"}`;
            Buffer.isBuffer = <any>(i => i === fakeJson);


            http.when("PUT", "/test").respond(200, (path, content, req) => {
                expect(req.opts.headers["Content-Type"]).toEqual(contentType);
                return {};
            });

            http.flushAllExpected();
            await client.doRequest("PUT", "/test", null, fakeJson, 60000, false, contentType);
        });

        // @ts-ignore
        it('should return raw responses if requested', async () => {
            const {client, http} = createTestClient();

            const expectedOutput = {hello: "world"};

            http.when("PUT", "/test").respond(200, expectedOutput);

            http.flushAllExpected();
            const result = await client.doRequest("PUT", "/test", null, {}, 60000, true);
            // HACK: We can't check the body because of the mock library. Check the status code instead.
            expect(result.statusCode).toBe(200);
        });

        // @ts-ignore
        it('should proxy the timeout to request', async () => {
            const {client, http} = createTestClient();

            const timeout = 10;

            http.when("GET", "/test").respond(200, (path, content, req) => {
                expect(req.opts.timeout).toBe(timeout);
            });

            http.flushAllExpected();
            await client.doRequest("GET", "/test", null, null, timeout);
        });
    });

    // @ts-ignore
    describe('impersonateUserId', () => {
        // @ts-ignore
        it('should set a user_id param on requests', async () => {
            const {client, http} = createTestClient();

            const userId = "@testing:example.org";
            client.impersonateUserId(userId);

            http.when("GET", "/test").respond(200, (path, content, req) => {
                expect(req.opts.qs.user_id).toBe(userId);
            });


            http.flushAllExpected();
            await client.doRequest("GET", "/test");
        });
    });

    // @ts-ignore
    describe('unstableApis', () => {
        // @ts-ignore
        it('should always return an object', async () => {
            const {client} = createTestClient();

            const result = client.unstableApis;
            expect(result).toBeDefined();
        });
    });

    // @ts-ignore
    describe('getAccountData', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const eventType = "io.t2bot.test.data";
            const userId = "@test:example.org";

            client.getUserId = () => Promise.resolve(userId);

            http.when("GET", "/_matrix/client/r0/user").respond(200, (path) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/user/${encodeURIComponent(userId)}/account_data/${encodeURIComponent(eventType)}`);
                return {};
            });

            http.flushAllExpected();
            await client.getAccountData(eventType);
        });
    });

    // @ts-ignore
    describe('getRoomAccountData', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const eventType = "io.t2bot.test.data";
            const roomId = "!test:example.org";
            const userId = "@test:example.org";

            client.getUserId = () => Promise.resolve(userId);

            http.when("GET", "/_matrix/client/r0/user").respond(200, (path) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/user/${encodeURIComponent(userId)}/rooms/${encodeURIComponent(roomId)}/account_data/${encodeURIComponent(eventType)}`);
                return {};
            });

            http.flushAllExpected();
            await client.getRoomAccountData(eventType, roomId);
        });
    });

    // @ts-ignore
    describe('setAccountData', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const eventType = "io.t2bot.test.data";
            const userId = "@test:example.org";
            const eventContent = {test: 123};

            client.getUserId = () => Promise.resolve(userId);

            http.when("PUT", "/_matrix/client/r0/user").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/user/${encodeURIComponent(userId)}/account_data/${encodeURIComponent(eventType)}`);
                expect(content).toMatchObject(eventContent);
                return {};
            });

            http.flushAllExpected();
            await client.setAccountData(eventType, eventContent);
        });
    });

    // @ts-ignore
    describe('setRoomAccountData', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const eventType = "io.t2bot.test.data";
            const roomId = "!test:example.org";
            const userId = "@test:example.org";
            const eventContent = {test: 123};

            client.getUserId = () => Promise.resolve(userId);

            http.when("PUT", "/_matrix/client/r0/user").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/user/${encodeURIComponent(userId)}/rooms/${encodeURIComponent(roomId)}/account_data/${encodeURIComponent(eventType)}`);
                expect(content).toMatchObject(eventContent);
                return {};
            });

            http.flushAllExpected();
            await client.setRoomAccountData(eventType, roomId, eventContent);
        });
    });

    // @ts-ignore
    describe('createRoomAlias', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const alias = "#test:example.org";
            const roomId = "!abc:example.org";

            http.when("PUT", "/_matrix/client/r0/directory/room/").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/directory/room/${encodeURIComponent(alias)}`);
                expect(content).toMatchObject({room_id: roomId});
                return {};
            });

            http.flushAllExpected();
            await client.createRoomAlias(alias, roomId);
        });
    });

    // @ts-ignore
    describe('deleteRoomAlias', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const alias = "#test:example.org";

            http.when("DELETE", "/_matrix/client/r0/directory/room/").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/directory/room/${encodeURIComponent(alias)}`);
                return {};
            });

            http.flushAllExpected();
            await client.deleteRoomAlias(alias);
        });
    });

    // @ts-ignore
    describe('setDirectoryVisibility', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!test:example.org";
            const visibility = "public";

            http.when("PUT", "/_matrix/client/r0/directory/list/room/").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/directory/list/room/${encodeURIComponent(roomId)}`);
                expect(content).toMatchObject({visibility: visibility});
                return {};
            });

            http.flushAllExpected();
            await client.setDirectoryVisibility(roomId, visibility);
        });
    });

    // @ts-ignore
    describe('getDirectoryVisibility', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!test:example.org";

            http.when("GET", "/_matrix/client/r0/directory/list/room/").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/directory/list/room/${encodeURIComponent(roomId)}`);
                return {};
            });

            http.flushAllExpected();
            await client.getDirectoryVisibility(roomId);
        });

        // @ts-ignore
        it('should return the right visibility string', async () => {
            const {client, http} = createTestClient();

            const roomId = "!test:example.org";
            const visibility = "public";

            http.when("GET", "/_matrix/client/r0/directory/list/room/").respond(200, {visibility: visibility});

            http.flushAllExpected();
            const result = await client.getDirectoryVisibility(roomId);
            expect(result).toEqual(visibility);
        });
    });

    // @ts-ignore
    describe('resolveRoom', () => {
        // @ts-ignore
        it('should return the raw room ID if given an ID', async () => {
            const {client} = createTestClient();

            const roomId = "!test:example.org";
            const result = await client.resolveRoom(roomId);
            expect(result).toEqual(roomId);
        });

        // @ts-ignore
        it('should try to look up room aliases', async () => {
            const {client} = createTestClient();

            const roomId = "!abc123:example.org";
            const alias = "#test:example.org";

            const spy = simple.stub().returnWith(new Promise(((resolve, reject) => resolve({
                roomId: roomId,
                residentServers: []
            }))));
            client.lookupRoomAlias = spy;

            const result = await client.resolveRoom(alias);
            expect(result).toEqual(roomId);
            expect(spy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should error on invalid identifiers', async () => {
            const {client} = createTestClient();

            try {
                await client.resolveRoom("NOT A ROOM");

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to throw an error on an invalid ID");
            } catch (e) {
                expect(e.message).toEqual("Invalid room ID or alias");
            }
        });
    });

    // @ts-ignore
    describe('lookupRoomAlias', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const alias = "#test:example.org";
            const servers = ["example.org", "localhost"];

            http.when("GET", "/_matrix/client/r0/directory/room/").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/directory/room/${encodeURIComponent(alias)}`);
                return {room_id: roomId, servers: servers};
            });

            http.flushAllExpected();
            await client.lookupRoomAlias(alias);
        });

        // @ts-ignore
        it('should return a translated response', async () => {
            const {client, http} = createTestClient();

            const roomId = "!abc123:example.org";
            const alias = "#test:example.org";
            const servers = ["example.org", "localhost"];

            http.when("GET", "/_matrix/client/r0/directory/room/").respond(200, {room_id: roomId, servers: servers});

            http.flushAllExpected();
            const result = await client.lookupRoomAlias(alias);
            expect(result).toMatchObject({roomId: roomId, residentServers: servers});
        });
    });

    // @ts-ignore
    describe('inviteUser', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const userId = "@example:matrix.org";

            http.when("POST", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/invite`);
                expect(content).toMatchObject({user_id: userId});
                return {};
            });

            http.flushAllExpected();
            await client.inviteUser(userId, roomId);
        });
    });

    // @ts-ignore
    describe('kickUser', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const userId = "@example:matrix.org";

            http.when("POST", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/kick`);
                expect(content).toMatchObject({user_id: userId});
                return {};
            });

            http.flushAllExpected();
            await client.kickUser(userId, roomId);
        });

        // @ts-ignore
        it('should support a reason', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const userId = "@example:matrix.org";
            const reason = "Excessive unit testing";

            http.when("POST", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/kick`);
                expect(content).toMatchObject({user_id: userId, reason: reason});
                return {};
            });

            http.flushAllExpected();
            await client.kickUser(userId, roomId, reason);
        });
    });

    // @ts-ignore
    describe('banUser', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const userId = "@example:matrix.org";

            http.when("POST", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/ban`);
                expect(content).toMatchObject({user_id: userId});
                return {};
            });

            http.flushAllExpected();
            await client.banUser(userId, roomId);
        });

        // @ts-ignore
        it('should support a reason', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const userId = "@example:matrix.org";
            const reason = "Excessive unit testing";

            http.when("POST", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/ban`);
                expect(content).toMatchObject({user_id: userId, reason: reason});
                return {};
            });

            http.flushAllExpected();
            await client.banUser(userId, roomId, reason);
        });
    });

    // @ts-ignore
    describe('unbanUser', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const userId = "@example:matrix.org";

            http.when("POST", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/unban`);
                expect(content).toMatchObject({user_id: userId});
                return {};
            });

            http.flushAllExpected();
            await client.unbanUser(userId, roomId);
        });
    });

    // @ts-ignore
    describe('getUserId', () => {
        // @ts-ignore
        it('should return the user ID if it is already known', async () => {
            const {client} = createTestClient();

            const userId = "@example:matrix.org";
            (<any>client).userId = userId;

            const result = await client.getUserId();
            expect(result).toEqual(userId);
        });

        // @ts-ignore
        it('should request the user ID if it is not known', async () => {
            const {client, http} = createTestClient();

            const userId = "@example:matrix.org";

            http.when("GET", "/_matrix/client/r0/account/whoami").respond(200, {user_id: userId});

            http.flushAllExpected();
            const result = await client.getUserId();
            expect(result).toEqual(userId);
        });
    });

    // @ts-ignore
    describe('stop', () => {
        // @ts-ignore
        it('should stop when requested', async () => {
            const {client, http} = createTestClient();

            (<any>client).userId = "@not_used:example.org"; // to prevent calls to /whoami

            const max = 5;
            let count = 0;

            const waitPromise = new Promise((resolve, reject) => {
                for (let i = 0; i <= max * 2; i++) {
                    http.when("GET", "/_matrix/client/r0/sync").respond(200, (path, content) => {
                        expect(count).toBeLessThan(max + 1);
                        count++;
                        if (count === max) {
                            client.stop();

                            // Wait a bit to ensure the client doesn't call /sync anymore
                            setTimeout(resolve, 3000);
                        }
                        return {next_batch: "123"};
                    });
                }
            });

            http.flushAllExpected().catch(() => false);
            await client.start();
            expect(count).toBeLessThan(max);
            await waitPromise;
            expect(count).toBe(max);
        }).timeout(10000);
    });

    // @ts-ignore
    describe('start', () => {
        // @ts-ignore
        it('should use an existing filter if one is present', async () => {
            const storage = new MemoryStorageProvider();
            const {client, http} = createTestClient(storage);

            (<any>client).userId = "@notused:example.org"; // to prevent calls to /whoami

            const filter = {rooms: {limit: 12}};

            simple.mock(storage, "getFilter").returnWith({id: 12, filter: filter});

            http.when("GET", "/_matrix/client/r0/sync").respond(200, (path, content) => {
                client.stop();
                return {next_batch: "123"};
            });

            http.flushAllExpected();
            await client.start(filter);
        });

        // @ts-ignore
        it('should create a filter when the stored filter is outdated', async () => {
            const storage = new MemoryStorageProvider();
            const {client, http, hsUrl} = createTestClient(storage);

            const userId = "@testuser:example.org";
            (<any>client).userId = userId; // to prevent calls to /whoami

            const filter = {rooms: {limit: 12}};
            const filterId = "abc";

            simple.mock(storage, "getFilter").returnWith({id: filterId + "__WRONG", filter: {wrong_filter: 1}});
            const setFilterFn = simple.mock(storage, "setFilter").callFn(filterObj => {
                expect(filterObj).toBeDefined();
                expect(filterObj.id).toEqual(filterId);
                expect(filterObj.filter).toMatchObject(filter);
            });

            http.when("POST", "/_matrix/client/r0/user").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/user/${encodeURIComponent(userId)}/filter`);
                expect(content).toMatchObject(filter);
                client.stop(); // avoid a sync early
                return {filter_id: filterId};
            });

            http.flushAllExpected();
            await client.start(filter);
            expect(setFilterFn.callCount).toBe(1);
        });

        // @ts-ignore
        it('should create a filter when there is no stored filter', async () => {
            const storage = new MemoryStorageProvider();
            const {client, http, hsUrl} = createTestClient(storage);

            const userId = "@testuser:example.org";
            (<any>client).userId = userId; // to prevent calls to /whoami

            const filter = {rooms: {limit: 12}};
            const filterId = "abc";

            const getFilterFn = simple.mock(storage, "getFilter").returnWith(null);
            const setFilterFn = simple.mock(storage, "setFilter").callFn(filterObj => {
                expect(filterObj).toBeDefined();
                expect(filterObj.id).toEqual(filterId);
                expect(filterObj.filter).toMatchObject(filter);
            });

            http.when("POST", "/_matrix/client/r0/user").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/user/${encodeURIComponent(userId)}/filter`);
                expect(content).toMatchObject(filter);
                client.stop(); // avoid a sync early
                return {filter_id: filterId};
            });

            http.flushAllExpected();
            await client.start(filter);
            expect(getFilterFn.callCount).toBe(1);
            expect(setFilterFn.callCount).toBe(1);
        });

        // @ts-ignore
        it('should use the filter ID when syncing', async () => {
            const storage = new MemoryStorageProvider();
            const {client, http} = createTestClient(storage);

            (<any>client).userId = "@notused:example.org"; // to prevent calls to /whoami

            const filter = {rooms: {limit: 12}};
            const filterId = "abc12345";

            simple.mock(storage, "getFilter").returnWith({id: filterId, filter: filter});

            http.when("GET", "/_matrix/client/r0/sync").respond(200, (path, content, req) => {
                expect(req).toBeDefined();
                expect(req.opts.qs.filter).toEqual(filterId);
                client.stop();
                return {next_batch: "1234"};
            });

            http.flushAllExpected();
            await client.start(filter);
        });

        // @ts-ignore
        it('should make sync requests with the new token', async () => {
            const storage = new MemoryStorageProvider();
            const {client, http} = createTestClient(storage);

            (<any>client).userId = "@notused:example.org"; // to prevent calls to /whoami

            const filter = {rooms: {limit: 12}};
            const filterId = "abc12345";
            const secondToken = "second";

            const waitPromise = new Promise(((resolve, reject) => {
                simple.mock(storage, "getFilter").returnWith({id: filterId, filter: filter});
                const setSyncTokenFn = simple.mock(storage, "setSyncToken").callFn(newToken => {
                    expect(newToken).toEqual(secondToken);
                    if (setSyncTokenFn.callCount === 2) resolve();
                });
            }));

            http.when("GET", "/_matrix/client/r0/sync").respond(200, (path, content, req) => {
                expect(req).toBeDefined();
                expect(req.opts.qs.since).toBeUndefined();
                return {next_batch: secondToken};
            });
            http.when("GET", "/_matrix/client/r0/sync").respond(200, (path, content, req) => {
                expect(req).toBeDefined();
                expect(req.opts.qs.since).toEqual(secondToken);
                client.stop();
                return {next_batch: secondToken};
            });

            http.flushAllExpected();
            await client.start(filter);
            await waitPromise;
        });

        // @ts-ignore
        it('should read the sync token from the store', async () => {
            const storage = new MemoryStorageProvider();
            const {client, http} = createTestClient(storage);

            (<any>client).userId = "@notused:example.org"; // to prevent calls to /whoami

            const filter = {rooms: {limit: 12}};
            const filterId = "abc12345";
            const syncToken = "testing";

            simple.mock(storage, "getFilter").returnWith({id: filterId, filter: filter});
            const getSyncTokenFn = simple.mock(storage, "getSyncToken").returnWith(syncToken);
            const waitPromise = new Promise(((resolve, reject) => {
                simple.mock(storage, "setSyncToken").callFn(newToken => {
                    expect(newToken).toEqual(syncToken);
                    resolve();
                });
            }));

            http.when("GET", "/_matrix/client/r0/sync").respond(200, (path, content, req) => {
                expect(req).toBeDefined();

                expect(req.opts.qs.since).toEqual(syncToken);
                client.stop();

                return {next_batch: syncToken};
            });

            http.flushAllExpected();
            await client.start(filter);
            expect(getSyncTokenFn.callCount).toBe(1);
            await waitPromise;
        });

        // @ts-ignore
        it('should use the syncing presence variable', async () => {
            const storage = new MemoryStorageProvider();
            const {client, http} = createTestClient(storage);

            (<any>client).userId = "@notused:example.org"; // to prevent calls to /whoami

            const filter = {rooms: {limit: 12}};
            const filterId = "abc12345";
            const presence = "online";

            simple.mock(storage, "getFilter").returnWith({id: filterId, filter: filter});

            http.when("GET", "/_matrix/client/r0/sync").respond(200, (path, content, req) => {
                expect(req).toBeDefined();
                expect(req.opts.qs.presence).toBeUndefined();
                client.syncingPresence = presence;
                return {next_batch: "testing"};
            });
            http.when("GET", "/_matrix/client/r0/sync").respond(200, (path, content, req) => {
                expect(req).toBeDefined();
                expect(req.opts.qs.presence).toEqual(presence);
                client.stop();
                return {next_batch: "testing"};
            });

            http.flushAllExpected();
            await client.start(filter);
        });
    });

    // @ts-ignore
    describe('processSync', () => {

        interface ProcessSyncClient {
            userId: string;

            processSync(raw: any): Promise<any>;
        }

        // @ts-ignore
        it('should process left rooms', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 0},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.leave", spy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}};
            await client.processSync({rooms: {leave: roomsObj}});
            expect(spy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should use the most recent leave event', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 2},
                },
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 1},
                },
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 3},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.leave", spy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}};
            await client.processSync({rooms: {leave: roomsObj}});
            expect(spy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should not be affected by irrelevant events during leaves', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.not_member",
                    state_key: userId,
                    unsigned: {age: 1},
                },
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 1},
                },
                {
                    type: "m.room.member",
                    state_key: userId + "_wrong_member",
                    unsigned: {age: 1},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.leave", spy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}};
            await client.processSync({rooms: {leave: roomsObj}});
            expect(spy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should not process leaves detached from events', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.not_member",
                    state_key: userId,
                    unsigned: {age: 1},
                },
                // Intentionally don't include a membership event
                // {
                //     type: "m.room.member",
                //     state_key: userId,
                //     unsigned: {age: 1},
                // },
                {
                    type: "m.room.member",
                    state_key: userId + "_wrong_member",
                    unsigned: {age: 1},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                // expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.leave", spy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}};
            await client.processSync({rooms: {leave: roomsObj}});
            expect(spy.callCount).toBe(0);
        });

        // @ts-ignore
        it('should not get hung up on not having an age available for leaves', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.member",
                    state_key: userId,
                }
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.leave", spy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}};
            await client.processSync({rooms: {leave: roomsObj}});
            expect(spy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should process room invites', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                // TODO: Surely the 'invite' membership should be in some sort of content field?
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.invite", spy);

            const roomsObj = {};
            roomsObj[roomId] = {invite_state: {events: events}};
            await client.processSync({rooms: {invite: roomsObj}});
            expect(spy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should use the most recent invite event', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                // TODO: Surely the 'invite' membership should be in some sort of content field?
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 2},
                    content: {membership: "invite"},
                },
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 1},
                    content: {membership: "invite"},
                },
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 3},
                    content: {membership: "invite"},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.invite", spy);

            const roomsObj = {};
            roomsObj[roomId] = {invite_state: {events: events}};
            await client.processSync({rooms: {invite: roomsObj}});
            expect(spy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should not be affected by irrelevant events during invites', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                // TODO: Surely the 'invite' membership should be in some sort of content field?
                {
                    type: "m.room.not_member",
                    state_key: userId,
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
                {
                    type: "m.room.member",
                    state_key: userId + "_wrong_member",
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.invite", spy);

            const roomsObj = {};
            roomsObj[roomId] = {invite_state: {events: events}};
            await client.processSync({rooms: {invite: roomsObj}});
            expect(spy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should not process invites detached from events', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                // TODO: Surely the 'invite' membership should be in some sort of content field?
                {
                    type: "m.room.not_member",
                    state_key: userId,
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
                // Intentionally don't send a membership event
                // {
                //     type: "m.room.member",
                //     state_key: userId,
                //     unsigned: {age: 0},
                //     content: {membership: "invite"},
                // },
                {
                    type: "m.room.member",
                    state_key: userId + "_wrong_member",
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                // expect(ev).toMatchObject(events[1]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.invite", spy);

            const roomsObj = {};
            roomsObj[roomId] = {invite_state: {events: events}};
            await client.processSync({rooms: {invite: roomsObj}});
            expect(spy.callCount).toBe(0);
        });

        // @ts-ignore
        it('should not get hung up by not having an age available for invites', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                // TODO: Surely the 'invite' membership should be in some sort of content field?
                {
                    type: "m.room.member",
                    state_key: userId,
                    unsigned: {age: 0},
                    content: {membership: "invite"},
                },
            ];

            client.userId = userId;

            const spy = simple.stub().callFn((rid, ev) => {
                expect(ev).toMatchObject(events[0]);
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.invite", spy);

            const roomsObj = {};
            roomsObj[roomId] = {invite_state: {events: events}};
            await client.processSync({rooms: {invite: roomsObj}});
            expect(spy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should process room joins', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";

            client.userId = userId;

            const spy = simple.stub().callFn((rid) => {
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.join", spy);

            const roomsObj = {};
            roomsObj[roomId] = {};
            await client.processSync({rooms: {join: roomsObj}});
            expect(spy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should not duplicate room joins', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";

            client.userId = userId;

            const spy = simple.stub().callFn((rid) => {
                expect(rid).toEqual(roomId);
            });
            realClient.on("room.join", spy);

            const roomsObj = {};
            roomsObj[roomId] = {};
            await client.processSync({rooms: {join: roomsObj}});
            expect(spy.callCount).toBe(1);
            await client.processSync({rooms: {join: roomsObj}});
            expect(spy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should not break with missing properties', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            client.userId = "@syncing:example.org";

            await client.processSync({});
            await client.processSync({rooms: {}});
            await client.processSync({rooms: {join: {}, leave: {}, invite: {}}});
            await client.processSync({rooms: {join: {"!test": {}}, leave: {"!test": {}}, invite: {"!test": {}}}});
            await client.processSync({
                rooms: {
                    join: {"!test": {timeline: {}}},
                    leave: {"!test": {timeline: {}}},
                    invite: {"!test": {invite_state: {}}}
                }
            });
            await client.processSync({
                rooms: {
                    join: {"!test": {timeline: {events: []}}},
                    leave: {"!test": {timeline: {events: []}}},
                    invite: {"!test": {invite_state: {events: []}}}
                }
            });
        });

        // @ts-ignore
        it('should process events for joined rooms', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.not_message",
                    content: {body: "hello world 1"},
                },
                {
                    type: "m.room.message",
                    content: {body: "hello world 2"},
                },
                {
                    type: "m.room.not_message",
                    content: {body: "hello world 3"},
                },
                {
                    type: "m.room.message",
                    content: {body: "hello world 4"},
                },
            ];

            client.userId = userId;

            const joinSpy = simple.stub();
            const inviteSpy = simple.stub();
            const leaveSpy = simple.stub();
            const messageSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev["type"]).toEqual("m.room.message");
            });
            const eventSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
            });
            realClient.on("room.join", joinSpy);
            realClient.on("room.invite", inviteSpy);
            realClient.on("room.leave", leaveSpy);
            realClient.on("room.message", messageSpy);
            realClient.on("room.event", eventSpy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}, invite_state: {events: events}};
            await client.processSync({rooms: {join: roomsObj, leave: roomsObj, invite: roomsObj}});
            expect(joinSpy.callCount).toBe(1); // We'll technically be joining the room for the first time
            expect(inviteSpy.callCount).toBe(0);
            expect(leaveSpy.callCount).toBe(0);
            expect(messageSpy.callCount).toBe(2);
            expect(eventSpy.callCount).toBe(4);
        });

        // @ts-ignore
        it('should process tombstone events', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.tombstone",
                    content: {body: "hello world 1"},
                    state_key: "",
                },
                {
                    type: "m.room.create",
                    content: {predecessor: {room_id: "!old:example.org"}},
                    state_key: "",
                },
            ];

            client.userId = userId;

            const joinSpy = simple.stub();
            const inviteSpy = simple.stub();
            const leaveSpy = simple.stub();
            const archiveSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev["type"]).toEqual("m.room.tombstone");
            });
            const eventSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
            });
            realClient.on("room.join", joinSpy);
            realClient.on("room.invite", inviteSpy);
            realClient.on("room.leave", leaveSpy);
            realClient.on("room.archived", archiveSpy);
            realClient.on("room.event", eventSpy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}, invite_state: {events: events}};
            await client.processSync({rooms: {join: roomsObj, leave: roomsObj, invite: roomsObj}});
            expect(joinSpy.callCount).toBe(1); // We'll technically be joining the room for the first time
            expect(inviteSpy.callCount).toBe(0);
            expect(leaveSpy.callCount).toBe(0);
            expect(archiveSpy.callCount).toBe(1);
            expect(eventSpy.callCount).toBe(2);
        });

        // @ts-ignore
        it('should process create events with a predecessor', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            const events = [
                {
                    type: "m.room.tombstone",
                    content: {body: "hello world 1"},
                    state_key: "",
                },
                {
                    type: "m.room.create",
                    content: {predecessor: {room_id: "!old:example.org"}},
                    state_key: "",
                },
            ];

            client.userId = userId;

            const joinSpy = simple.stub();
            const inviteSpy = simple.stub();
            const leaveSpy = simple.stub();
            const upgradedSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev["type"]).toEqual("m.room.create");
            });
            const eventSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
            });
            realClient.on("room.join", joinSpy);
            realClient.on("room.invite", inviteSpy);
            realClient.on("room.leave", leaveSpy);
            realClient.on("room.upgraded", upgradedSpy);
            realClient.on("room.event", eventSpy);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}, invite_state: {events: events}};
            await client.processSync({rooms: {join: roomsObj, leave: roomsObj, invite: roomsObj}});
            expect(joinSpy.callCount).toBe(1); // We'll technically be joining the room for the first time
            expect(inviteSpy.callCount).toBe(0);
            expect(leaveSpy.callCount).toBe(0);
            expect(upgradedSpy.callCount).toBe(1);
            expect(eventSpy.callCount).toBe(2);
        });

        // @ts-ignore
        it('should send events through a processor', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            // TODO: Surely the membership should be in some sort of content field?
            const events = [
                {
                    type: "m.room.not_message",
                    content: {body: "hello world 1"},
                },
                {
                    type: "m.room.message",
                    content: {body: "hello world 2"},
                },
                {
                    type: "m.room.member",
                    content: {membership: "invite"},
                    state_key: userId,
                },
                {
                    type: "m.room.member",
                    content: {membership: "join"},
                    state_key: userId,
                },
                {
                    type: "m.room.member",
                    content: {membership: "leave"},
                    state_key: userId,
                },
            ];

            const processor = <IPreprocessor>{
                processEvent: (ev, client) => {
                    ev["processed"] = true;
                },
                getSupportedEventTypes: () => ["m.room.member", "m.room.message", "m.room.not_message"],
            };

            client.userId = userId;

            const joinSpy = simple.stub();
            const inviteSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev['processed']).toBeTruthy();
            });
            const leaveSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev['processed']).toBeTruthy();
            });
            const messageSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev['processed']).toBeTruthy();
            });
            const eventSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev['processed']).toBeTruthy();
            });
            realClient.on("room.join", joinSpy);
            realClient.on("room.invite", inviteSpy);
            realClient.on("room.leave", leaveSpy);
            realClient.on("room.message", messageSpy);
            realClient.on("room.event", eventSpy);

            realClient.addPreprocessor(processor);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}, invite_state: {events: events}};
            await client.processSync({rooms: {join: roomsObj, leave: roomsObj, invite: roomsObj}});
            expect(joinSpy.callCount).toBe(1);
            expect(inviteSpy.callCount).toBe(1);
            expect(leaveSpy.callCount).toBe(1);
            expect(messageSpy.callCount).toBe(1);
            expect(eventSpy.callCount).toBe(5);
        });

        // @ts-ignore
        it('should send events through the relevant processor', async () => {
            const {client: realClient} = createTestClient();
            const client = <ProcessSyncClient>(<any>realClient);

            const userId = "@syncing:example.org";
            const roomId = "!testing:example.org";
            // TODO: Surely the membership should be in some sort of content field?
            const events = [
                {
                    type: "m.room.not_message",
                    content: {body: "hello world 1"},
                },
                {
                    type: "m.room.message",
                    content: {body: "hello world 2"},
                },
                {
                    type: "m.room.member",
                    content: {membership: "invite"},
                    state_key: userId,
                },
                {
                    type: "m.room.member",
                    content: {membership: "join"},
                    state_key: userId,
                },
                {
                    type: "m.room.member",
                    content: {membership: "leave"},
                    state_key: userId,
                },
            ];

            const processedA = "A";
            const processedB = "B";
            const processorA = <IPreprocessor>{
                processEvent: (ev, client) => {
                    ev["processed"] = processedA;
                },
                getSupportedEventTypes: () => ["m.room.message"],
            };
            const processorB = <IPreprocessor>{
                processEvent: (ev, client) => {
                    ev["processed"] = processedB;
                },
                getSupportedEventTypes: () => ["m.room.not_message"],
            };

            client.userId = userId;

            const joinSpy = simple.stub();
            const inviteSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev['processed']).toBeUndefined();
            });
            const leaveSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev['processed']).toBeUndefined();
            });
            const messageSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                expect(ev['processed']).toEqual(processedA);
            });
            const eventSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(roomId);
                expect(events).toContain(ev);
                if (ev['type'] === 'm.room.not_message') {
                    expect(ev['processed']).toEqual(processedB);
                }
            });
            realClient.on("room.join", joinSpy);
            realClient.on("room.invite", inviteSpy);
            realClient.on("room.leave", leaveSpy);
            realClient.on("room.message", messageSpy);
            realClient.on("room.event", eventSpy);

            realClient.addPreprocessor(processorA);
            realClient.addPreprocessor(processorB);

            const roomsObj = {};
            roomsObj[roomId] = {timeline: {events: events}, invite_state: {events: events}};
            await client.processSync({rooms: {join: roomsObj, leave: roomsObj, invite: roomsObj}});
            expect(joinSpy.callCount).toBe(1);
            expect(inviteSpy.callCount).toBe(1);
            expect(leaveSpy.callCount).toBe(1);
            expect(messageSpy.callCount).toBe(1);
            expect(eventSpy.callCount).toBe(5);
        });
    });

    // @ts-ignore
    describe('getEvent', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const eventId = "$example:matrix.org";
            const event = {type: "m.room.message"};

            http.when("GET", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}`);
                return event;
            });

            http.flushAllExpected();
            const result = await client.getEvent(roomId, eventId);
            expect(result).toMatchObject(event);
        });

        // @ts-ignore
        it('should process events', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const eventId = "$example:matrix.org";
            const event = {type: "m.room.message"};
            const processor = <IPreprocessor>{
                processEvent: (ev, client) => {
                    ev["processed"] = true;
                },
                getSupportedEventTypes: () => ["m.room.message"],
            };

            client.addPreprocessor(processor);

            http.when("GET", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}`);
                return event;
            });

            http.flushAllExpected();
            const result = await client.getEvent(roomId, eventId);
            expect(result).toMatchObject(event);
            expect(result["processed"]).toBeTruthy();
        });
    });

    // @ts-ignore
    describe('getRoomState', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const events = [{type: "m.room.message"}, {type: "m.room.not_message"}];

            http.when("GET", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state`);
                return events;
            });

            http.flushAllExpected();
            const result = await client.getRoomState(roomId);
            expect(result).toBeDefined();
            expect(result.length).toBe(events.length);
            for (let i = 0; i < result.length; i++) {
                expect(result[i]).toMatchObject(events[i]);
            }
        });

        // @ts-ignore
        it('should process events', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const events = [{type: "m.room.message"}, {type: "m.room.not_message"}];
            const processor = <IPreprocessor>{
                processEvent: (ev, client) => {
                    ev["processed"] = true;
                },
                getSupportedEventTypes: () => ["m.room.message"],
            };

            client.addPreprocessor(processor);

            http.when("GET", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state`);
                return events;
            });

            http.flushAllExpected();
            const result = await client.getRoomState(roomId);
            expect(result).toBeDefined();
            expect(result.length).toBe(events.length);
            for (let i = 0; i < result.length; i++) {
                expect(result[i]).toMatchObject(events[i]);
                if (result[i]['type'] === 'm.room.message') {
                    expect(result[i]['processed']).toBeTruthy();
                } else {
                    expect(result[i]['processed']).toBeUndefined();
                }
            }
        });
    });

    // @ts-ignore
    describe('getRoomStateEvent', () => {
        // @ts-ignore
        it('should call the right endpoint with no state key', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const eventType = "m.room.message";
            const event = {type: "m.room.message"};

            http.when("GET", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/`);
                return event;
            });

            http.flushAllExpected();
            const result = await client.getRoomStateEvent(roomId, eventType, "");
            expect(result).toMatchObject(event);
        });

        // @ts-ignore
        it('should call the right endpoint with a state key', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const eventType = "m.room.message";
            const event = {type: "m.room.message"};
            const stateKey = "testing";

            http.when("GET", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/${stateKey}`);
                return event;
            });

            http.flushAllExpected();
            const result = await client.getRoomStateEvent(roomId, eventType, stateKey);
            expect(result).toMatchObject(event);
        });

        // @ts-ignore
        it('should process events with no state key', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const eventType = "m.room.message";
            const event = {type: "m.room.message"};
            const processor = <IPreprocessor>{
                processEvent: (ev, client) => {
                    ev["processed"] = true;
                },
                getSupportedEventTypes: () => ["m.room.message"],
            };

            client.addPreprocessor(processor);

            http.when("GET", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/`);
                return event;
            });

            http.flushAllExpected();
            const result = await client.getRoomStateEvent(roomId, eventType, "");
            expect(result).toMatchObject(event);
            expect(result["processed"]).toBeTruthy();
        });

        // @ts-ignore
        it('should process events with a state key', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!abc123:example.org";
            const eventType = "m.room.message";
            const event = {type: "m.room.message"};
            const stateKey = "testing";
            const processor = <IPreprocessor>{
                processEvent: (ev, client) => {
                    ev["processed"] = true;
                },
                getSupportedEventTypes: () => ["m.room.message"],
            };

            client.addPreprocessor(processor);

            http.when("GET", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/${stateKey}`);
                return event;
            });

            http.flushAllExpected();
            const result = await client.getRoomStateEvent(roomId, eventType, stateKey);
            expect(result).toMatchObject(event);
            expect(result["processed"]).toBeTruthy();
        });
    });

    // @ts-ignore
    describe('getUserProfile', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const userId = "@testing:example.org";
            const profile = {displayname: "testing", avatar_url: "testing", extra: "testing"};

            http.when("GET", "/_matrix/client/r0/profile").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/profile/${encodeURIComponent(userId)}`);
                return profile;
            });

            http.flushAllExpected();
            const result = await client.getUserProfile(userId);
            expect(result).toMatchObject(profile);
        });
    });

    // @ts-ignore
    describe('createRoom', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http} = createTestClient();

            const roomId = "!something:example.org";

            http.when("POST", "/_matrix/client/r0/createRoom").respond(200, (path, content) => {
                expect(content).toMatchObject({});
                return {room_id: roomId};
            });

            http.flushAllExpected();
            const result = await client.createRoom();
            expect(result).toEqual(roomId);
        });

        // @ts-ignore
        it('should call the right endpoint with all the provided properties', async () => {
            const {client, http} = createTestClient();

            const roomId = "!something:example.org";
            const properties = {
                hello: "world",
                preset: "public_chat",
            };

            http.when("POST", "/_matrix/client/r0/createRoom").respond(200, (path, content) => {
                expect(content).toMatchObject(properties);
                return {room_id: roomId};
            });

            http.flushAllExpected();
            const result = await client.createRoom(properties);
            expect(result).toEqual(roomId);
        });
    });

    // @ts-ignore
    describe('setDisplayName', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const userId = "@testing:example.org";
            const displayName = "Hello World";

            (<any>client).userId = userId; // avoid /whoami lookup

            http.when("PUT", "/_matrix/client/r0/profile").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/profile/${encodeURIComponent(userId)}/displayname`);
                expect(content).toMatchObject({displayname: displayName});
                return {};
            });

            http.flushAllExpected();
            await client.setDisplayName(displayName);
        });
    });

    // @ts-ignore
    describe('setAvatarUrl', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const userId = "@testing:example.org";
            const displayName = "Hello World";

            (<any>client).userId = userId; // avoid /whoami lookup

            http.when("PUT", "/_matrix/client/r0/profile").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/profile/${encodeURIComponent(userId)}/avatar_url`);
                expect(content).toMatchObject({avatar_url: displayName});
                return {};
            });

            http.flushAllExpected();
            await client.setAvatarUrl(displayName);
        });
    });

    // @ts-ignore
    describe('joinRoom', () => {
        // @ts-ignore
        it('should call the right endpoint for room IDs', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!testing:example.org";

            (<any>client).userId = "@joins:example.org"; // avoid /whoami lookup

            http.when("POST", "/_matrix/client/r0/join").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/join/${encodeURIComponent(roomId)}`);
                return {room_id: roomId};
            });

            http.flushAllExpected();
            const result = await client.joinRoom(roomId);
            expect(result).toEqual(roomId);
        });

        // @ts-ignore
        it('should call the right endpoint with server names', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!testing:example.org";
            const serverNames = ['example.org', 'localhost'];

            (<any>client).userId = "@joins:example.org"; // avoid /whoami lookup

            http.when("POST", "/_matrix/client/r0/join").respond(200, (path, content, req) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/join/${encodeURIComponent(roomId)}`);
                expect(req.opts.qs['server_name'].length).toEqual(serverNames.length);
                for (let i = 0; i < serverNames.length; i++) {
                    expect(req.opts.qs['server_name'][i]).toEqual(serverNames[i]);
                }
                return {room_id: roomId};
            });

            http.flushAllExpected();
            const result = await client.joinRoom(roomId, serverNames);
            expect(result).toEqual(roomId);
        });

        // @ts-ignore
        it('should call the right endpoint for room aliases', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomAlias = "#abc123:example.org";
            const roomId = "!testing:example.org";

            (<any>client).userId = "@joins:example.org"; // avoid /whoami lookup

            http.when("POST", "/_matrix/client/r0/join").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/join/${encodeURIComponent(roomAlias)}`);
                return {room_id: roomId};
            });

            http.flushAllExpected();
            const result = await client.joinRoom(roomAlias);
            expect(result).toEqual(roomId);
        });

        // @ts-ignore
        it('should use a join strategy for room IDs', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!testing:example.org";
            const userId = "@joins:example.org";
            const strategy = <IJoinRoomStrategy>{
                joinRoom: (rid: string, uid: string, apiCall: any) => {
                    expect(rid).toEqual(roomId);
                    expect(uid).toEqual(userId);
                    return apiCall(roomId);
                },
            };

            (<any>client).userId = userId; // avoid /whoami lookup
            client.setJoinStrategy(strategy);

            const strategySpy = simple.mock(strategy, "joinRoom").callOriginal();

            http.when("POST", "/_matrix/client/r0/join").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/join/${encodeURIComponent(roomId)}`);
                return {room_id: roomId};
            });

            http.flushAllExpected();
            const result = await client.joinRoom(roomId);
            expect(result).toEqual(roomId);
            expect(strategySpy.callCount).toBe(1);
        });

        // @ts-ignore
        it('should use a join strategy for room aliases', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!testing:example.org";
            const roomAlias = "#abc123:example.org";
            const userId = "@joins:example.org";
            const strategy = <IJoinRoomStrategy>{
                joinRoom: (rid: string, uid: string, apiCall: any) => {
                    expect(rid).toEqual(roomAlias);
                    expect(uid).toEqual(userId);
                    return apiCall(roomId);
                },
            };

            (<any>client).userId = userId; // avoid /whoami lookup
            client.setJoinStrategy(strategy);

            const strategySpy = simple.mock(strategy, "joinRoom").callOriginal();

            http.when("POST", "/_matrix/client/r0/join").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/join/${encodeURIComponent(roomId)}`);
                return {room_id: roomId};
            });

            http.flushAllExpected();
            const result = await client.joinRoom(roomAlias);
            expect(result).toEqual(roomId);
            expect(strategySpy.callCount).toBe(1);
        });
    });

    // @ts-ignore
    describe('getJoinedRooms', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomIds = ["!abc:example.org", "!123:example.org"];

            http.when("GET", "/_matrix/client/r0/joined_rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/joined_rooms`);
                return {joined_rooms: roomIds};
            });

            http.flushAllExpected();
            const result = await client.getJoinedRooms();
            expect(result).toBeDefined();
            expect(result.length).toBe(roomIds.length);
            for (let i = 0; i < result.length; i++) {
                expect(result[i]).toEqual(roomIds[i]);
            }
        });
    });

    // @ts-ignore
    describe('getJoinedRoomMembers', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!testing:example.org";
            const members = ["@alice:example.org", "@bob:example.org"];

            http.when("GET", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/joined_members`);
                const obj = {};
                for (const member of members) obj[member] = {membership: "join"};
                return {joined: obj};
            });

            http.flushAllExpected();
            const result = await client.getJoinedRoomMembers(roomId);
            expect(result).toBeDefined();
            expect(result.length).toBe(members.length);
            for (let i = 0; i < result.length; i++) {
                expect(result[i]).toEqual(members[i]);
            }
        });
    });

    // @ts-ignore
    describe('leaveRoom', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!testing:example.org";

            http.when("POST", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/leave`);
                return {};
            });

            http.flushAllExpected();
            await client.leaveRoom(roomId);
        });
    });

    // @ts-ignore
    describe('sendReadReceipt', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!testing:example.org";
            const eventId = "$something:example.org";

            http.when("POST", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/receipt/m.read/${encodeURIComponent(eventId)}`);
                return {};
            });

            http.flushAllExpected();
            await client.sendReadReceipt(roomId, eventId);
        });
    });
    
    // @ts-ignore
    describe('setTyping', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!testing:example.org";
            const userId = "@test:example.com";
            const typing = true;
            const timeout = 15000; // ms
            
            client.getUserId = () => Promise.resolve(userId);

            http.when("POST", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/typing/${encodeURIComponent(userId)}`);
                expect(content).toMatchObject({typing: typing, timeout: timeout});
                return {};
            });

            http.flushAllExpected();
            await client.setTyping(roomId, typing, timeout);
        });
    });


    // @ts-ignore
    describe('sendNotice', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!testing:example.org";
            const eventId = "$something:example.org";
            const content = {
                body: "Hello World",
                msgtype: "m.notice",
            };

            http.when("PUT", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                const idx = path.indexOf(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/send/m.room.message/`);
                expect(idx).toBe(0);
                expect(content).toMatchObject(content);
                return {event_id: eventId};
            });

            http.flushAllExpected();
            const result = await client.sendNotice(roomId, content.body);
            expect(result).toEqual(eventId);
        });
    });

    // @ts-ignore
    describe('sendMessage', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!testing:example.org";
            const eventId = "$something:example.org";
            const content = {
                body: "Hello World",
                msgtype: "m.text",
                sample: true,
            };

            http.when("PUT", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                const idx = path.indexOf(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/send/m.room.message/`);
                expect(idx).toBe(0);
                expect(content).toMatchObject(content);
                return {event_id: eventId};
            });

            http.flushAllExpected();
            const result = await client.sendMessage(roomId, content);
            expect(result).toEqual(eventId);
        });
    });

    // @ts-ignore
    describe('sendStateEvent', () => {
        // @ts-ignore
        it('should call the right endpoint with no state key', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!testing:example.org";
            const eventId = "$something:example.org";
            const stateKey = "";
            const eventType = "m.room.message";
            const content = {
                body: "Hello World",
                msgtype: "m.text",
                sample: true,
            };

            http.when("PUT", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                const idx = path.indexOf(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/`);
                expect(idx).toBe(0);
                expect(content).toMatchObject(content);
                return {event_id: eventId};
            });

            http.flushAllExpected();
            const result = await client.sendStateEvent(roomId, eventType, stateKey, content);
            expect(result).toEqual(eventId);
        });

        // @ts-ignore
        it('should call the right endpoint with a state key', async () => {
            const {client, http, hsUrl} = createTestClient();

            const roomId = "!testing:example.org";
            const eventId = "$something:example.org";
            const stateKey = "testing";
            const eventType = "m.room.message";
            const content = {
                body: "Hello World",
                msgtype: "m.text",
                sample: true,
            };

            http.when("PUT", "/_matrix/client/r0/rooms").respond(200, (path, content) => {
                const idx = path.indexOf(`${hsUrl}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/`);
                expect(idx).toBe(0);
                expect(content).toMatchObject(content);
                return {event_id: eventId};
            });

            http.flushAllExpected();
            const result = await client.sendStateEvent(roomId, eventType, stateKey, content);
            expect(result).toEqual(eventId);
        });
    });

    // @ts-ignore
    describe('userHasPowerLevelFor', () => {
        // @ts-ignore
        it('throws when a power level event cannot be located', async () => {
            const {client} = createTestClient();

            const roomId = "!testing:example.org";
            const userId = "@testing:example.org";
            const eventType = "m.room.message";
            const isState = false;

            const getStateEventSpy = simple.mock(client, "getRoomStateEvent").callFn((rid, evType, stateKey) => {
                expect(rid).toEqual(roomId);
                expect(evType).toEqual("m.room.power_levels");
                expect(stateKey).toEqual("");
                return null;
            });

            try {
                await client.userHasPowerLevelFor(userId, roomId, eventType, isState);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Expected call to fail");
            } catch (e) {
                expect(e.message).toEqual("No power level event found");
            }
            expect(getStateEventSpy.callCount).toBe(1);
        });

        // @ts-ignore
        it('assumes PL50 for state events when no power level information is available', async () => {
            const {client} = createTestClient();

            const roomId = "!testing:example.org";
            const userId = "@testing:example.org";
            const eventType = "m.room.message";
            const isState = true;
            let plEvent = {users: {}};

            const getStateEventSpy = simple.mock(client, "getRoomStateEvent").callFn((rid, evType, stateKey) => {
                expect(rid).toEqual(roomId);
                expect(evType).toEqual("m.room.power_levels");
                expect(stateKey).toEqual("");
                return plEvent;
            });

            let result;

            plEvent.users[userId] = 50;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(1);

            plEvent.users[userId] = 49;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(false);
            expect(getStateEventSpy.callCount).toBe(2);

            plEvent.users[userId] = 51;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(3);
        });

        // @ts-ignore
        it('assumes PL0 for state events when no power level information is available', async () => {
            const {client} = createTestClient();

            const roomId = "!testing:example.org";
            const userId = "@testing:example.org";
            const eventType = "m.room.message";
            const isState = false;
            let plEvent = {users: {}};

            const getStateEventSpy = simple.mock(client, "getRoomStateEvent").callFn((rid, evType, stateKey) => {
                expect(rid).toEqual(roomId);
                expect(evType).toEqual("m.room.power_levels");
                expect(stateKey).toEqual("");
                return plEvent;
            });

            let result;

            plEvent.users[userId] = 0;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(1);

            plEvent.users[userId] = 1;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(2);

            plEvent.users[userId] = -1;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(false);
            expect(getStateEventSpy.callCount).toBe(3);

            plEvent.users = {};
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(4);
        });

        // @ts-ignore
        it('uses the state_default parameter', async () => {
            const {client} = createTestClient();

            const roomId = "!testing:example.org";
            const userId = "@testing:example.org";
            const eventType = "m.room.message";
            const isState = true;
            let plEvent = {state_default: 75, users_default: 99, users: {}};

            const getStateEventSpy = simple.mock(client, "getRoomStateEvent").callFn((rid, evType, stateKey) => {
                expect(rid).toEqual(roomId);
                expect(evType).toEqual("m.room.power_levels");
                expect(stateKey).toEqual("");
                return plEvent;
            });

            let result;

            plEvent.users[userId] = 75;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(1);

            plEvent.users[userId] = 76;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(2);

            plEvent.users[userId] = 74;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(false);
            expect(getStateEventSpy.callCount).toBe(3);
        });

        // @ts-ignore
        it('uses the users_default parameter', async () => {
            const {client} = createTestClient();

            const roomId = "!testing:example.org";
            const userId = "@testing:example.org";
            const eventType = "m.room.message";
            const isState = false;
            let plEvent = {state_default: 99, users_default: 75, users: {}};

            const getStateEventSpy = simple.mock(client, "getRoomStateEvent").callFn((rid, evType, stateKey) => {
                expect(rid).toEqual(roomId);
                expect(evType).toEqual("m.room.power_levels");
                expect(stateKey).toEqual("");
                return plEvent;
            });

            let result;

            plEvent.users[userId] = 75;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(1);

            plEvent.users[userId] = 76;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(2);

            plEvent.users[userId] = 74;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(false);
            expect(getStateEventSpy.callCount).toBe(3);
        });

        // @ts-ignore
        it('uses the events[event_type] parameter for non-state events', async () => {
            const {client} = createTestClient();

            const roomId = "!testing:example.org";
            const userId = "@testing:example.org";
            const eventType = "m.room.message";
            const isState = false;
            let plEvent = {state_default: 99, users_default: 99, events: {}, users: {}};
            plEvent["events"][eventType] = 75;

            const getStateEventSpy = simple.mock(client, "getRoomStateEvent").callFn((rid, evType, stateKey) => {
                expect(rid).toEqual(roomId);
                expect(evType).toEqual("m.room.power_levels");
                expect(stateKey).toEqual("");
                return plEvent;
            });

            let result;

            plEvent.users[userId] = 75;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(1);

            plEvent.users[userId] = 76;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(2);

            plEvent.users[userId] = 74;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(false);
            expect(getStateEventSpy.callCount).toBe(3);
        });

        // @ts-ignore
        it('uses the events[event_type] parameter for state events', async () => {
            const {client} = createTestClient();

            const roomId = "!testing:example.org";
            const userId = "@testing:example.org";
            const eventType = "m.room.message";
            const isState = true;
            let plEvent = {state_default: 99, users_default: 99, events: {}, users: {}};
            plEvent["events"][eventType] = 75;

            const getStateEventSpy = simple.mock(client, "getRoomStateEvent").callFn((rid, evType, stateKey) => {
                expect(rid).toEqual(roomId);
                expect(evType).toEqual("m.room.power_levels");
                expect(stateKey).toEqual("");
                return plEvent;
            });

            let result;

            plEvent.users[userId] = 75;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(1);

            plEvent.users[userId] = 76;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(2);

            plEvent.users[userId] = 74;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(false);
            expect(getStateEventSpy.callCount).toBe(3);
        });

        // @ts-ignore
        it('uses the events[event_type] parameter safely', async () => {
            const {client} = createTestClient();

            const roomId = "!testing:example.org";
            const userId = "@testing:example.org";
            const eventType = "m.room.message";
            const isState = false;
            let plEvent = {state_default: 99, users_default: 75, events: {}, users: {}};
            plEvent["events"][eventType + "_wrong"] = 99;

            const getStateEventSpy = simple.mock(client, "getRoomStateEvent").callFn((rid, evType, stateKey) => {
                expect(rid).toEqual(roomId);
                expect(evType).toEqual("m.room.power_levels");
                expect(stateKey).toEqual("");
                return plEvent;
            });

            let result;

            plEvent.users[userId] = 75;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(1);

            plEvent.users[userId] = 76;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(2);

            plEvent.users[userId] = 74;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(false);
            expect(getStateEventSpy.callCount).toBe(3);
        });

        // @ts-ignore
        it('defaults the user to PL0', async () => {
            const {client} = createTestClient();

            const roomId = "!testing:example.org";
            const userId = "@testing:example.org";
            const eventType = "m.room.message";
            const isState = false;
            let plEvent = {events: {}};

            const getStateEventSpy = simple.mock(client, "getRoomStateEvent").callFn((rid, evType, stateKey) => {
                expect(rid).toEqual(roomId);
                expect(evType).toEqual("m.room.power_levels");
                expect(stateKey).toEqual("");
                return plEvent;
            });

            let result;

            plEvent.events[eventType] = 0;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(1);

            plEvent.events[eventType] = 1;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(false);
            expect(getStateEventSpy.callCount).toBe(2);

            plEvent.events[eventType] = -1;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(3);
        });

        // @ts-ignore
        it('defaults the user to PL0 safely', async () => {
            const {client} = createTestClient();

            const roomId = "!testing:example.org";
            const userId = "@testing:example.org";
            const eventType = "m.room.message";
            const isState = false;
            let plEvent = {events: {}, users: {}};

            const getStateEventSpy = simple.mock(client, "getRoomStateEvent").callFn((rid, evType, stateKey) => {
                expect(rid).toEqual(roomId);
                expect(evType).toEqual("m.room.power_levels");
                expect(stateKey).toEqual("");
                return plEvent;
            });

            let result;

            plEvent.events[eventType] = 0;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(1);

            plEvent.events[eventType] = 1;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(false);
            expect(getStateEventSpy.callCount).toBe(2);

            plEvent.events[eventType] = -1;
            result = await client.userHasPowerLevelFor(userId, roomId, eventType, isState);
            expect(result).toBe(true);
            expect(getStateEventSpy.callCount).toBe(3);
        });
    });

    // @ts-ignore
    describe('uploadContent', () => {
        // @ts-ignore
        it('should call the right endpoint', async () => {
            const {client, http} = createTestClient();

            const data = <Buffer>(<any>`{"hello":"world"}`); // we can't use a real buffer because of the mock library
            const contentType = "test/type";
            const filename = null;
            const uri = "mxc://example.org/testing";

            Buffer.isBuffer = <any>(i => i === data);

            http.when("POST", "/_matrix/media/r0/upload").respond(200, (path, content, req) => {
                expect(content).toBeDefined();
                expect(req.opts.qs.filename).toEqual(filename);
                expect(req.opts.headers["Content-Type"]).toEqual(contentType);
                expect(req.opts.body).toEqual(data);
                return {content_uri: uri};
            });

            http.flushAllExpected();
            const result = await client.uploadContent(data, contentType, filename);
            expect(result).toEqual(uri);
        });

        // @ts-ignore
        it('should use the right filename', async () => {
            const {client, http} = createTestClient();

            const data = <Buffer>(<any>`{"hello":"world"}`); // we can't use a real buffer because of the mock library
            const contentType = "test/type";
            const filename = "example.jpg";
            const uri = "mxc://example.org/testing";

            Buffer.isBuffer = <any>(i => i === data);

            http.when("POST", "/_matrix/media/r0/upload").respond(200, (path, content, req) => {
                expect(content).toBeDefined();
                expect(req.opts.qs.filename).toEqual(filename);
                expect(req.opts.headers["Content-Type"]).toEqual(contentType);
                expect(req.opts.body).toEqual(data);
                return {content_uri: uri};
            });

            http.flushAllExpected();
            const result = await client.uploadContent(data, contentType, filename);
            expect(result).toEqual(uri);
        });
    });

    // @ts-ignore
    describe('getRoomUpgradeHistory', () => {
        // @ts-ignore
        it('should calculate the room upgrade history', async () => {
            const {client} = createTestClient();

            const roomState = {
                "!prev-v3:localhost": [
                    // no events - we'll treat this as an end stop
                ],
                "!prev-v2:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$v2-prev-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "2",
                            "predecessor": {
                                "room_id": "!prev-v3:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$v2-prev-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!prev-v1:localhost",
                        },
                    },
                ],
                "!prev-v1:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$v1-prev-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "1",
                            "predecessor": {
                                "room_id": "!prev-v2:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$v1-prev-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!current:localhost",
                        },
                    },
                ],
                "!current:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$current-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "3",
                            "predecessor": {
                                "room_id": "!prev-v1:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$current-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!new-v1:localhost",
                        },
                    },
                ],
                "!new-v1:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$v1-new-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "2",
                            "predecessor": {
                                "room_id": "!current:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$v1-new-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!new-v2:localhost",
                        },
                    },
                ],
                "!new-v2:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$v2-new-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "2",
                            "predecessor": {
                                "room_id": "!new-v1:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$v2-new-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!new-v3:localhost",
                        },
                    },
                ],
                "!new-v3:localhost": [
                    // no events - we'll treat this as an end stop
                ],
            };

            const expected = {
                previous: [
                    {roomId: "!prev-v1:localhost", version: "1", refEventId: "$v1-prev-t:localhost"},
                    {roomId: "!prev-v2:localhost", version: "2", refEventId: "$v2-prev-t:localhost"},
                    {roomId: "!prev-v3:localhost", version: "1", refEventId: null},
                ],
                current: {roomId: "!current:localhost", version: "3", refEventId: null},
                newer: [
                    {roomId: "!new-v1:localhost", version: "2", refEventId: "$v1-new-c:localhost"},
                    {roomId: "!new-v2:localhost", version: "2", refEventId: "$v2-new-c:localhost"},
                    {roomId: "!new-v3:localhost", version: "1", refEventId: null},
                ],
            };

            client.getRoomState = (rid) => {
                const state = roomState[rid];
                if (state.length === 0) throw new Error("No state events");
                return Promise.resolve(state);
            };

            client.getRoomStateEvent = async (rid, eventType, stateKey) => {
                const state = await client.getRoomState(rid);
                const event = state.find(e => e['type'] === eventType && e['state_key'] === stateKey);
                if (!event) throw new Error("Event not found");
                return event['content'];
            };

            const result = await client.getRoomUpgradeHistory("!current:localhost");
            expect(result).toMatchObject(expected);
        });

        // @ts-ignore
        it('should handle cases with no previous rooms', async () => {
            const {client} = createTestClient();

            const roomState = {
                "!prev-v1:localhost": [
                    // no events - we'll treat this as an end stop
                ],
                "!current:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$current-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "3",
                            "predecessor": {
                                "room_id": "!prev-v1:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$current-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!new-v1:localhost",
                        },
                    },
                ],
                "!new-v1:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$v1-new-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "2",
                            "predecessor": {
                                "room_id": "!current:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$v1-new-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!new-v2:localhost",
                        },
                    },
                ],
                "!new-v2:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$v2-new-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "2",
                            "predecessor": {
                                "room_id": "!new-v1:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$v2-new-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!new-v3:localhost",
                        },
                    },
                ],
                "!new-v3:localhost": [
                    // no events - we'll treat this as an end stop
                ],
            };

            const expected = {
                previous: [
                    {roomId: "!prev-v1:localhost", version: "1", refEventId: null},
                ],
                current: {roomId: "!current:localhost", version: "3", refEventId: null},
                newer: [
                    {roomId: "!new-v1:localhost", version: "2", refEventId: "$v1-new-c:localhost"},
                    {roomId: "!new-v2:localhost", version: "2", refEventId: "$v2-new-c:localhost"},
                    {roomId: "!new-v3:localhost", version: "1", refEventId: null},
                ],
            };

            client.getRoomState = (rid) => {
                const state = roomState[rid];
                if (state.length === 0) throw new Error("No state events");
                return Promise.resolve(state);
            };

            client.getRoomStateEvent = async (rid, eventType, stateKey) => {
                const state = await client.getRoomState(rid);
                const event = state.find(e => e['type'] === eventType && e['state_key'] === stateKey);
                if (!event) throw new Error("Event not found");
                return event['content'];
            };

            const result = await client.getRoomUpgradeHistory("!current:localhost");
            expect(result).toMatchObject(expected);
        });

        // @ts-ignore
        it('should handle cases with no known newer rooms', async () => {
            const {client} = createTestClient();

            const roomState = {
                "!prev-v3:localhost": [
                    // no events - we'll treat this as an end stop
                ],
                "!prev-v2:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$v2-prev-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "2",
                            "predecessor": {
                                "room_id": "!prev-v3:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$v2-prev-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!prev-v1:localhost",
                        },
                    },
                ],
                "!prev-v1:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$v1-prev-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "1",
                            "predecessor": {
                                "room_id": "!prev-v2:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$v1-prev-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!current:localhost",
                        },
                    },
                ],
                "!current:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$current-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "3",
                            "predecessor": {
                                "room_id": "!prev-v1:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$current-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!new-v1:localhost",
                        },
                    },
                ],
                "!new-v1:localhost": [
                    // no events - we'll treat this as an end stop
                ],
            };

            const expected = {
                previous: [
                    {roomId: "!prev-v1:localhost", version: "1", refEventId: "$v1-prev-t:localhost"},
                    {roomId: "!prev-v2:localhost", version: "2", refEventId: "$v2-prev-t:localhost"},
                    {roomId: "!prev-v3:localhost", version: "1", refEventId: null},
                ],
                current: {roomId: "!current:localhost", version: "3", refEventId: null},
                newer: [
                    {roomId: "!new-v1:localhost", version: "1", refEventId: null},
                ],
            };

            client.getRoomState = (rid) => {
                const state = roomState[rid];
                if (state.length === 0) throw new Error("No state events");
                return Promise.resolve(state);
            };

            client.getRoomStateEvent = async (rid, eventType, stateKey) => {
                const state = await client.getRoomState(rid);
                const event = state.find(e => e['type'] === eventType && e['state_key'] === stateKey);
                if (!event) throw new Error("Event not found");
                return event['content'];
            };

            const result = await client.getRoomUpgradeHistory("!current:localhost");
            expect(result).toMatchObject(expected);
        });

        // @ts-ignore
        it('should handle cases with no newer rooms', async () => {
            const {client} = createTestClient();

            const roomState = {
                "!prev-v3:localhost": [
                    // no events - we'll treat this as an end stop
                ],
                "!prev-v2:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$v2-prev-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "2",
                            "predecessor": {
                                "room_id": "!prev-v3:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$v2-prev-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!prev-v1:localhost",
                        },
                    },
                ],
                "!prev-v1:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$v1-prev-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "1",
                            "predecessor": {
                                "room_id": "!prev-v2:localhost",
                            },
                        },
                    },
                    {
                        "type": "m.room.tombstone",
                        "event_id": "$v1-prev-t:localhost",
                        "state_key": "",
                        "content": {
                            "replacement_room": "!current:localhost",
                        },
                    },
                ],
                "!current:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$current-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "3",
                            "predecessor": {
                                "room_id": "!prev-v1:localhost",
                            },
                        },
                    },
                ],
            };

            const expected = {
                previous: [
                    {roomId: "!prev-v1:localhost", version: "1", refEventId: "$v1-prev-t:localhost"},
                    {roomId: "!prev-v2:localhost", version: "2", refEventId: "$v2-prev-t:localhost"},
                    {roomId: "!prev-v3:localhost", version: "1", refEventId: null},
                ],
                current: {roomId: "!current:localhost", version: "3", refEventId: null},
                newer: [],
            };

            client.getRoomState = (rid) => {
                const state = roomState[rid];
                if (state.length === 0) throw new Error("No state events");
                return Promise.resolve(state);
            };

            client.getRoomStateEvent = async (rid, eventType, stateKey) => {
                const state = await client.getRoomState(rid);
                const event = state.find(e => e['type'] === eventType && e['state_key'] === stateKey);
                if (!event) throw new Error("Event not found");
                return event['content'];
            };

            const result = await client.getRoomUpgradeHistory("!current:localhost");
            expect(result).toMatchObject(expected);
        });

        // @ts-ignore
        it('should handle cases with no upgrades', async () => {
            const {client} = createTestClient();

            const roomState = {
                "!current:localhost": [
                    {
                        "type": "m.room.create",
                        "event_id": "$current-c:localhost",
                        "state_key": "",
                        "content": {
                            "room_version": "3",
                        },
                    },
                ],
            };

            const expected = {
                previous: [],
                current: {roomId: "!current:localhost", version: "3", refEventId: null},
                newer: [],
            };

            client.getRoomState = (rid) => {
                const state = roomState[rid];
                if (state.length === 0) throw new Error("No state events");
                return Promise.resolve(state);
            };

            client.getRoomStateEvent = async (rid, eventType, stateKey) => {
                const state = await client.getRoomState(rid);
                const event = state.find(e => e['type'] === eventType && e['state_key'] === stateKey);
                if (!event) throw new Error("Event not found");
                return event['content'];
            };

            const result = await client.getRoomUpgradeHistory("!current:localhost");
            expect(result).toMatchObject(expected);
        });
    });
});

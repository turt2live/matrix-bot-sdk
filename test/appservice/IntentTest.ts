import * as simple from "simple-mock";
import HttpBackend from 'matrix-mock-request';
import * as tmp from "tmp";
import { StoreType } from "@matrix-org/matrix-sdk-crypto-nodejs";

import {
    Appservice,
    IAppserviceCryptoStorageProvider,
    IAppserviceOptions,
    IAppserviceStorageProvider,
    IJoinRoomStrategy,
    Intent,
    MemoryStorageProvider,
    RustSdkAppserviceCryptoStorageProvider,
    setRequestFn,
} from "../../src";

tmp.setGracefulCleanup();

describe('Intent', () => {
    it('should prepare the underlying client for a bot user', async () => {
        const userId = "@someone:example.org";
        const asToken = "s3cret";
        const hsUrl = "https://localhost";
        const appservice = <Appservice>{ botUserId: userId };
        const options = <IAppserviceOptions>{
            homeserverUrl: hsUrl,
            registration: {
                as_token: asToken,
            },
        };

        const intent = new Intent(options, userId, appservice);
        expect(intent.userId).toEqual(userId);
        expect(intent.underlyingClient).toBeDefined();
        expect((<any>intent.underlyingClient).impersonatedUserId).toBeUndefined();
        expect((<any>intent.underlyingClient).accessToken).toEqual(asToken);
        expect((<any>intent.underlyingClient).homeserverUrl).toEqual(hsUrl);
    });

    it('should prepare the underlying client for a bot user with a join strategy', async () => {
        const userId = "@someone:example.org";
        const asToken = "s3cret";
        const hsUrl = "https://localhost";
        const appservice = <Appservice>{ botUserId: userId };
        const joinStrategy = <IJoinRoomStrategy>{};
        const options = <IAppserviceOptions>{
            homeserverUrl: hsUrl,
            joinStrategy: joinStrategy,
            registration: {
                as_token: asToken,
            },
        };

        const intent = new Intent(options, userId, appservice);
        expect(intent.userId).toEqual(userId);
        expect(intent.underlyingClient).toBeDefined();
        expect((<any>intent.underlyingClient).impersonatedUserId).toBeUndefined();
        expect((<any>intent.underlyingClient).accessToken).toEqual(asToken);
        expect((<any>intent.underlyingClient).homeserverUrl).toEqual(hsUrl);
        expect((<any>intent.underlyingClient).joinStrategy).toEqual(joinStrategy);
    });

    it('should prepare the underlying client for an impersonated user', async () => {
        const userId = "@someone:example.org";
        const botUserId = "@bot:example.org";
        const asToken = "s3cret";
        const hsUrl = "https://localhost";
        const appservice = <Appservice>{ botUserId: botUserId };
        const options = <IAppserviceOptions>{
            homeserverUrl: hsUrl,
            registration: {
                as_token: asToken,
            },
        };

        const intent = new Intent(options, userId, appservice);
        expect(intent.userId).toEqual(userId);
        expect(intent.underlyingClient).toBeDefined();
        expect((<any>intent.underlyingClient).impersonatedUserId).toEqual(userId);
        expect((<any>intent.underlyingClient).accessToken).toEqual(asToken);
        expect((<any>intent.underlyingClient).homeserverUrl).toEqual(hsUrl);
    });

    it('should prepare the underlying client for an impersonated user with a join strategy', async () => {
        const userId = "@someone:example.org";
        const botUserId = "@bot:example.org";
        const asToken = "s3cret";
        const hsUrl = "https://localhost";
        const appservice = <Appservice>{ botUserId: botUserId };
        const joinStrategy = <IJoinRoomStrategy>{};
        const options = <IAppserviceOptions>{
            homeserverUrl: hsUrl,
            joinStrategy: joinStrategy,
            registration: {
                as_token: asToken,
            },
        };

        const intent = new Intent(options, userId, appservice);
        expect(intent.userId).toEqual(userId);
        expect(intent.underlyingClient).toBeDefined();
        expect((<any>intent.underlyingClient).impersonatedUserId).toEqual(userId);
        expect((<any>intent.underlyingClient).accessToken).toEqual(asToken);
        expect((<any>intent.underlyingClient).homeserverUrl).toEqual(hsUrl);
        expect((<any>intent.underlyingClient).joinStrategy).toEqual(joinStrategy);
    });

    describe('ensureRegistered', () => {
        it('should do nothing if the user is flagged as registered', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };

            const storage = new MemoryStorageProvider();
            const isRegisteredSpy = simple.mock(storage, "isUserRegistered").callFn((uid) => {
                expect(uid).toEqual(userId);
                return true;
            });
            const addRegisteredSpy = simple.mock(storage, "addRegisteredUser").callFn((uid) => {
                expect(uid).toEqual(userId);
                return true;
            });

            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);
            await intent.ensureRegistered();
            expect(isRegisteredSpy.callCount).toBe(1);
            expect(addRegisteredSpy.callCount).toBe(0);
        });

        it('should try to register the user when not flagged as such', async () => {
            const http = new HttpBackend();
            setRequestFn(http.requestFn);

            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };

            const storage = new MemoryStorageProvider();
            const isRegisteredSpy = simple.mock(storage, "isUserRegistered").callFn((uid) => {
                expect(uid).toEqual(userId);
                return false;
            });
            const addRegisteredSpy = simple.mock(storage, "addRegisteredUser").callFn((uid) => {
                expect(uid).toEqual(userId);
                return true;
            });

            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            http.when("POST", "/_matrix/client/v3/register").respond(200, (path, content) => {
                expect(content).toMatchObject({ type: "m.login.application_service", username: "someone" });
                return {};
            });

            const intent = new Intent(options, userId, appservice);
            await Promise.all([intent.ensureRegistered(), http.flushAllExpected()]);
            expect(isRegisteredSpy.callCount).toBe(1);
            expect(addRegisteredSpy.callCount).toBe(1);
        });

        it('should gracefully handle M_USER_IN_USE', async () => {
            const http = new HttpBackend();
            setRequestFn(http.requestFn);

            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };

            const storage = new MemoryStorageProvider();
            const isRegisteredSpy = simple.mock(storage, "isUserRegistered").callFn((uid) => {
                expect(uid).toEqual(userId);
                return false;
            });
            const addRegisteredSpy = simple.mock(storage, "addRegisteredUser").callFn((uid) => {
                expect(uid).toEqual(userId);
                return true;
            });

            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            // HACK: 200 OK because the mock lib can't handle 400+response body
            http.when("POST", "/_matrix/client/v3/register").respond(200, (path, content) => {
                expect(content).toMatchObject({ type: "m.login.application_service", username: "someone" });
                return { errcode: "M_USER_IN_USE", error: "User ID already in use" };
            });

            const intent = new Intent(options, userId, appservice);
            await Promise.all([intent.ensureRegistered(), http.flushAllExpected()]);
            expect(isRegisteredSpy.callCount).toBe(1);
            expect(addRegisteredSpy.callCount).toBe(1);
        });

        it('should handle unexpected errors', async () => {
            const http = new HttpBackend();
            setRequestFn(http.requestFn);

            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };

            const storage = new MemoryStorageProvider();
            const isRegisteredSpy = simple.mock(storage, "isUserRegistered").callFn((uid) => {
                expect(uid).toEqual(userId);
                return false;
            });
            const addRegisteredSpy = simple.mock(storage, "addRegisteredUser").callFn((uid) => {
                expect(uid).toEqual(userId);
                return true;
            });

            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            http.when("POST", "/_matrix/client/v3/register").respond(500, (path, content) => {
                expect(content).toMatchObject({ type: "m.login.application_service", username: "someone" });
                return { errcode: "M_UNKNOWN", error: "It broke" };
            });

            const flush = http.flushAllExpected();
            const intent = new Intent(options, userId, appservice);
            try {
                await intent.ensureRegistered();

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Request completed when it should have failed");
            } catch (e) {
                expect(e.statusCode).toBe(500);
            }
            expect(isRegisteredSpy.callCount).toBe(1);
            expect(addRegisteredSpy.callCount).toBe(0);

            await flush;
        });
    });

    describe('ensureJoined', () => {
        it('should attempt to join rooms a user is not in', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const targetRoomId = "!c:example.org";
            const appservice = <Appservice>{ botUserId: botUserId };
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const joinSpy = simple.stub().callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return Promise.resolve("!joined:example.org");
            });
            intent.underlyingClient.joinRoom = joinSpy;

            await intent.ensureJoined(targetRoomId);
            expect(joinSpy.callCount).toBe(1);
        });

        it('should proxy failure for joining a room', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const targetRoomId = "!c:example.org";
            const appservice = <Appservice>{ botUserId: botUserId };
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const joinSpy = simple.stub().callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                throw new Error("Simulated failure");
            });
            intent.underlyingClient.joinRoom = joinSpy;

            try {
                await intent.ensureJoined(targetRoomId);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Request completed when it should have failed");
            } catch (e) {
                expect(e.message).toEqual("Simulated failure");
            }
            expect(joinSpy.callCount).toBe(1);
        });
    });

    describe('ensureRegisteredAndJoined', () => {
        it('should call both ensureRegistered and ensureJoined', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };
            const targetRoomId = "!a:example.org";
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });
            const joinSpy = simple.mock(intent, "ensureJoined").callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return {};
            });

            await intent.ensureRegisteredAndJoined(targetRoomId);
            expect(registeredSpy.callCount).toBe(1);
            expect(joinSpy.callCount).toBe(1);
        });

        it('should proxy failure from ensureRegistered', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };
            const targetRoomId = "!a:example.org";
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                throw new Error("Simulated failure");
            });
            const joinSpy = simple.mock(intent, "ensureJoined").callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return {};
            });

            try {
                await intent.ensureRegisteredAndJoined(targetRoomId);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Request completed when it should have failed");
            } catch (e) {
                expect(e.message).toEqual("Simulated failure");
            }
            expect(registeredSpy.callCount).toBe(1);
            expect(joinSpy.callCount).toBe(0);
        });

        it('should proxy failure from ensureJoined', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };
            const targetRoomId = "!a:example.org";
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });
            const joinSpy = simple.mock(intent, "ensureJoined").callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                throw new Error("Simulated failure");
            });

            try {
                await intent.ensureRegisteredAndJoined(targetRoomId);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Request completed when it should have failed");
            } catch (e) {
                expect(e.message).toEqual("Simulated failure");
            }
            expect(registeredSpy.callCount).toBe(1);
            expect(joinSpy.callCount).toBe(1);
        });
    });

    describe('sendEvent', () => {
        it('should proxy through to the client while ensuring they are registered and joined', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };
            const targetRoomId = "!a:example.org";
            const content = { hello: "world" };
            const eventId = "$something:example.org";
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });
            const joinSpy = simple.mock(intent, "ensureJoined").callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return {};
            });

            const eventSpy = simple.stub().callFn((rid, c) => {
                expect(rid).toEqual(targetRoomId);
                expect(c).toMatchObject(content);
                return Promise.resolve(eventId);
            });
            intent.underlyingClient.sendMessage = eventSpy;

            const result = await intent.sendEvent(targetRoomId, content);
            expect(result).toEqual(eventId);
            expect(eventSpy.callCount).toBe(1);
            expect(registeredSpy.callCount).toBe(1);
            expect(joinSpy.callCount).toBe(1);
        });

        it('should proxy errors upwards', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };
            const targetRoomId = "!a:example.org";
            const content = { hello: "world" };
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });
            const joinSpy = simple.mock(intent, "ensureJoined").callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return {};
            });

            const eventSpy = simple.stub().callFn((rid, c) => {
                expect(rid).toEqual(targetRoomId);
                expect(c).toMatchObject(content);
                throw new Error("Simulated failure");
            });
            intent.underlyingClient.sendMessage = eventSpy;

            try {
                await intent.sendEvent(targetRoomId, content);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Request completed when it should have failed");
            } catch (e) {
                expect(e.message).toEqual("Simulated failure");
            }
            expect(eventSpy.callCount).toBe(1);
            expect(registeredSpy.callCount).toBe(1);
            expect(joinSpy.callCount).toBe(1);
        });
    });

    describe('sendText', () => {
        it('should proxy through to the client while ensuring they are registered and joined', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };
            const targetRoomId = "!a:example.org";
            const content = { body: "hello world", msgtype: "m.emote" };
            const eventId = "$something:example.org";
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });
            const joinSpy = simple.mock(intent, "ensureJoined").callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return {};
            });

            const eventSpy = simple.stub().callFn((rid, c) => {
                expect(rid).toEqual(targetRoomId);
                expect(c).toMatchObject(content);
                return Promise.resolve(eventId);
            });
            intent.underlyingClient.sendMessage = eventSpy;

            const result = await intent.sendText(targetRoomId, content.body, <any>content.msgtype);
            expect(result).toEqual(eventId);
            expect(eventSpy.callCount).toBe(1);
            expect(registeredSpy.callCount).toBe(1);
            expect(joinSpy.callCount).toBe(1);
        });

        it('should proxy errors upwards', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };
            const targetRoomId = "!a:example.org";
            const content = { body: "hello world", msgtype: "m.emote" };
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });
            const joinSpy = simple.mock(intent, "ensureJoined").callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return {};
            });

            const eventSpy = simple.stub().callFn((rid, c) => {
                expect(rid).toEqual(targetRoomId);
                expect(c).toMatchObject(content);
                throw new Error("Simulated failure");
            });
            intent.underlyingClient.sendMessage = eventSpy;

            try {
                await intent.sendText(targetRoomId, content.body, <any>content.msgtype);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Request completed when it should have failed");
            } catch (e) {
                expect(e.message).toEqual("Simulated failure");
            }
            expect(eventSpy.callCount).toBe(1);
            expect(registeredSpy.callCount).toBe(1);
            expect(joinSpy.callCount).toBe(1);
        });
    });

    describe('joinRoom', () => {
        it('should proxy through to the client while ensuring they are registered', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };
            const targetRoomId = "!a:example.org";
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });
            const joinSpy = simple.mock(intent, "ensureJoined").callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return {};
            });
            const joinRoomSpy = simple.stub().callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return Promise.resolve(targetRoomId);
            });
            intent.underlyingClient.joinRoom = joinRoomSpy;

            const result = await intent.joinRoom(targetRoomId);
            expect(result).toEqual(targetRoomId);
            expect(joinRoomSpy.callCount).toBe(1);
            expect(registeredSpy.callCount).toBe(1);
            expect(joinSpy.callCount).toBe(0);
        });

        it('should proxy errors upwards', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };
            const targetRoomId = "!a:example.org";
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });
            const joinSpy = simple.mock(intent, "ensureJoined").callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return {};
            });

            const joinRoomSpy = simple.stub().callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                throw new Error("Simulated failure");
            });
            intent.underlyingClient.joinRoom = joinRoomSpy;

            try {
                await intent.joinRoom(targetRoomId);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Request completed when it should have failed");
            } catch (e) {
                expect(e.message).toEqual("Simulated failure");
            }
            expect(joinRoomSpy.callCount).toBe(1);
            expect(registeredSpy.callCount).toBe(1);
            expect(joinSpy.callCount).toBe(0);
        });
    });

    describe('leaveRoom', () => {
        it('should proxy through to the client while ensuring they are registered', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };
            const targetRoomId = "!a:example.org";
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });
            const joinSpy = simple.mock(intent, "ensureJoined").callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return {};
            });

            const leaveRoomSpy = simple.stub().callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return Promise.resolve(targetRoomId);
            });
            intent.underlyingClient.leaveRoom = leaveRoomSpy;

            await intent.leaveRoom(targetRoomId);
            expect(leaveRoomSpy.callCount).toBe(1);
            expect(registeredSpy.callCount).toBe(1);
            expect(joinSpy.callCount).toBe(0);
        });

        it('should proxy errors upwards', async () => {
            const userId = "@someone:example.org";
            const botUserId = "@bot:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{ botUserId: botUserId };
            const targetRoomId = "!a:example.org";
            const storage = new MemoryStorageProvider();
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                storage: <IAppserviceStorageProvider>storage,
                registration: {
                    as_token: asToken,
                },
            };

            const intent = new Intent(options, userId, appservice);

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });
            const joinSpy = simple.mock(intent, "ensureJoined").callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                return {};
            });

            const leaveRoomSpy = simple.stub().callFn((rid) => {
                expect(rid).toEqual(targetRoomId);
                throw new Error("Simulated failure");
            });
            intent.underlyingClient.leaveRoom = leaveRoomSpy;

            try {
                await intent.leaveRoom(targetRoomId);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Request completed when it should have failed");
            } catch (e) {
                expect(e.message).toEqual("Simulated failure");
            }
            expect(leaveRoomSpy.callCount).toBe(1);
            expect(registeredSpy.callCount).toBe(1);
            expect(joinSpy.callCount).toBe(0);
        });
    });

    describe('enableEncryption', () => {
        const userId = "@someone:example.org";
        const botUserId = "@bot:example.org";
        const asToken = "s3cret";
        const hsUrl = "https://localhost";
        const appservice = <Appservice>{ botUserId: botUserId };
        let storage: IAppserviceStorageProvider;
        let cryptoStorage: IAppserviceCryptoStorageProvider;
        let options: IAppserviceOptions;
        let intent: Intent; // eslint-disable-line @typescript-eslint/no-unused-vars

        beforeEach(() => {
            storage = new MemoryStorageProvider();
            cryptoStorage = new RustSdkAppserviceCryptoStorageProvider(tmp.dirSync().name, StoreType.Sqlite);
            options = {
                homeserverUrl: hsUrl,
                storage: storage,
                cryptoStorage: cryptoStorage,
                intentOptions: {
                    encryption: true,
                },
                port: 9000,
                bindAddress: "127.0.0.1",
                homeserverName: "example.org",
                registration: {
                    id: asToken,
                    as_token: asToken,
                    hs_token: asToken,
                    sender_localpart: "bot",
                    namespaces: {
                        users: [],
                        aliases: [],
                        rooms: [],
                    },
                },
            };
            intent = new Intent(options, userId, appservice);
        });

        // TODO: Test once device_id impersonation set up

        it.skip('should only set up crypto once', async () => {

        });

        it.skip('should set up crypto', async () => {

        });

        it.skip('should impersonate device IDs when known', async () => {

        });

        it.skip('should use the same device ID when known', async () => {

        });

        it.skip('should log in to get a device ID if none are viable', async () => {

        });
    });
});

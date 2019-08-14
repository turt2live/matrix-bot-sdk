import { Appservice, IPreprocessor, setRequestFn } from "../../src";
import * as expect from "expect";
import * as getPort from "get-port";
import * as requestPromise from "request-promise";
import * as simple from "simple-mock";
import * as MockHttpBackend from 'matrix-mock-request';

// @ts-ignore
describe('Appservice', () => {
    // @ts-ignore
    it('should throw when there are no registered namespaces', async () => {
        try {
            new Appservice({
                port: 0,
                bindAddress: '127.0.0.1',
                homeserverName: 'localhost',
                homeserverUrl: 'https://localhost',
                registration: {
                    as_token: "",
                    hs_token: "",
                    sender_localpart: "",
                    namespaces: {
                        users: [],
                        rooms: [],
                        aliases: [],
                    },
                },
            });

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Did not throw when expecting it");
        } catch (e) {
            expect(e.message).toEqual("No user namespaces in registration");
        }
    });

    // @ts-ignore
    it('should throw when there are too many registered namespaces', async () => {
        try {
            new Appservice({
                port: 0,
                bindAddress: '127.0.0.1',
                homeserverName: 'localhost',
                homeserverUrl: 'https://localhost',
                registration: {
                    as_token: "",
                    hs_token: "",
                    sender_localpart: "",
                    namespaces: {
                        users: [
                            {exclusive: true, regex: "@.+:.+"},
                            {exclusive: true, regex: "@.+:.+"},
                        ],
                        rooms: [],
                        aliases: [],
                    },
                },
            });

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Did not throw when expecting it");
        } catch (e) {
            expect(e.message).toEqual("Too many user namespaces registered: expecting exactly one");
        }
    });

    // @ts-ignore
    it('should throw when there is no prefix namespace', async () => {
        try {
            new Appservice({
                port: 0,
                bindAddress: '127.0.0.1',
                homeserverName: 'localhost',
                homeserverUrl: 'https://localhost',
                registration: {
                    as_token: "",
                    hs_token: "",
                    sender_localpart: "",
                    namespaces: {
                        users: [{exclusive: true, regex: "@.*_suffix:.+"}],
                        rooms: [],
                        aliases: [],
                    },
                },
            });

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Did not throw when expecting it");
        } catch (e) {
            expect(e.message).toEqual("Expected user namespace to be a prefix");
        }
    });

    // @ts-ignore
    it('should return the right bot user ID', async () => {
        const appservice = new Appservice({
            port: 0,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: "",
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });

        expect(appservice.botUserId).toEqual("@_bot_:example.org");
    });

    // @ts-ignore
    it('should return the express app running the webserver', async () => {
        const appservice = new Appservice({
            port: 0,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: "",
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });

        const instance = appservice.expressAppInstance;
        expect(instance).toBeDefined();
    });

    // @ts-ignore
    it('should return the bridge APIs for the appservice', async () => {
        const appservice = new Appservice({
            port: 0,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: "",
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });

        const instance = appservice.bridge;
        expect(instance).toBeDefined();
    });

    // @ts-ignore
    it('should return an intent for the bot user', async () => {
        const appservice = new Appservice({
            port: 0,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: "",
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });

        const intent = appservice.botIntent;
        expect(intent).toBeDefined();
        expect(intent.userId).toEqual(appservice.botUserId);
    });

    // @ts-ignore
    it('should return a client for the bot user', async () => {
        const appservice = new Appservice({
            port: 0,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: "",
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });

        const intent = appservice.botClient;
        expect(intent).toBeDefined();
    });

    // @ts-ignore
    it('should be able to tell if a given user is the prefix namespace', async () => {
        const appservice = new Appservice({
            port: 0,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: "",
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });

        const userA = "@_prefix_test:example.org";
        const userB = "@alice_prefix_:example.org";

        expect(appservice.isNamespacedUser(userA)).toBeTruthy();
        expect(appservice.isNamespacedUser(userB)).toBeFalsy();
        expect(appservice.isNamespacedUser("@_bot_:example.org")).toBeTruthy();
    });

    // @ts-ignore
    it('should return an intent for any namespaced localpart', async () => {
        const appservice = new Appservice({
            port: 0,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: "",
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });

        const intent = appservice.getIntent("_prefix_testing");
        expect(intent).toBeDefined();
        expect(intent.userId).toEqual("@_prefix_testing:example.org");
    });

    // @ts-ignore
    it('should return an intent for any namespaced suffix', async () => {
        const appservice = new Appservice({
            port: 0,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: "",
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });

        const intent = appservice.getIntentForSuffix("testing");
        expect(intent).toBeDefined();
        expect(intent.userId).toEqual("@_prefix_testing:example.org");
    });

    // @ts-ignore
    it('should return an intent for any user ID', async () => {
        const appservice = new Appservice({
            port: 0,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: "",
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });

        let intent, userId;

        userId = "@alice:example.org";
        intent = appservice.getIntentForUserId(userId);
        expect(intent).toBeDefined();
        expect(intent.userId).toEqual(userId);

        userId = "@_prefix_testing:example.org";
        intent = appservice.getIntentForUserId(userId);
        expect(intent).toBeDefined();
        expect(intent.userId).toEqual(userId);

        userId = "@_bot_:example.org";
        intent = appservice.getIntentForUserId(userId);
        expect(intent).toBeDefined();
        expect(intent.userId).toEqual(userId);

        userId = "@test_prefix_:example.org";
        intent = appservice.getIntentForUserId(userId);
        expect(intent).toBeDefined();
        expect(intent.userId).toEqual(userId);
    });

    // @ts-ignore
    it('should return a user ID for any namespaced localpart', async () => {
        const appservice = new Appservice({
            port: 0,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: "",
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });

        expect(appservice.getUserId("_prefix_testing")).toEqual("@_prefix_testing:example.org");
    });

    // @ts-ignore
    it('should return a user ID for any namespaced suffix', async () => {
        const appservice = new Appservice({
            port: 0,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: "",
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });

        expect(appservice.getUserIdForSuffix("testing")).toEqual("@_prefix_testing:example.org");
    });

    // @ts-ignore
    describe('getSuffixForUserId', () => {
        // @ts-ignore
        it('should return a suffix for any namespaced user ID', async () => {
            const appservice = new Appservice({
                port: 0,
                bindAddress: '127.0.0.1',
                homeserverName: 'example.org',
                homeserverUrl: 'https://localhost',
                registration: {
                    as_token: "",
                    hs_token: "",
                    sender_localpart: "_bot_",
                    namespaces: {
                        users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                        rooms: [],
                        aliases: [],
                    },
                },
            });

            const suffix = "testing";
            const userId = `@_prefix_${suffix}:example.org`;

            expect(appservice.getSuffixForUserId(userId)).toBe(suffix);
        });

        // @ts-ignore
        it('should return a falsey suffix for any non-namespaced user ID', async () => {
            const appservice = new Appservice({
                port: 0,
                bindAddress: '127.0.0.1',
                homeserverName: 'example.org',
                homeserverUrl: 'https://localhost',
                registration: {
                    as_token: "",
                    hs_token: "",
                    sender_localpart: "_bot_",
                    namespaces: {
                        users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                        rooms: [],
                        aliases: [],
                    },
                },
            });

            expect(appservice.getSuffixForUserId(null)).toBeFalsy();
            expect(appservice.getSuffixForUserId(undefined)).toBeFalsy();
            expect(appservice.getSuffixForUserId("")).toBeFalsy();
            expect(appservice.getSuffixForUserId("@invalid")).toBeFalsy();
            expect(appservice.getSuffixForUserId("@_prefix_invalid")).toBeFalsy();
            expect(appservice.getSuffixForUserId("@_prefix_testing:invalid.example.org")).toBeFalsy();
            expect(appservice.getSuffixForUserId("@_invalid_testing:example.org")).toBeFalsy();
        });
    });

    describe('isNamespacedAlias', () => {
        // @ts-ignore
        it('should throw on no alias prefix set', async () => {
            try {
                const appservice = new Appservice({
                    port: 0,
                    bindAddress: '127.0.0.1',
                    homeserverName: 'example.org',
                    homeserverUrl: 'https://localhost',
                    registration: {
                        as_token: "",
                        hs_token: "",
                        sender_localpart: "_bot_",
                        namespaces: {
                            users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                            rooms: [],
                            aliases: [],
                        },
                    },
                });
                
                const userA = "#_prefix_test:example.org";
                const userB = "#alice_prefix_:example.org";
                
                expect(appservice.isNamespacedAlias(userA)).toBeTruthy();
                expect(appservice.isNamespacedAlias(userB)).toBeFalsy();
                throw new Error("Did not throw when expecting it");
            } catch (e) {
                expect(e.message).toEqual("Invalid configured alias prefix");
            }
        });

        // @ts-ignore
        it('should be able to tell if a given alias is the prefix namespace', async () => {
            const appservice = new Appservice({
                port: 0,
                bindAddress: '127.0.0.1',
                homeserverName: 'example.org',
                homeserverUrl: 'https://localhost',
                registration: {
                    as_token: "",
                    hs_token: "",
                    sender_localpart: "_bot_",
                    namespaces: {
                        users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                        rooms: [],
                        aliases: [{exclusive: true, regex: "#_prefix_.*:.+"}],
                    },
                },
            });

            const userA = "#_prefix_test:example.org";
            const userB = "#alice_prefix_:example.org";

            expect(appservice.isNamespacedAlias(userA)).toBeTruthy();
            expect(appservice.isNamespacedAlias(userB)).toBeFalsy();
        });
    });

    // @ts-ignore
    it('should return a alia for any namespaced localpart', async () => {
        const appservice = new Appservice({
            port: 0,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: "",
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });

        expect(appservice.getAlias("_prefix_testing")).toEqual("#_prefix_testing:example.org");
    });

    describe('getAliasForSuffix', () => {
        // @ts-ignore
        if('should throw on no alias prefix set', async () => {
            try {
                const appservice = new Appservice({
                    port: 0,
                    bindAddress: '127.0.0.1',
                    homeserverName: 'example.org',
                    homeserverUrl: 'https://localhost',
                    registration: {
                        as_token: "",
                        hs_token: "",
                        sender_localpart: "_bot_",
                        namespaces: {
                            users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                            rooms: [],
                            aliases: [],
                        },
                    },
                });

                expect(appservice.getAliasForSuffix("testing")).toEqual("#_prefix_testing:example.org");
                throw new Error("Did not throw when expecting it");
            } catch (e) {
                expect(e.message).toEqual("Invalid configured alias prefix");
            }
        });

        // @ts-ignore
        it('should return an alias for any namespaced suffix', async () => {
            const appservice = new Appservice({
                port: 0,
                bindAddress: '127.0.0.1',
                homeserverName: 'example.org',
                homeserverUrl: 'https://localhost',
                registration: {
                    as_token: "",
                    hs_token: "",
                    sender_localpart: "_bot_",
                    namespaces: {
                        users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                        rooms: [],
                        aliases: [{exclusive: true, regex: "#_prefix_.*:.+"}],
                    },
                },
            });

            expect(appservice.getAliasForSuffix("testing")).toEqual("#_prefix_testing:example.org");
        });
    });

    describe('getAliasLocalpartForSuffix', () => {
        // @ts-ignore
        it('should throw on no alias prefix set', async () => {
            try {
                const appservice = new Appservice({
                    port: 0,
                    bindAddress: '127.0.0.1',
                    homeserverName: 'example.org',
                    homeserverUrl: 'https://localhost',
                    registration: {
                        as_token: "",
                        hs_token: "",
                        sender_localpart: "_bot_",
                        namespaces: {
                            users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                            rooms: [],
                            aliases: [],
                        },
                    },
                });

                expect(appservice.getAliasLocalpartForSuffix("testing")).toEqual("_prefix_testing");
                throw new Error("Did not throw when expecting it");
            } catch (e) {
                expect(e.message).toEqual("Invalid configured alias prefix");
            }
        });

        // @ts-ignore
        it('should return an alias localpart for any namespaced suffix', async () => {
            const appservice = new Appservice({
                port: 0,
                bindAddress: '127.0.0.1',
                homeserverName: 'example.org',
                homeserverUrl: 'https://localhost',
                registration: {
                    as_token: "",
                    hs_token: "",
                    sender_localpart: "_bot_",
                    namespaces: {
                        users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                        rooms: [],
                        aliases: [{exclusive: true, regex: "#_prefix_.*:.+"}],
                    },
                },
            });

            expect(appservice.getAliasLocalpartForSuffix("testing")).toEqual("_prefix_testing");
        });
    });

    // @ts-ignore
    describe('getSuffixForAlias', () => {
        // @ts-ignore
        it('should throw on no alias prefix set', async () => {
            try {
                const appservice = new Appservice({
                    port: 0,
                    bindAddress: '127.0.0.1',
                    homeserverName: 'example.org',
                    homeserverUrl: 'https://localhost',
                    registration: {
                        as_token: "",
                        hs_token: "",
                        sender_localpart: "_bot_",
                        namespaces: {
                            users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                            rooms: [],
                            aliases: [],
                        },
                    },
                });

                const suffix = "testing";
                const userId = `#_prefix_${suffix}:example.org`;

                expect(appservice.getSuffixForAlias(userId)).toBe(suffix);
                throw new Error("Did not throw when expecting it");
            } catch (e) {
                expect(e.message).toEqual("Invalid configured alias prefix");
            }
        });

        // @ts-ignore
        it('should return a suffix for any namespaced alias', async () => {
            const appservice = new Appservice({
                port: 0,
                bindAddress: '127.0.0.1',
                homeserverName: 'example.org',
                homeserverUrl: 'https://localhost',
                registration: {
                    as_token: "",
                    hs_token: "",
                    sender_localpart: "_bot_",
                    namespaces: {
                        users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                        rooms: [],
                        aliases: [{exclusive: true, regex: "#_prefix_.*:.+"}],
                    },
                },
            });

            const suffix = "testing";
            const userId = `#_prefix_${suffix}:example.org`;

            expect(appservice.getSuffixForAlias(userId)).toBe(suffix);
        });

        // @ts-ignore
        it('should return a falsey suffix for any non-namespaced alias', async () => {
            const appservice = new Appservice({
                port: 0,
                bindAddress: '127.0.0.1',
                homeserverName: 'example.org',
                homeserverUrl: 'https://localhost',
                registration: {
                    as_token: "",
                    hs_token: "",
                    sender_localpart: "_bot_",
                    namespaces: {
                        users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                        rooms: [],
                        aliases: [{exclusive: true, regex: "#_prefix_.*:.+"}],
                    },
                },
            });

            expect(appservice.getSuffixForAlias(null)).toBeFalsy();
            expect(appservice.getSuffixForAlias(undefined)).toBeFalsy();
            expect(appservice.getSuffixForAlias("")).toBeFalsy();
            expect(appservice.getSuffixForAlias("#invalid")).toBeFalsy();
            expect(appservice.getSuffixForAlias("#_prefix_invalid")).toBeFalsy();
            expect(appservice.getSuffixForAlias("#_prefix_testing:invalid.example.org")).toBeFalsy();
            expect(appservice.getSuffixForAlias("#_invalid_testing:example.org")).toBeFalsy();
        });
    });

    // @ts-ignore
    it('should 401 requests with bad auth', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            async function verifyAuth(method: string, route: string) {
                async function doCall(opts: any = {}) {
                    try {
                        await requestPromise({
                            uri: `http://localhost:${port}${route}`,
                            method: method,
                            json: true,
                            ...opts,
                        });

                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error("Authentication passed when it shouldn't have");
                    } catch (e) {
                        expect(e.error).toMatchObject({
                            errcode: "AUTH_FAILED",
                            error: "Authentication failed",
                        });
                        expect(e.statusCode).toBe(401);
                    }
                }

                await doCall();
                await doCall({qs: {access_token: "WRONG_TOKEN"}});
                await doCall({headers: {Authorization: "Bearer WRONG_TOKEN"}});
                await doCall({headers: {Authorization: "NotBearer WRONG_TOKEN"}});
            }

            await verifyAuth("GET", "/users/@_prefix_sample:example.org");
            await verifyAuth("GET", "/rooms/" + encodeURIComponent("#_prefix_sample:example.org"));
            await verifyAuth("PUT", "/transactions/txnId");
            await verifyAuth("GET", "/_matrix/app/v1/users/@_prefix_sample:example.org");
            await verifyAuth("GET", "/_matrix/app/v1/rooms/" + encodeURIComponent("#_prefix_sample:example.org"));
            await verifyAuth("PUT", "/_matrix/app/v1/transactions/txnId");
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should validate inputs for transactions', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            async function doCall(route: string, opts: any = {}, err: any) {
                try {
                    await requestPromise({
                        uri: `http://localhost:${port}${route}`,
                        method: "PUT",
                        qs: {access_token: hsToken},
                        ...opts,
                    });

                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error("Request passed when it shouldn't have");
                } catch (e) {
                    expect(e.error).toMatchObject(err);
                    expect(e.statusCode).toBe(400);
                }
            }

            await doCall("/transactions/1", {json: {hello: "world"}}, {
                errcode: "BAD_REQUEST",
                error: "Invalid JSON: expected events",
            });
            await doCall("/_matrix/app/v1/transactions/1", {json: {hello: "world"}}, {
                errcode: "BAD_REQUEST",
                error: "Invalid JSON: expected events",
            });
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should emit events from transactions', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const txnBody = {
                events: [
                    {type: "m.room.message", roomId: "!somewhere:example.org"},
                    {type: "m.room.not_message", roomId: "!elsewhere:example.org"},
                ],
            };

            const eventSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(ev["room_id"]);
                if (ev["type"] === "m.room.message") expect(ev).toMatchObject(txnBody.events[0]);
                else expect(ev).toMatchObject(txnBody.events[1]);
            });
            const messageSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(ev["room_id"]);
                expect(ev).toMatchObject(txnBody.events[0]);
            });
            appservice.on("room.event", eventSpy);
            appservice.on("room.message", messageSpy);

            async function doCall(route: string, opts: any = {}) {
                const res = await requestPromise({
                    uri: `http://localhost:${port}${route}`,
                    method: "PUT",
                    qs: {access_token: hsToken},
                    ...opts,
                });
                expect(res).toMatchObject({});

                expect(eventSpy.callCount).toBe(2);
                expect(messageSpy.callCount).toBe(1);
                eventSpy.callCount = 0;
                messageSpy.callCount = 0;
            }

            await doCall("/transactions/1", {json: txnBody});
            await doCall("/_matrix/app/v1/transactions/2", {json: txnBody});
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should not duplicate transactions', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const txnBody = {
                events: [
                    {type: "m.room.message", roomId: "!somewhere:example.org"},
                    {type: "m.room.not_message", roomId: "!elsewhere:example.org"},
                ],
            };

            const eventSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(ev["room_id"]);
                if (ev["type"] === "m.room.message") expect(ev).toMatchObject(txnBody.events[0]);
                else expect(ev).toMatchObject(txnBody.events[1]);
            });
            const messageSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(ev["room_id"]);
                expect(ev).toMatchObject(txnBody.events[0]);
            });
            appservice.on("room.event", eventSpy);
            appservice.on("room.message", messageSpy);

            async function doCall(route: string, opts: any = {}) {
                const res = await requestPromise({
                    uri: `http://localhost:${port}${route}`,
                    method: "PUT",
                    qs: {access_token: hsToken},
                    ...opts,
                });
                expect(res).toMatchObject({});

                expect(eventSpy.callCount).toBe(2);
                expect(messageSpy.callCount).toBe(1);
            }

            await doCall("/transactions/1", {json: txnBody});
            await doCall("/_matrix/app/v1/transactions/1", {json: txnBody});
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should send transaction events through a processor', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const txnBody = {
                events: [
                    {type: "m.room.message", roomId: "!somewhere:example.org"},
                    {type: "m.room.not_message", roomId: "!elsewhere:example.org"},
                ],
            };

            const processor = <IPreprocessor>{
                processEvent: (ev, client) => {
                    ev["processed"] = true;
                },
                getSupportedEventTypes: () => ["m.room.member", "m.room.message", "m.room.not_message"],
            };
            appservice.addPreprocessor(processor);
            const processorSpy = simple.mock(processor, "processEvent").callOriginal();

            const eventSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(ev["room_id"]);
                if (ev["type"] === "m.room.message") expect(ev).toMatchObject(txnBody.events[0]);
                else expect(ev).toMatchObject(txnBody.events[1]);
            });
            const messageSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(ev["room_id"]);
                expect(ev).toMatchObject(txnBody.events[0]);
            });
            appservice.on("room.event", eventSpy);
            appservice.on("room.message", messageSpy);

            async function doCall(route: string, opts: any = {}) {
                const res = await requestPromise({
                    uri: `http://localhost:${port}${route}`,
                    method: "PUT",
                    qs: {access_token: hsToken},
                    ...opts,
                });
                expect(res).toMatchObject({});

                expect(eventSpy.callCount).toBe(2);
                expect(messageSpy.callCount).toBe(1);
                expect(processorSpy.callCount).toBe(2);
                eventSpy.callCount = 0;
                messageSpy.callCount = 0;
                processorSpy.callCount = 0;
            }

            await doCall("/transactions/1", {json: txnBody});
            await doCall("/_matrix/app/v1/transactions/2", {json: txnBody});
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should send transaction events through a relevant processor', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const txnBody = {
                events: [
                    {type: "m.room.message", roomId: "!somewhere:example.org"},
                    {type: "m.room.not_message", roomId: "!elsewhere:example.org"},
                    {type: "m.room.unknown", roomId: "!elsewhere:example.org"},
                ],
            };

            const processorA = <IPreprocessor>{
                processEvent: (ev, client) => {
                    ev["processed"] = "A";
                },
                getSupportedEventTypes: () => ["m.room.message"],
            };
            appservice.addPreprocessor(processorA);
            const processorSpyA = simple.mock(processorA, "processEvent").callOriginal();

            const processorB = <IPreprocessor>{
                processEvent: (ev, client) => {
                    ev["processed"] = "B";
                },
                getSupportedEventTypes: () => ["m.room.not_message"],
            };
            appservice.addPreprocessor(processorB);
            const processorSpyB = simple.mock(processorB, "processEvent").callOriginal();

            const eventSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(ev["room_id"]);
                if (ev["type"] === "m.room.message") {
                    expect(ev).toMatchObject(txnBody.events[0]);
                    expect(ev["processed"]).toEqual("A");
                } else if (ev["type"] === "m.room.not_message") {
                    expect(ev).toMatchObject(txnBody.events[1]);
                    expect(ev["processed"]).toEqual("B");
                } else {
                    expect(ev).toMatchObject(txnBody.events[2]);
                }
            });
            const messageSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(ev["room_id"]);
                expect(ev).toMatchObject(txnBody.events[0]);
                expect(ev["processed"]).toEqual("A");
            });
            appservice.on("room.event", eventSpy);
            appservice.on("room.message", messageSpy);

            async function doCall(route: string, opts: any = {}) {
                const res = await requestPromise({
                    uri: `http://localhost:${port}${route}`,
                    method: "PUT",
                    qs: {access_token: hsToken},
                    ...opts,
                });
                expect(res).toMatchObject({});

                expect(eventSpy.callCount).toBe(3);
                expect(messageSpy.callCount).toBe(1);
                expect(processorSpyA.callCount).toBe(1);
                expect(processorSpyB.callCount).toBe(1);
                eventSpy.callCount = 0;
                messageSpy.callCount = 0;
                processorSpyA.callCount = 0;
                processorSpyB.callCount = 0;
            }

            await doCall("/transactions/1", {json: txnBody});
            await doCall("/_matrix/app/v1/transactions/2", {json: txnBody});
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should handle membership events in transactions', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const txnBody = {
                events: [
                    {
                        type: "m.room.member",
                        room_id: "!AAA:example.org",
                        content: {membership: "join"},
                        state_key: "@_prefix_test:example.org",
                    },
                    {
                        type: "m.room.member",
                        room_id: "!BBB:example.org",
                        content: {membership: "leave"},
                        state_key: "@_prefix_test:example.org",
                    },
                    {
                        type: "m.room.member",
                        room_id: "!CCC:example.org",
                        content: {membership: "ban"},
                        state_key: "@_prefix_test:example.org",
                    },
                    {
                        type: "m.room.member",
                        room_id: "!DDD:example.org",
                        content: {membership: "invite"},
                        state_key: "@_prefix_test:example.org",
                    },
                    {
                        type: "m.room.member",
                        room_id: "!AAA:example.org",
                        content: {membership: "join"},
                        state_key: "@INVALID_USER:example.org",
                    },
                    {
                        type: "m.room.member",
                        room_id: "!BBB:example.org",
                        content: {membership: "leave"},
                        state_key: "@INVALID_USER:example.org",
                    },
                    {
                        type: "m.room.member",
                        room_id: "!CCC:example.org",
                        content: {membership: "ban"},
                        state_key: "@INVALID_USER:example.org",
                    },
                    {
                        type: "m.room.member",
                        room_id: "!DDD:example.org",
                        content: {membership: "invite"},
                        state_key: "@INVALID_USER:example.org",
                    },
                ],
            };

            const joinSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(txnBody.events[0].room_id);
                expect(ev).toMatchObject(txnBody.events[0]);
            });
            const leaveSpy = simple.stub().callFn((rid, ev) => {
                if (ev["content"]["membership"] === "leave") {
                    expect(rid).toEqual(txnBody.events[1].room_id);
                    expect(ev).toMatchObject(txnBody.events[1]);
                } else {
                    expect(rid).toEqual(txnBody.events[2].room_id);
                    expect(ev).toMatchObject(txnBody.events[2]);
                }
            });
            const inviteSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(txnBody.events[3].room_id);
                expect(ev).toMatchObject(txnBody.events[3]);
            });

            appservice.on("room.join", joinSpy);
            appservice.on("room.leave", leaveSpy);
            appservice.on("room.invite", inviteSpy);

            async function doCall(route: string, opts: any = {}) {
                const res = await requestPromise({
                    uri: `http://localhost:${port}${route}`,
                    method: "PUT",
                    qs: {access_token: hsToken},
                    ...opts,
                });
                expect(res).toMatchObject({});

                expect(joinSpy.callCount).toBe(1);
                expect(leaveSpy.callCount).toBe(2);
                expect(inviteSpy.callCount).toBe(1);
                joinSpy.callCount = 0;
                leaveSpy.callCount = 0;
                inviteSpy.callCount = 0;
            }

            await doCall("/transactions/1", {json: txnBody});
            await doCall("/_matrix/app/v1/transactions/2", {json: txnBody});
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should handle room upgrade events in transactions', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const txnBody = {
                events: [
                    {
                        type: "m.room.tombstone",
                        content: {body: "hello world 1"},
                        state_key: "",
                        room_id: "!a:example.org",
                    },
                    {
                        type: "m.room.create",
                        content: {predecessor: {room_id: "!old:example.org"}},
                        state_key: "",
                        room_id: "!b:example.org",
                    },
                ],
            };

            const archiveSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(txnBody.events[0].room_id);
                expect(ev).toMatchObject(txnBody.events[0]);
            });
            const upgradeSpy = simple.stub().callFn((rid, ev) => {
                expect(rid).toEqual(txnBody.events[1].room_id);
                expect(ev).toMatchObject(txnBody.events[1]);
            });
            const eventSpy = simple.stub().callFn((rid, ev) => {
                if (ev['type'] === 'm.room.tombstone') {
                    expect(rid).toEqual(txnBody.events[0].room_id);
                    expect(ev).toMatchObject(txnBody.events[0]);
                } else {
                    expect(rid).toEqual(txnBody.events[1].room_id);
                    expect(ev).toMatchObject(txnBody.events[1]);
                }
            });

            appservice.on("room.archived", archiveSpy);
            appservice.on("room.upgraded", upgradeSpy);
            appservice.on("room.event", eventSpy);

            async function doCall(route: string, opts: any = {}) {
                const res = await requestPromise({
                    uri: `http://localhost:${port}${route}`,
                    method: "PUT",
                    qs: {access_token: hsToken},
                    ...opts,
                });
                expect(res).toMatchObject({});

                expect(archiveSpy.callCount).toBe(1);
                expect(upgradeSpy.callCount).toBe(1);
                expect(eventSpy.callCount).toBe(2);
                archiveSpy.callCount = 0;
                upgradeSpy.callCount = 0;
                eventSpy.callCount = 0;
            }

            await doCall("/transactions/1", {json: txnBody});
            await doCall("/_matrix/app/v1/transactions/2", {json: txnBody});
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should emit while querying users', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const userId = "@_prefix_test:example.org";

            // Prepare an intent for the user now
            const userIntent = appservice.getIntentForUserId(userId);
            userIntent.ensureRegistered = () => {
                return null;
            };
            const nameSpy = simple.stub(userIntent.underlyingClient, "setDisplayName").callFn(() => {
                return null;
            });
            const avatarSpy = simple.stub(userIntent.underlyingClient, "setAvatarUrl").callFn(() => {
                return null;
            });

            const userSpy = simple.stub().callFn((uid, fn) => {
                expect(uid).toEqual(userId);
                fn({});
            });

            appservice.on("query.user", userSpy);

            async function doCall(route: string, opts: any = {}) {
                const res = await requestPromise({
                    uri: `http://localhost:${port}${route}`,
                    method: "GET",
                    qs: {access_token: hsToken},
                    json: true,
                    ...opts,
                });
                expect(res).toMatchObject({});

                expect(nameSpy.callCount).toBe(0);
                expect(avatarSpy.callCount).toBe(0);
                expect(userSpy.callCount).toBe(1);
                nameSpy.callCount = 0;
                avatarSpy.callCount = 0;
                userSpy.callCount = 0;
            }

            await doCall("/users/" + userId);
            await doCall("/_matrix/app/v1/users/" + userId);
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should handle profiles while querying users', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const hsUrl = "https://localhost";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: hsUrl,
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        const http = new MockHttpBackend();
        setRequestFn(http.requestFn);

        await appservice.begin();

        try {
            const userId = "@_prefix_test:example.org";
            const displayName = "Display Name Here";
            const avatarUrl = "mxc://example.org/testing";

            // Prepare an intent for the user now
            const userIntent = appservice.getIntentForUserId(userId);
            userIntent.ensureRegistered = () => {
                return null;
            };

            const userSpy = simple.stub().callFn((uid, fn) => {
                expect(uid).toEqual(userId);

                fn({
                    display_name: displayName,
                    avatar_mxc: avatarUrl,
                });
            });

            appservice.on("query.user", userSpy);

            async function doCall(route: string, opts: any = {}) {
                http.when("PUT", "/_matrix/client/r0/profile").respond(200, (path, content) => {
                    expect(path).toEqual(`${hsUrl}/_matrix/client/r0/profile/${encodeURIComponent(userId)}/displayname`);
                    expect(content).toMatchObject({displayname: displayName});
                    return {};
                });
                http.when("PUT", "/_matrix/client/r0/profile").respond(200, (path, content) => {
                    expect(path).toEqual(`${hsUrl}/_matrix/client/r0/profile/${encodeURIComponent(userId)}/avatar_url`);
                    expect(content).toMatchObject({avatar_url: avatarUrl});
                    return {};
                });

                http.flushAllExpected();
                const res = await requestPromise({
                    uri: `http://localhost:${port}${route}`,
                    method: "GET",
                    qs: {access_token: hsToken},
                    json: true,
                    ...opts,
                });
                expect(res).toMatchObject({});

                expect(userSpy.callCount).toBe(1);
                userSpy.callCount = 0;
            }

            await doCall("/users/" + userId);
            await doCall("/_matrix/app/v1/users/" + userId);
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should handle promises for profiles while querying users', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const hsUrl = "https://localhost";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: hsUrl,
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        const http = new MockHttpBackend();
        setRequestFn(http.requestFn);

        await appservice.begin();

        try {
            const userId = "@_prefix_test:example.org";
            const displayName = "Display Name Here";
            const avatarUrl = "mxc://example.org/testing";

            // Prepare an intent for the user now
            const userIntent = appservice.getIntentForUserId(userId);
            userIntent.ensureRegistered = () => {
                return null;
            };

            const userSpy = simple.stub().callFn((uid, fn) => {
                expect(uid).toEqual(userId);

                fn(Promise.resolve({
                    display_name: displayName,
                    avatar_mxc: avatarUrl,
                }));
            });

            appservice.on("query.user", userSpy);

            async function doCall(route: string, opts: any = {}) {
                http.when("PUT", "/_matrix/client/r0/profile").respond(200, (path, content) => {
                    expect(path).toEqual(`${hsUrl}/_matrix/client/r0/profile/${encodeURIComponent(userId)}/displayname`);
                    expect(content).toMatchObject({displayname: displayName});
                    return {};
                });
                http.when("PUT", "/_matrix/client/r0/profile").respond(200, (path, content) => {
                    expect(path).toEqual(`${hsUrl}/_matrix/client/r0/profile/${encodeURIComponent(userId)}/avatar_url`);
                    expect(content).toMatchObject({avatar_url: avatarUrl});
                    return {};
                });

                http.flushAllExpected();
                const res = await requestPromise({
                    uri: `http://localhost:${port}${route}`,
                    method: "GET",
                    qs: {access_token: hsToken},
                    json: true,
                    ...opts,
                });
                expect(res).toMatchObject({});

                expect(userSpy.callCount).toBe(1);
                userSpy.callCount = 0;
            }

            await doCall("/users/" + userId);
            await doCall("/_matrix/app/v1/users/" + userId);
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should return user not found when a user is not created', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const userId = "@_prefix_test:example.org";

            // Prepare an intent for the user now
            const userIntent = appservice.getIntentForUserId(userId);
            userIntent.ensureRegistered = () => {
                return null;
            };
            const nameSpy = simple.stub(userIntent.underlyingClient, "setDisplayName").callFn(() => {
                return null;
            });
            const avatarSpy = simple.stub(userIntent.underlyingClient, "setAvatarUrl").callFn(() => {
                return null;
            });

            const userSpy = simple.stub().callFn((uid, fn) => {
                expect(uid).toEqual(userId);
                fn(false);
            });

            appservice.on("query.user", userSpy);

            async function doCall(route: string, opts: any = {}) {
                try {
                    await requestPromise({
                        uri: `http://localhost:${port}${route}`,
                        method: "GET",
                        qs: {access_token: hsToken},
                        json: true,
                        ...opts,
                    });

                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error("Request finished when it should not have");
                } catch (e) {
                    expect(e.error).toMatchObject({
                        errcode: "USER_DOES_NOT_EXIST",
                        error: "User not created",
                    });
                    expect(e.statusCode).toBe(404);
                }

                expect(nameSpy.callCount).toBe(0);
                expect(avatarSpy.callCount).toBe(0);
                expect(userSpy.callCount).toBe(1);
                nameSpy.callCount = 0;
                avatarSpy.callCount = 0;
                userSpy.callCount = 0;
            }

            await doCall("/users/" + encodeURIComponent(userId));
            await doCall("/_matrix/app/v1/users/" + encodeURIComponent(userId));
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should return user not found when a promise to not create a user is seen', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const userId = "@_prefix_test:example.org";

            // Prepare an intent for the user now
            const userIntent = appservice.getIntentForUserId(userId);
            userIntent.ensureRegistered = () => {
                return null;
            };
            const nameSpy = simple.stub(userIntent.underlyingClient, "setDisplayName").callFn(() => {
                return null;
            });
            const avatarSpy = simple.stub(userIntent.underlyingClient, "setAvatarUrl").callFn(() => {
                return null;
            });

            const userSpy = simple.stub().callFn((uid, fn) => {
                expect(uid).toEqual(userId);
                fn(Promise.resolve(false));
            });

            appservice.on("query.user", userSpy);

            async function doCall(route: string, opts: any = {}) {
                try {
                    await requestPromise({
                        uri: `http://localhost:${port}${route}`,
                        method: "GET",
                        qs: {access_token: hsToken},
                        json: true,
                        ...opts,
                    });

                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error("Request finished when it should not have");
                } catch (e) {
                    expect(e.error).toMatchObject({
                        errcode: "USER_DOES_NOT_EXIST",
                        error: "User not created",
                    });
                    expect(e.statusCode).toBe(404);
                }

                expect(nameSpy.callCount).toBe(0);
                expect(avatarSpy.callCount).toBe(0);
                expect(userSpy.callCount).toBe(1);
                nameSpy.callCount = 0;
                avatarSpy.callCount = 0;
                userSpy.callCount = 0;
            }

            await doCall("/users/" + encodeURIComponent(userId));
            await doCall("/_matrix/app/v1/users/" + encodeURIComponent(userId));
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should emit while querying rooms', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const roomOptions = {};
            const roomAlias = "#_prefix_test:example.org";
            const roomId = "!something:example.org";

            const expected = Object.assign({}, roomOptions, {
                __roomId: roomId,
                room_alias_name: roomAlias.substring(1).split(':')[0],
            });

            const createRoomSpy = simple.mock(appservice.botIntent.underlyingClient, "createRoom").callFn((opts) => {
                expect(opts).toMatchObject(roomOptions);
                return Promise.resolve(roomId);
            });

            const roomSpy = simple.stub().callFn((ralias, fn) => {
                expect(ralias).toEqual(roomAlias);
                fn(roomOptions);
            });

            appservice.on("query.room", roomSpy);

            async function doCall(route: string, opts: any = {}) {
                const res = await requestPromise({
                    uri: `http://localhost:${port}${route}`,
                    method: "GET",
                    qs: {access_token: hsToken},
                    json: true,
                    ...opts,
                });
                expect(res).toMatchObject(expected);

                expect(createRoomSpy.callCount).toBe(1);
                expect(roomSpy.callCount).toBe(1);
                createRoomSpy.callCount = 0;
                roomSpy.callCount = 0;
            }

            await doCall("/rooms/" + encodeURIComponent(roomAlias));
            await doCall("/_matrix/app/v1/rooms/" + encodeURIComponent(roomAlias));
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should handle options while querying rooms', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const roomOptions = {preset: "public_chat"};
            const roomAlias = "#_prefix_test:example.org";
            const roomId = "!something:example.org";

            const expected = Object.assign({}, roomOptions, {
                __roomId: roomId,
                room_alias_name: roomAlias.substring(1).split(':')[0],
            });

            const createRoomSpy = simple.mock(appservice.botIntent.underlyingClient, "createRoom").callFn((opts) => {
                expect(opts).toMatchObject(roomOptions);
                return Promise.resolve(roomId);
            });

            const roomSpy = simple.stub().callFn((ralias, fn) => {
                expect(ralias).toEqual(roomAlias);
                fn(roomOptions);
            });

            appservice.on("query.room", roomSpy);

            async function doCall(route: string, opts: any = {}) {
                const res = await requestPromise({
                    uri: `http://localhost:${port}${route}`,
                    method: "GET",
                    qs: {access_token: hsToken},
                    json: true,
                    ...opts,
                });
                expect(res).toMatchObject(expected);

                expect(createRoomSpy.callCount).toBe(1);
                expect(roomSpy.callCount).toBe(1);
                createRoomSpy.callCount = 0;
                roomSpy.callCount = 0;
            }

            await doCall("/rooms/" + encodeURIComponent(roomAlias));
            await doCall("/_matrix/app/v1/rooms/" + encodeURIComponent(roomAlias));
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should handle promises for options while querying rooms', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const roomOptions = {preset: "public_chat"};
            const roomAlias = "#_prefix_test:example.org";
            const roomId = "!something:example.org";

            const expected = Object.assign({}, roomOptions, {
                __roomId: roomId,
                room_alias_name: roomAlias.substring(1).split(':')[0],
            });

            const createRoomSpy = simple.mock(appservice.botIntent.underlyingClient, "createRoom").callFn((opts) => {
                expect(opts).toMatchObject(roomOptions);
                return Promise.resolve(roomId);
            });

            const roomSpy = simple.stub().callFn((ralias, fn) => {
                expect(ralias).toEqual(roomAlias);
                fn(Promise.resolve(roomOptions));
            });

            appservice.on("query.room", roomSpy);

            async function doCall(route: string, opts: any = {}) {
                const res = await requestPromise({
                    uri: `http://localhost:${port}${route}`,
                    method: "GET",
                    qs: {access_token: hsToken},
                    json: true,
                    ...opts,
                });
                expect(res).toMatchObject(expected);

                expect(createRoomSpy.callCount).toBe(1);
                expect(roomSpy.callCount).toBe(1);
                createRoomSpy.callCount = 0;
                roomSpy.callCount = 0;
            }

            await doCall("/rooms/" + encodeURIComponent(roomAlias));
            await doCall("/_matrix/app/v1/rooms/" + encodeURIComponent(roomAlias));
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should return room not found when a room is not created', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const roomOptions = {preset: "public_chat"};
            const roomAlias = "#_prefix_test:example.org";
            const roomId = "!something:example.org";

            const expected = Object.assign({}, roomOptions, {
                __roomId: roomId,
                room_alias_name: roomAlias.substring(1).split(':')[0],
            });

            const createRoomSpy = simple.mock(appservice.botIntent.underlyingClient, "createRoom").callFn((opts) => {
                expect(opts).toMatchObject(roomOptions);
                return Promise.resolve(roomId);
            });

            const roomSpy = simple.stub().callFn((ralias, fn) => {
                expect(ralias).toEqual(roomAlias);
                fn(false);
            });

            appservice.on("query.room", roomSpy);

            async function doCall(route: string, opts: any = {}) {
                try {
                    await requestPromise({
                        uri: `http://localhost:${port}${route}`,
                        method: "GET",
                        qs: {access_token: hsToken},
                        json: true,
                        ...opts,
                    });

                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error("Request finished when it should not have");
                } catch (e) {
                    expect(e.error).toMatchObject({
                        errcode: "ROOM_DOES_NOT_EXIST",
                        error: "Room not created",
                    });
                    expect(e.statusCode).toBe(404);
                }

                expect(createRoomSpy.callCount).toBe(0);
                expect(roomSpy.callCount).toBe(1);
                createRoomSpy.callCount = 0;
                roomSpy.callCount = 0;
            }

            await doCall("/rooms/" + encodeURIComponent(roomAlias));
            await doCall("/_matrix/app/v1/rooms/" + encodeURIComponent(roomAlias));
        } finally {
            appservice.stop();
        }
    });

    // @ts-ignore
    it('should return room not found when a promise to not create a room is seen', async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: 'https://localhost',
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        await appservice.begin();

        try {
            const roomOptions = {preset: "public_chat"};
            const roomAlias = "#_prefix_test:example.org";
            const roomId = "!something:example.org";

            const expected = Object.assign({}, roomOptions, {
                __roomId: roomId,
                room_alias_name: roomAlias.substring(1).split(':')[0],
            });

            const createRoomSpy = simple.mock(appservice.botIntent.underlyingClient, "createRoom").callFn((opts) => {
                expect(opts).toMatchObject(roomOptions);
                return Promise.resolve(roomId);
            });

            const roomSpy = simple.stub().callFn((ralias, fn) => {
                expect(ralias).toEqual(roomAlias);
                fn(Promise.resolve(false));
            });

            appservice.on("query.room", roomSpy);

            async function doCall(route: string, opts: any = {}) {
                try {
                    await requestPromise({
                        uri: `http://localhost:${port}${route}`,
                        method: "GET",
                        qs: {access_token: hsToken},
                        json: true,
                        ...opts,
                    });

                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error("Request finished when it should not have");
                } catch (e) {
                    expect(e.error).toMatchObject({
                        errcode: "ROOM_DOES_NOT_EXIST",
                        error: "Room not created",
                    });
                    expect(e.statusCode).toBe(404);
                }

                expect(createRoomSpy.callCount).toBe(0);
                expect(roomSpy.callCount).toBe(1);
                createRoomSpy.callCount = 0;
                roomSpy.callCount = 0;
            }

            await doCall("/rooms/" + encodeURIComponent(roomAlias));
            await doCall("/_matrix/app/v1/rooms/" + encodeURIComponent(roomAlias));
        } finally {
            appservice.stop();
        }
    });

    it("should set visibilty of a room on the appservice's network", async () => {
        const port = await getPort();
        const hsToken = "s3cret_token";
        const hsUrl = "https://localhost";
        const networkId = "foonetwork";
        const roomId = "!aroomid:example.org";
        const appservice = new Appservice({
            port: port,
            bindAddress: '127.0.0.1',
            homeserverName: 'example.org',
            homeserverUrl: hsUrl,
            registration: {
                as_token: "",
                hs_token: hsToken,
                sender_localpart: "_bot_",
                namespaces: {
                    users: [{exclusive: true, regex: "@_prefix_.*:.+"}],
                    rooms: [],
                    aliases: [],
                },
            },
        });
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };


        const http = new MockHttpBackend();
        setRequestFn(http.requestFn);

        http.when("PUT", "/_matrix/client/r0/directory/list/appservice").respond(200, (path, content) => {
            expect(path).toEqual(`${hsUrl}/_matrix/client/r0/directory/list/appservice/${encodeURIComponent(networkId)}/${encodeURIComponent(roomId)}`);
            expect(content).toStrictEqual({ visibility: "public" });
            return {};
        });

        http.flushAllExpected();
        await appservice.setRoomDirectoryVisibility("foonetwork", "!aroomid:example.org", "public");
    })
});

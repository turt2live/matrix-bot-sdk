import { Appservice, AppserviceJoinRoomStrategy, IJoinRoomStrategy } from "../../src";
import * as expect from "expect";
import * as simple from "simple-mock";

// @ts-ignore
describe('AppserviceJoinRoomStrategy', () => {
    // @ts-ignore
    it('should be able to join the room normally', async () => {
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
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };

        const roomId = "!somewhere:example.org";
        const userId = "@someone:example.org";

        const underlyingSpy = simple.stub().callFn((rid, uid, apiCall) => {
            expect(rid).toEqual(roomId);
            expect(uid).toEqual(userId);
            expect(apiCall).toBeDefined();
            return Promise.resolve();
        });
        const underlyingStrategy = <IJoinRoomStrategy>{joinRoom: underlyingSpy};

        const strategy = new AppserviceJoinRoomStrategy(underlyingStrategy, appservice);

        const apiCallSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(roomId);
            return Promise.resolve();
        });

        await strategy.joinRoom(roomId, userId, apiCallSpy);
        expect(apiCallSpy.callCount).toBe(1);
        expect(underlyingSpy.callCount).toBe(0);
    });

    // @ts-ignore
    it('should call the underlying strategy after the first failure', async () => {
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
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };
        appservice.botIntent.underlyingClient.resolveRoom = async (rid) => {
            return roomId;
        };

        const inviteSpy = simple.stub().callFn((uid, rid) => {
            expect(uid).toEqual(userId);
            expect(rid).toEqual(roomId);
            return Promise.resolve();
        });
        appservice.botIntent.underlyingClient.inviteUser = inviteSpy;

        const roomId = "!somewhere:example.org";
        const userId = "@someone:example.org";

        const underlyingSpy = simple.stub().callFn((rid, uid, apiCall) => {
            expect(rid).toEqual(roomId);
            expect(uid).toEqual(userId);
            expect(apiCall).toBeDefined();
            return Promise.resolve();
        });
        const underlyingStrategy = <IJoinRoomStrategy>{joinRoom: underlyingSpy};

        const strategy = new AppserviceJoinRoomStrategy(underlyingStrategy, appservice);

        const apiCallSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(roomId);
            throw new Error("Simulated failure");
        });

        await strategy.joinRoom(roomId, userId, apiCallSpy);
        expect(apiCallSpy.callCount).toBe(1);
        expect(underlyingSpy.callCount).toBe(1);
        expect(inviteSpy.callCount).toBe(1);
    });

    // @ts-ignore
    it('should not invite the bot user if the bot user is joining', async () => {
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
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };
        appservice.botIntent.underlyingClient.resolveRoom = async (rid) => {
            return roomId;
        };

        const inviteSpy = simple.stub().callFn((uid, rid) => {
            expect(uid).toEqual(userId);
            expect(rid).toEqual(roomId);
            return Promise.resolve();
        });
        appservice.botIntent.underlyingClient.inviteUser = inviteSpy;

        const roomId = "!somewhere:example.org";
        const userId = "@_bot_:example.org";

        const underlyingSpy = simple.stub().callFn((rid, uid, apiCall) => {
            expect(rid).toEqual(roomId);
            expect(uid).toEqual(userId);
            expect(apiCall).toBeDefined();
            return Promise.resolve();
        });
        const underlyingStrategy = <IJoinRoomStrategy>{joinRoom: underlyingSpy};

        const strategy = new AppserviceJoinRoomStrategy(underlyingStrategy, appservice);

        const apiCallSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(roomId);
            throw new Error("Simulated failure");
        });

        await strategy.joinRoom(roomId, userId, apiCallSpy);
        expect(apiCallSpy.callCount).toBe(1);
        expect(underlyingSpy.callCount).toBe(1);
        expect(inviteSpy.callCount).toBe(0);
    });

    // @ts-ignore
    it('should call the API twice when there is no strategy', async () => {
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
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };
        appservice.botIntent.underlyingClient.resolveRoom = async (rid) => {
            return roomId;
        };

        const inviteSpy = simple.stub().callFn((uid, rid) => {
            expect(uid).toEqual(userId);
            expect(rid).toEqual(roomId);
            return Promise.resolve();
        });
        appservice.botIntent.underlyingClient.inviteUser = inviteSpy;

        const roomId = "!somewhere:example.org";
        const userId = "@someone:example.org";

        const strategy = new AppserviceJoinRoomStrategy(null, appservice);

        let attempt = 0;
        const apiCallSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(roomId);
            if (attempt++ === 0) {
                throw new Error("Simulated failure");
            } else return Promise.resolve();
        });

        await strategy.joinRoom(roomId, userId, apiCallSpy);
        expect(apiCallSpy.callCount).toBe(2);
        expect(inviteSpy.callCount).toBe(1);
    });

    // @ts-ignore
    it('should call the API once when there is no strategy for the bot user', async () => {
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
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };
        appservice.botIntent.underlyingClient.resolveRoom = async (rid) => {
            return roomId;
        };

        const inviteSpy = simple.stub().callFn((uid, rid) => {
            expect(uid).toEqual(userId);
            expect(rid).toEqual(roomId);
            return Promise.resolve();
        });
        appservice.botIntent.underlyingClient.inviteUser = inviteSpy;

        const roomId = "!somewhere:example.org";
        const userId = "@_bot_:example.org";

        const strategy = new AppserviceJoinRoomStrategy(null, appservice);

        const apiCallSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(roomId);
            throw new Error("Simulated failure");
        });

        try {
            await strategy.joinRoom(roomId, userId, apiCallSpy);

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Join succeeded when it should have failed");
        } catch (e) {
            expect(e.message).toEqual("Simulated failure");
        }
        expect(apiCallSpy.callCount).toBe(1);
        expect(inviteSpy.callCount).toBe(0);
    });

    // @ts-ignore
    it('should fail if the underlying strategy fails', async () => {
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
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };
        appservice.botIntent.underlyingClient.resolveRoom = async (rid) => {
            return roomId;
        };

        const inviteSpy = simple.stub().callFn((uid, rid) => {
            expect(uid).toEqual(userId);
            expect(rid).toEqual(roomId);
            return Promise.resolve();
        });
        appservice.botIntent.underlyingClient.inviteUser = inviteSpy;

        const roomId = "!somewhere:example.org";
        const userId = "@someone:example.org";

        const underlyingSpy = simple.stub().callFn((rid, uid, apiCall) => {
            expect(rid).toEqual(roomId);
            expect(uid).toEqual(userId);
            expect(apiCall).toBeDefined();
            throw new Error("Simulated failure 2");
        });
        const underlyingStrategy = <IJoinRoomStrategy>{joinRoom: underlyingSpy};

        const strategy = new AppserviceJoinRoomStrategy(underlyingStrategy, appservice);

        const apiCallSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(roomId);
            throw new Error("Simulated failure");
        });

        try {
            await strategy.joinRoom(roomId, userId, apiCallSpy);

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Join succeeded when it should have failed");
        } catch (e) {
            expect(e.message).toEqual("Simulated failure 2");
        }
        expect(apiCallSpy.callCount).toBe(1);
        expect(underlyingSpy.callCount).toBe(1);
        expect(inviteSpy.callCount).toBe(1);
    });

    // @ts-ignore
    it('should handle invite failures', async () => {
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
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };
        appservice.botIntent.underlyingClient.resolveRoom = async (rid) => {
            return roomId;
        };

        const inviteSpy = simple.stub().callFn((uid, rid) => {
            expect(uid).toEqual(userId);
            expect(rid).toEqual(roomId);
            throw new Error("Simulated invite error");
        });
        appservice.botIntent.underlyingClient.inviteUser = inviteSpy;

        const roomId = "!somewhere:example.org";
        const userId = "@someone:example.org";

        const strategy = new AppserviceJoinRoomStrategy(null, appservice);

        const apiCallSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(roomId);
            throw new Error("Simulated failure");
        });

        try {
            await strategy.joinRoom(roomId, userId, apiCallSpy);

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Join succeeded when it should have failed");
        } catch (e) {
            expect(e.message).toEqual("Simulated invite error");
        }
        expect(apiCallSpy.callCount).toBe(1);
        expect(inviteSpy.callCount).toBe(1);
    });

    // @ts-ignore
    it('should pass to the underlying strategy on invite failures', async () => {
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
        appservice.botIntent.ensureRegistered = () => {
            return null;
        };
        appservice.botIntent.underlyingClient.resolveRoom = async (rid) => {
            return roomId;
        };

        const inviteSpy = simple.stub().callFn((uid, rid) => {
            expect(uid).toEqual(userId);
            expect(rid).toEqual(roomId);
            throw new Error("Simulated invite error");
        });
        appservice.botIntent.underlyingClient.inviteUser = inviteSpy;

        const roomId = "!somewhere:example.org";
        const userId = "@someone:example.org";

        const underlyingSpy = simple.stub().callFn((rid, uid, apiCall) => {
            expect(rid).toEqual(roomId);
            expect(uid).toEqual(userId);
            expect(apiCall).toBeDefined();
            throw new Error("Simulated failure 2");
        });
        const underlyingStrategy = <IJoinRoomStrategy>{joinRoom: underlyingSpy};

        const strategy = new AppserviceJoinRoomStrategy(underlyingStrategy, appservice);

        const apiCallSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(roomId);
            throw new Error("Simulated failure");
        });

        try {
            await strategy.joinRoom(roomId, userId, apiCallSpy);

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Join succeeded when it should have failed");
        } catch (e) {
            expect(e.message).toEqual("Simulated failure 2");
        }
        expect(apiCallSpy.callCount).toBe(1);
        expect(underlyingSpy.callCount).toBe(1);
        expect(inviteSpy.callCount).toBe(1);
    });
});

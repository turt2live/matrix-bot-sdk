import { Appservice, AutojoinRoomsMixin, Intent } from "../../src";
import * as expect from "expect";
import * as simple from "simple-mock";
import { createTestClient } from "../MatrixClientTest";

describe('AutojoinRoomsMixin', () => {
    it('should join rooms for regular invites', () => {
        const {client} = createTestClient();

        const roomId = "!test:example.org";

        const joinSpy = simple.mock(client, "joinRoom").callFn((rid) => {
            expect(rid).toEqual(roomId);
        });

        AutojoinRoomsMixin.setupOnClient(client);
        client.emit("room.invite", roomId, {});
        expect(joinSpy.callCount).toBe(1);
    });

    it('should join rooms for appservice invites', async () => {
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

        const roomId = "!test:example.org";
        const userId = "@join:example.org";
        const event = {type: "m.room.test", state_key: userId};

        const joinSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(roomId);
        });

        appservice.getIntentForUserId = (uid) => {
            expect(uid).toEqual(userId);
            return <Intent>{
                joinRoom: joinSpy,
            };
        };

        AutojoinRoomsMixin.setupOnAppservice(appservice);
        appservice.emit("room.invite", roomId, event);
        expect(joinSpy.callCount).toBe(1);
    });

    it('should join rooms for appservice invites with conditions', async () => {
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

        const notBotUserId = "@NOT_BOT:example.org";

        const okRoomId = "!ok:example.org";
        const okUserId = "@ok:example.org";
        const okEvent = {type: "m.room.ok", state_key: okUserId, sender: notBotUserId};

        const badRoomId = "!bad:example.org";
        const badUserId = "@bad:example.org";
        const badEvent = {type: "m.room.bad", state_key: badUserId, sender: notBotUserId};

        const joinSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(okRoomId);
        });

        appservice.getIntentForUserId = (uid) => {
            expect(uid).toEqual(okUserId);
            return <Intent>{
                joinRoom: joinSpy,
            };
        };

        const conditional = simple.stub().callFn((ev) => {
            expect(ev).toBeDefined();
            if (ev['type'] === 'm.room.ok') {
                expect(ev).toMatchObject(okEvent);
                return true;
            } else if (ev['type'] === 'm.room.bad') {
                expect(ev).toMatchObject(badEvent);
                return false;
            } else {
                throw new Error("Unexpected event");
            }
        });

        AutojoinRoomsMixin.setupOnAppservice(appservice, conditional);
        appservice.emit("room.invite", okRoomId, okEvent);
        expect(joinSpy.callCount).toBe(1);
        expect(conditional.callCount).toBe(1);
        appservice.emit("room.invite", badRoomId, badEvent);
        expect(joinSpy.callCount).toBe(1);
        expect(conditional.callCount).toBe(2);
    });

    it('should join rooms from the bot without a conditional', async () => {
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

        const botUserId = "@_bot_:example.org";

        const okRoomId = "!ok:example.org";
        const okUserId = "@ok:example.org";
        const okEvent = {type: "m.room.ok", state_key: okUserId, sender: botUserId};

        const badRoomId = "!bad:example.org";
        const badUserId = "@bad:example.org";
        const badEvent = {type: "m.room.bad", state_key: badUserId, sender: botUserId};

        const joinSpy = simple.stub().callFn((rid) => {
            if (rid !== okRoomId && rid !== badRoomId) throw new Error("Unexpected room ID");
        });

        appservice.getIntentForUserId = (uid) => {
            if (uid !== okUserId && uid !== badUserId) throw new Error("Unexpected user ID");
            return <Intent>{
                joinRoom: joinSpy,
            };
        };

        const conditional = simple.stub().callFn((ev) => {
            expect(ev).toBeDefined();
            if (ev['type'] === 'm.room.ok') {
                expect(ev).toMatchObject(okEvent);
                return true;
            } else if (ev['type'] === 'm.room.bad') {
                expect(ev).toMatchObject(badEvent);
                return false;
            } else {
                throw new Error("Unexpected event");
            }
        });

        AutojoinRoomsMixin.setupOnAppservice(appservice, conditional);
        appservice.emit("room.invite", okRoomId, okEvent);
        expect(joinSpy.callCount).toBe(1);
        expect(conditional.callCount).toBe(0);
        appservice.emit("room.invite", badRoomId, badEvent);
        expect(joinSpy.callCount).toBe(2);
        expect(conditional.callCount).toBe(0);
    });
});

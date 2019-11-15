import { Appservice, AutojoinUpgradedRoomsMixin, Intent } from "../../src";
import * as expect from "expect";
import * as simple from "simple-mock";
import { createTestClient } from "../MatrixClientTest";

describe('AutojoinUpgradedRoomsMixin', () => {
    it('should join rooms for regular upgrades', () => {
        const {client} = createTestClient();

        const senderServer = "localhost:8448";
        const roomId = "!test:example.org";
        const newRoomId = "!new:example.org";

        const joinSpy = simple.mock(client, "joinRoom").callFn((rid, names) => {
            expect(rid).toEqual(newRoomId);
            expect(names).toBeDefined();
            expect(names.length).toBe(1);
            expect(names[0]).toEqual(senderServer);
        });

        AutojoinUpgradedRoomsMixin.setupOnClient(client);
        client.emit("room.archived", roomId, {
            content: {
                replacement_room: newRoomId,
            },
            sender: `@someone:${senderServer}`,
        });
        expect(joinSpy.callCount).toBe(1);
    });

    it('should join rooms for appservice upgrades', async () => {
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

        const botIntent = appservice.botIntent;
        botIntent.ensureRegistered = () => {
            return null;
        };

        const senderServer = "localhost:8448";
        const roomId = "!test:example.org";
        const newRoomId = "!new:example.org";
        const joinedUserIds = ["@_prefix_aaa:example.org", "@_prefix_bbb:example.org", "@_bot_:example.org", "@unrelated:example.org"];

        botIntent.underlyingClient.getJoinedRoomMembers = (rid) => {
            expect(rid).toEqual(roomId);
            return Promise.resolve(joinedUserIds);
        };

        const joinSpy = simple.stub().callFn((rid, names) => {
            expect(rid).toEqual(newRoomId);
            expect(names).toBeDefined();
            expect(names.length).toBe(1);
            expect(names[0]).toEqual(senderServer);
            return Promise.resolve({room_id: newRoomId});
        });

        botIntent.underlyingClient.joinRoom = joinSpy;

        const waitPromise = new Promise(((resolve, reject) => {
            const intentJoinSpy = simple.stub().callFn((rid) => {
                expect(rid).toEqual(newRoomId);
            });

            let calls = 0;
            appservice.getIntentForUserId = (uid) => {
                if (uid === "@_bot_:example.org") {
                    return botIntent;
                }
                if (uid !== joinedUserIds[0] && uid !== joinedUserIds[1]) {
                    throw new Error("Expected an appservice user ID, got " + uid);
                }
                if (++calls === 2) resolve();
                return <Intent>{
                    joinRoom: intentJoinSpy,
                };
            };
        }));

        AutojoinUpgradedRoomsMixin.setupOnAppservice(appservice);
        appservice.emit("room.archived", roomId, {
            content: {
                replacement_room: newRoomId,
            },
            sender: `@someone:${senderServer}`,
        });
        await waitPromise;
        expect(joinSpy.callCount).toBe(1);
    });
});

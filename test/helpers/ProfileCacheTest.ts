import * as expect from "expect";
import { Appservice, ProfileCache } from "../../src";
import { createTestClient } from "../MatrixClientTest";
import * as simple from "simple-mock";
import { testDelay } from "../TestUtils";

describe('ProfileCache', () => {
    it('should request the profile if it is not cached', async () => {
        const userId = "@test:example.org";
        const roomId = "!room:example.org";
        const roomProfile = {displayname: "Alice", avatar_url: "mxc://example.org/abc"};
        const generalProfile = {displayname: "Bob", avatar_url: "mxc://example.org/123"};

        const {client} = createTestClient();

        const getStateEventSpy = simple.mock(client, "getRoomStateEvent").callFn((rid, type, stateKey) => {
            expect(rid).toBe(roomId);
            expect(type).toBe("m.room.member");
            expect(stateKey).toBe(userId);
            return Promise.resolve(roomProfile);
        });
        const getProfileSpy = simple.mock(client, "getUserProfile").callFn((uid) => {
            expect(uid).toEqual(userId);
            return Promise.resolve(generalProfile);
        });

        const cache = new ProfileCache(20, 30000, client);

        let profile = await cache.getUserProfile(userId, roomId);
        expect(profile).toBeDefined();
        expect(profile.displayName).toEqual(roomProfile.displayname);
        expect(profile.avatarUrl).toEqual(roomProfile.avatar_url);
        expect(getStateEventSpy.callCount).toBe(1);
        expect(getProfileSpy.callCount).toBe(0);

        // Make sure it cached it
        profile = await cache.getUserProfile(userId, roomId);
        expect(profile).toBeDefined();
        expect(profile.displayName).toEqual(roomProfile.displayname);
        expect(profile.avatarUrl).toEqual(roomProfile.avatar_url);
        expect(getStateEventSpy.callCount).toBe(1);
        expect(getProfileSpy.callCount).toBe(0);

        // Now check the general profile
        profile = await cache.getUserProfile(userId, null);
        expect(profile).toBeDefined();
        expect(profile.displayName).toEqual(generalProfile.displayname);
        expect(profile.avatarUrl).toEqual(generalProfile.avatar_url);
        expect(getStateEventSpy.callCount).toBe(1);
        expect(getProfileSpy.callCount).toBe(1);

        // Make sure it cached it
        profile = await cache.getUserProfile(userId, null);
        expect(profile).toBeDefined();
        expect(profile.displayName).toEqual(generalProfile.displayname);
        expect(profile.avatarUrl).toEqual(generalProfile.avatar_url);
        expect(getStateEventSpy.callCount).toBe(1);
        expect(getProfileSpy.callCount).toBe(1);
    });

    it('should watch for membership updates with a MatrixClient', async () => {
        const userId = "@test:example.org";
        const roomId = "!room:example.org";
        const roomProfile = {displayname: "Alice", avatar_url: "mxc://example.org/abc"};
        let generalProfile = {displayname: "Bob", avatar_url: "mxc://example.org/123"};
        const altRoomProfile = {displayname: "Charlie", avatar_url: "mxc://example.org/456"};
        const membershipEvent = {state_key: userId, type: 'm.room.member', content: altRoomProfile};

        const {client: client1} = createTestClient();
        const {client: client2} = createTestClient();

        const getStateEventSpy1 = simple.mock(client1, "getRoomStateEvent").callFn((rid, type, stateKey) => {
            expect(rid).toBe(roomId);
            expect(type).toBe("m.room.member");
            expect(stateKey).toBe(userId);
            return Promise.resolve(roomProfile);
        });
        const getProfileSpy1 = simple.mock(client1, "getUserProfile").callFn((uid) => {
            expect(uid).toEqual(userId);
            return Promise.resolve(generalProfile);
        });

        const getStateEventSpy2 = simple.mock(client2, "getRoomStateEvent").callFn((rid, type, stateKey) => {
            expect(rid).toBe(roomId);
            expect(type).toBe("m.room.member");
            expect(stateKey).toBe(userId);
            return Promise.resolve(roomProfile);
        });
        const getProfileSpy2 = simple.mock(client2, "getUserProfile").callFn((uid) => {
            expect(uid).toEqual(userId);
            return Promise.resolve(generalProfile);
        });

        const cache = new ProfileCache(20, 30000, client1);

        // Watch for changes
        cache.watchWithClient(client2);

        // Ensure nothing changes when an update happens
        client2.emit("room.event", roomId, membershipEvent);
        expect(getStateEventSpy1.callCount).toBe(0);
        expect(getProfileSpy1.callCount).toBe(0);
        expect(getStateEventSpy2.callCount).toBe(0);
        expect(getProfileSpy2.callCount).toBe(0);

        // Get the profile once to cache it
        let profile = await cache.getUserProfile(userId, roomId);
        expect(profile).toBeDefined();
        expect(profile.displayName).toEqual(roomProfile.displayname);
        expect(profile.avatarUrl).toEqual(roomProfile.avatar_url);
        expect(getStateEventSpy1.callCount).toBe(1);
        expect(getProfileSpy1.callCount).toBe(0);
        expect(getStateEventSpy2.callCount).toBe(0);
        expect(getProfileSpy2.callCount).toBe(0);

        // Ensure it's updated from the right client (which should be none because it's a membership event)
        client2.emit("room.event", roomId, membershipEvent);
        expect(getStateEventSpy1.callCount).toBe(1);
        expect(getProfileSpy1.callCount).toBe(0);
        expect(getStateEventSpy2.callCount).toBe(0);
        expect(getProfileSpy2.callCount).toBe(0);

        // Verify the profile got updated
        profile = await cache.getUserProfile(userId, roomId);
        expect(profile).toBeDefined();
        expect(profile.displayName).toEqual(altRoomProfile.displayname);
        expect(profile.avatarUrl).toEqual(altRoomProfile.avatar_url);

        // Now check the general profile (cache it first)
        profile = await cache.getUserProfile(userId, null);
        expect(profile).toBeDefined();
        expect(profile.displayName).toEqual(generalProfile.displayname);
        expect(profile.avatarUrl).toEqual(generalProfile.avatar_url);
        expect(getStateEventSpy1.callCount).toBe(1);
        expect(getProfileSpy1.callCount).toBe(1);
        expect(getStateEventSpy2.callCount).toBe(0);
        expect(getProfileSpy2.callCount).toBe(0);

        // Change the profile slightly and expect it to update
        generalProfile = {displayname: "Daniel", avatar_url: "mxc://example.org/def"};
        client2.emit("room.event", roomId, membershipEvent);
        await testDelay(100); // Let the promises settle.
        expect(getStateEventSpy1.callCount).toBe(1);
        expect(getProfileSpy1.callCount).toBe(1);
        expect(getStateEventSpy2.callCount).toBe(0);
        expect(getProfileSpy2.callCount).toBe(1);
        profile = await cache.getUserProfile(userId, null);
        expect(profile).toBeDefined();
        expect(profile.displayName).toEqual(generalProfile.displayname);
        expect(profile.avatarUrl).toEqual(generalProfile.avatar_url);
        expect(getStateEventSpy1.callCount).toBe(1);
        expect(getProfileSpy1.callCount).toBe(1);
        expect(getStateEventSpy2.callCount).toBe(0);
        expect(getProfileSpy2.callCount).toBe(1);
    });

    it('should watch for membership updates with an appservice', async () => {
        const userId = "@test:example.org";
        const roomId = "!room:example.org";
        const roomProfile = {displayname: "Alice", avatar_url: "mxc://example.org/abc"};
        let generalProfile = {displayname: "Bob", avatar_url: "mxc://example.org/123"};
        const altRoomProfile = {displayname: "Charlie", avatar_url: "mxc://example.org/456"};
        const membershipEvent = {state_key: userId, type: 'm.room.member', content: altRoomProfile};

        const {client: client1} = createTestClient();
        const {client: client2} = createTestClient();
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

        const getStateEventSpy1 = simple.mock(client1, "getRoomStateEvent").callFn((rid, type, stateKey) => {
            expect(rid).toBe(roomId);
            expect(type).toBe("m.room.member");
            expect(stateKey).toBe(userId);
            return Promise.resolve(roomProfile);
        });
        const getProfileSpy1 = simple.mock(client1, "getUserProfile").callFn((uid) => {
            expect(uid).toEqual(userId);
            return Promise.resolve(generalProfile);
        });

        const getStateEventSpy2 = simple.mock(client2, "getRoomStateEvent").callFn((rid, type, stateKey) => {
            expect(rid).toBe(roomId);
            expect(type).toBe("m.room.member");
            expect(stateKey).toBe(userId);
            return Promise.resolve(roomProfile);
        });
        const getProfileSpy2 = simple.mock(client2, "getUserProfile").callFn((uid) => {
            expect(uid).toEqual(userId);
            return Promise.resolve(generalProfile);
        });

        const cache = new ProfileCache(20, 30000, client1);

        // Watch for changes
        const clientFnSpy = simple.stub().callFn((uid, rid) => {
            expect(uid).toEqual(userId);
            expect(rid).toEqual(roomId);
            return client2;
        });
        cache.watchWithAppservice(appservice, clientFnSpy);

        // Ensure nothing changes when an update happens
        appservice.emit("room.event", roomId, membershipEvent);
        expect(clientFnSpy.callCount).toBe(1);
        expect(getStateEventSpy1.callCount).toBe(0);
        expect(getProfileSpy1.callCount).toBe(0);
        expect(getStateEventSpy2.callCount).toBe(0);
        expect(getProfileSpy2.callCount).toBe(0);

        // Get the profile once to cache it
        let profile = await cache.getUserProfile(userId, roomId);
        expect(profile).toBeDefined();
        expect(profile.displayName).toEqual(roomProfile.displayname);
        expect(profile.avatarUrl).toEqual(roomProfile.avatar_url);
        expect(getStateEventSpy1.callCount).toBe(1);
        expect(getProfileSpy1.callCount).toBe(0);
        expect(getStateEventSpy2.callCount).toBe(0);
        expect(getProfileSpy2.callCount).toBe(0);

        // Ensure it's updated from the right client (which should be none because it's a membership event)
        appservice.emit("room.event", roomId, membershipEvent);
        expect(clientFnSpy.callCount).toBe(2);
        expect(getStateEventSpy1.callCount).toBe(1);
        expect(getProfileSpy1.callCount).toBe(0);
        expect(getStateEventSpy2.callCount).toBe(0);
        expect(getProfileSpy2.callCount).toBe(0);

        // Verify the profile got updated
        profile = await cache.getUserProfile(userId, roomId);
        expect(profile).toBeDefined();
        expect(profile.displayName).toEqual(altRoomProfile.displayname);
        expect(profile.avatarUrl).toEqual(altRoomProfile.avatar_url);

        // Now check the general profile (cache it first)
        profile = await cache.getUserProfile(userId, null);
        expect(profile).toBeDefined();
        expect(profile.displayName).toEqual(generalProfile.displayname);
        expect(profile.avatarUrl).toEqual(generalProfile.avatar_url);
        expect(getStateEventSpy1.callCount).toBe(1);
        expect(getProfileSpy1.callCount).toBe(1);
        expect(getStateEventSpy2.callCount).toBe(0);
        expect(getProfileSpy2.callCount).toBe(0);

        // Change the profile slightly and expect it to update
        generalProfile = {displayname: "Daniel", avatar_url: "mxc://example.org/def"};
        appservice.emit("room.event", roomId, membershipEvent);
        await testDelay(100); // Let the promises settle.
        expect(clientFnSpy.callCount).toBe(3);
        expect(getStateEventSpy1.callCount).toBe(1);
        expect(getProfileSpy1.callCount).toBe(1);
        expect(getStateEventSpy2.callCount).toBe(0);
        expect(getProfileSpy2.callCount).toBe(1);
        profile = await cache.getUserProfile(userId, null);
        expect(profile).toBeDefined();
        expect(profile.displayName).toEqual(generalProfile.displayname);
        expect(profile.avatarUrl).toEqual(generalProfile.avatar_url);
        expect(getStateEventSpy1.callCount).toBe(1);
        expect(getProfileSpy1.callCount).toBe(1);
        expect(getStateEventSpy2.callCount).toBe(0);
        expect(getProfileSpy2.callCount).toBe(1);
    });
});

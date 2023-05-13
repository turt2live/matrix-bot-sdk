import * as simple from "simple-mock";

import { EncryptionAlgorithm } from "../src";
import { createTestClient, testCryptoStores, TEST_DEVICE_ID } from "./TestUtils";

describe('DMs', () => {
    it('should update the cache when an sync requests happen', async () => {
        const selfUserId = "@self:example.org";
        const { client, http } = createTestClient(null, selfUserId);
        const dms = client.dms;

        const dmRoomId1 = "!dm:example.org";
        const dmUserId1 = "@one:example.org";
        const dmRoomId2 = "!dm2:example.org";
        const dmUserId2 = "@two:example.org";

        const accountDataDms = {
            [dmUserId2]: [dmRoomId2],
        };

        // noinspection TypeScriptValidateJSTypes
        http.when("GET", `/user/${encodeURIComponent(selfUserId)}/account_data/m.direct`).respond(200, accountDataDms);

        // noinspection TypeScriptValidateJSTypes
        http.when("PUT", `/user/${encodeURIComponent(selfUserId)}/account_data/m.direct`).respond(200, (path, body) => {
            expect(body).toEqual({
                ...accountDataDms,
                [dmUserId1]: [dmRoomId1],
            });
            return {};
        });

        const flush = http.flushAllExpected();

        const accountHandleProm = new Promise<void>(resolve => {
            const orig = (<any>dms).updateFromAccountData.bind(dms);
            (<any>dms).updateFromAccountData = simple.stub().callFn(async (ev) => {
                await orig(ev);
                resolve();
            });
        });
        const inviteHandleProm = new Promise<void>(resolve => {
            const orig = (<any>dms).handleInvite.bind(dms);
            (<any>dms).handleInvite = simple.stub().callFn(async (rid, ev) => {
                await orig(rid, ev);
                resolve();
            });
        });

        expect(dms.isDm(dmRoomId1)).toBe(false);
        expect(dms.isDm(dmRoomId2)).toBe(false);

        client.emit("account_data", {
            type: "m.direct",
            content: {
                "@unused:example.org": [
                    "!WRONG:example.org",
                ],
            },
        });
        await accountHandleProm;

        expect(dms.isDm(dmRoomId1)).toBe(false);
        expect(dms.isDm(dmRoomId2)).toBe(true);

        client.emit("room.invite", dmRoomId1, {
            type: "m.room.member",
            sender: dmUserId1,
            state_key: selfUserId,
            content: {
                membership: "invite",
                is_direct: true,
            },
        });
        await inviteHandleProm;

        expect(dms.isDm(dmRoomId1)).toBe(true);
        expect(dms.isDm(dmRoomId2)).toBe(true);

        await flush;
    });

    it('should update from account data when requested', async () => {
        const selfUserId = "@self:example.org";
        const { client, http } = createTestClient(null, selfUserId);
        const dms = client.dms;

        const dmRoomId = "!dm:example.org";
        const dmUserId = "@one:example.org";

        const accountDataDms = {
            [dmUserId]: [dmRoomId],
        };

        // noinspection TypeScriptValidateJSTypes
        http.when("GET", `/user/${encodeURIComponent(selfUserId)}/account_data/m.direct`).respond(200, accountDataDms);

        expect(dms.isDm(dmRoomId)).toBe(false);
        await Promise.all([dms.update(), http.flushAllExpected()]);
        expect(dms.isDm(dmRoomId)).toBe(true);
    });

    it('should not fail to update when the account data is missing/fails', async () => {
        const selfUserId = "@self:example.org";
        const { client, http } = createTestClient(null, selfUserId);
        const dms = client.dms;

        const dmRoomId = "!dm:example.org";

        // noinspection TypeScriptValidateJSTypes
        http.when("GET", `/user/${encodeURIComponent(selfUserId)}/account_data/m.direct`).respond(404);

        expect(dms.isDm(dmRoomId)).toBe(false);
        await Promise.all([dms.update(), http.flushAllExpected()]);
        expect(dms.isDm(dmRoomId)).toBe(false);
    });

    it('should create a DM if one does not exist', async () => {
        const selfUserId = "@self:example.org";
        const { client, http } = createTestClient(null, selfUserId);
        const dms = client.dms;

        const dmRoomId = "!dm:example.org";
        const dmUserId = "@target:example.org";

        // noinspection TypeScriptValidateJSTypes
        http.when("POST", `/createRoom`).respond(200, (path, body) => {
            expect(body).toEqual({
                invite: [dmUserId],
                is_direct: true,
                preset: "trusted_private_chat",
                initial_state: [],
            });

            return { room_id: dmRoomId };
        });

        // noinspection TypeScriptValidateJSTypes
        http.when("PUT", `/user/${encodeURIComponent(selfUserId)}/account_data/m.direct`).respond(200, (path, body) => {
            expect(body).toEqual({
                [dmUserId]: [dmRoomId],
            });
            return {};
        });

        const flush = http.flushAllExpected();

        expect(dms.isDm(dmRoomId)).toBe(false);
        const roomId = await dms.getOrCreateDm(dmUserId);
        expect(roomId).toEqual(dmRoomId);
        expect(dms.isDm(dmRoomId)).toBe(true);

        await flush;
    });

    it('should call the optional create room function when provided', async () => {
        const selfUserId = "@self:example.org";
        const { client, http } = createTestClient(null, selfUserId);
        const dms = client.dms;

        const dmRoomId = "!dm:example.org";
        const dmUserId = "@target:example.org";

        const fn = simple.stub().callFn(async (uid) => {
            expect(uid).toEqual(dmUserId);
            return dmRoomId;
        });

        // noinspection TypeScriptValidateJSTypes
        http.when("PUT", `/user/${encodeURIComponent(selfUserId)}/account_data/m.direct`).respond(200, (path, body) => {
            expect(body).toEqual({
                [dmUserId]: [dmRoomId],
            });
            return {};
        });

        const flush = http.flushAllExpected();

        expect(dms.isDm(dmRoomId)).toBe(false);
        const roomId = await dms.getOrCreateDm(dmUserId, fn);
        expect(roomId).toEqual(dmRoomId);
        expect(dms.isDm(dmRoomId)).toBe(true);
        expect(fn.callCount).toBe(1);

        await flush;
    });

    it('should try to patch up DMs when a DM is potentially known', async () => {
        const selfUserId = "@self:example.org";
        const { client, http } = createTestClient(null, selfUserId);
        const dms = client.dms;

        const dmRoomId = "!dm:example.org";
        const dmUserId = "@target:example.org";
        const deadRoomId = "!unused:example.org";

        const accountDataDms = {
            [dmUserId]: [deadRoomId, dmRoomId],
        };

        // noinspection TypeScriptValidateJSTypes
        http.when("GET", `/user/${encodeURIComponent(selfUserId)}/account_data/m.direct`).respond(200, accountDataDms);

        // noinspection TypeScriptValidateJSTypes
        http.when("GET", `rooms/${encodeURIComponent(deadRoomId)}/members`).respond(200, (path, body) => {
            return {
                chunk: [
                    // HACK: These are minimal events for testing purposes only.
                    {
                        type: "m.room.member",
                        state_key: selfUserId,
                        content: {
                            membership: "join",
                        },
                    },
                    {
                        type: "m.room.member",
                        state_key: dmUserId,
                        content: {
                            membership: "leave",
                        },
                    },
                ],
            };
        });

        // noinspection TypeScriptValidateJSTypes
        http.when("GET", `rooms/${encodeURIComponent(dmRoomId)}/members`).respond(200, (path, body) => {
            return {
                chunk: [
                    // HACK: These are minimal events for testing purposes only.
                    {
                        type: "m.room.member",
                        state_key: selfUserId,
                        content: {
                            membership: "join",
                        },
                    },
                    {
                        type: "m.room.member",
                        state_key: dmUserId,
                        content: {
                            membership: "join",
                        },
                    },
                ],
            };
        });

        // noinspection TypeScriptValidateJSTypes
        http.when("PUT", `/user/${encodeURIComponent(selfUserId)}/account_data/m.direct`).respond(200, (path, body) => {
            expect(body).toEqual({
                [dmUserId]: [dmRoomId],
            });
            return {};
        });

        const flush = http.flushAllExpected();

        await dms.update();
        expect(dms.isDm(dmRoomId)).toBe(true);
        expect(dms.isDm(deadRoomId)).toBe(true);
        const roomId = await dms.getOrCreateDm(dmUserId);
        expect(roomId).toEqual(dmRoomId);
        expect(dms.isDm(dmRoomId)).toBe(true);
        expect(dms.isDm(deadRoomId)).toBe(false);

        await flush;
    });

    it('should use the cache if a DM already exists', async () => {
        const selfUserId = "@self:example.org";
        const { client, http } = createTestClient(null, selfUserId);
        const dms = client.dms;

        // Stop calls to `/members`
        (<any>dms).fixDms = () => Promise.resolve();

        const dmRoomId = "!dm:example.org";
        const dmUserId = "@target:example.org";

        const accountDataDms = {
            [dmUserId]: [dmRoomId],
        };

        // noinspection TypeScriptValidateJSTypes
        http.when("GET", `/user/${encodeURIComponent(selfUserId)}/account_data/m.direct`).respond(200, accountDataDms);

        const flush = http.flushAllExpected();

        await dms.update();
        expect(dms.isDm(dmRoomId)).toBe(true);
        const roomId = await dms.getOrCreateDm(dmUserId);
        expect(roomId).toEqual(dmRoomId);
        expect(dms.isDm(dmRoomId)).toBe(true);

        await flush;
    });

    it('should create an encrypted DM if supported', () => testCryptoStores(async (cryptoStoreType) => {
        const selfUserId = "@self:example.org";
        const { client, http } = createTestClient(null, selfUserId, cryptoStoreType);
        const dms = client.dms;

        const dmRoomId = "!dm:example.org";
        const dmUserId = "@target:example.org";

        // noinspection TypeScriptValidateJSTypes
        http.when("POST", `/keys/query`).respond(200, (path, body) => {
            expect(body).toMatchObject({
                device_keys: {
                    [dmUserId]: [],
                },
            });

            return {
                failures: {},
                device_keys: {
                    [dmUserId]: {
                        [TEST_DEVICE_ID]: {
                            user_id: dmUserId,
                            device_id: TEST_DEVICE_ID,
                            // mostly unused, but would be a device
                        },
                    },
                },
            };
        });

        // noinspection TypeScriptValidateJSTypes
        http.when("POST", `/createRoom`).respond(200, (path, body) => {
            expect(body).toEqual({
                invite: [dmUserId],
                is_direct: true,
                preset: "trusted_private_chat",
                initial_state: [{
                    type: "m.room.encryption",
                    state_key: "",
                    content: { algorithm: EncryptionAlgorithm.MegolmV1AesSha2 },
                }],
            });

            return { room_id: dmRoomId };
        });

        // noinspection TypeScriptValidateJSTypes
        http.when("PUT", `/user/${encodeURIComponent(selfUserId)}/account_data/m.direct`).respond(200, (path, body) => {
            expect(body).toEqual({
                [dmUserId]: [dmRoomId],
            });
            return {};
        });

        const flush = http.flushAllExpected();

        expect(dms.isDm(dmRoomId)).toBe(false);
        const roomId = await dms.getOrCreateDm(dmUserId);
        expect(roomId).toEqual(dmRoomId);
        expect(dms.isDm(dmRoomId)).toBe(true);

        await flush;
    }));

    it('should create an unencrypted DM when the target user has no devices', () => testCryptoStores(async (cryptoStoreType) => {
        const selfUserId = "@self:example.org";
        const { client, http } = createTestClient(null, selfUserId, cryptoStoreType);
        const dms = client.dms;

        const dmRoomId = "!dm:example.org";
        const dmUserId = "@target:example.org";

        // noinspection TypeScriptValidateJSTypes
        http.when("POST", `/keys/query`).respond(200, (path, body) => {
            expect(body).toMatchObject({
                device_keys: {
                    [dmUserId]: [],
                },
            });

            return {
                failures: {},
                device_keys: {}, // none!
            };
        });

        // noinspection TypeScriptValidateJSTypes
        http.when("POST", `/createRoom`).respond(200, (path, body) => {
            expect(body).toEqual({
                invite: [dmUserId],
                is_direct: true,
                preset: "trusted_private_chat",
                initial_state: [],
            });

            return { room_id: dmRoomId };
        });

        // noinspection TypeScriptValidateJSTypes
        http.when("PUT", `/user/${encodeURIComponent(selfUserId)}/account_data/m.direct`).respond(200, (path, body) => {
            expect(body).toEqual({
                [dmUserId]: [dmRoomId],
            });
            return {};
        });

        const flush = http.flushAllExpected();

        expect(dms.isDm(dmRoomId)).toBe(false);
        const roomId = await dms.getOrCreateDm(dmUserId);
        expect(roomId).toEqual(dmRoomId);
        expect(dms.isDm(dmRoomId)).toBe(true);

        await flush;
    }));
});

import * as simple from "simple-mock";
import HttpBackend from 'matrix-mock-request';

import { EncryptedFile, EncryptionAlgorithm, IOlmEncrypted, IToDeviceMessage, MatrixClient, MembershipEvent, OTKAlgorithm, RoomEncryptionAlgorithm } from "../../src";
import { bindNullEngine, createTestClient, testCryptoStores, TEST_DEVICE_ID } from "../TestUtils";

describe('CryptoClient', () => {
    it('should not have a device ID or be ready until prepared', () => testCryptoStores(async (cryptoStoreType) => {
        const userId = "@alice:example.org";
        const { client, http } = createTestClient(null, userId, cryptoStoreType);

        client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });

        expect(client.crypto).toBeDefined();
        expect(client.crypto.clientDeviceId).toBeFalsy();
        expect(client.crypto.isReady).toEqual(false);

        bindNullEngine(http);
        await Promise.all([
            client.crypto.prepare(),
            http.flushAllExpected(),
        ]);

        expect(client.crypto.clientDeviceId).toEqual(TEST_DEVICE_ID);
        expect(client.crypto.isReady).toEqual(true);
    }));

    describe('prepare', () => {
        it('should prepare the room tracker', () => testCryptoStores(async (cryptoStoreType) => {
            const userId = "@alice:example.org";
            const { client, http } = createTestClient(null, userId, cryptoStoreType);

            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });

            bindNullEngine(http);
            // Prepare first
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);
            expect(client.crypto.isReady).toBe(true);
        }));

        it('should use a stored device ID', () => testCryptoStores(async (cryptoStoreType) => {
            const userId = "@alice:example.org";
            const { client, http } = createTestClient(null, userId, cryptoStoreType);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            const whoamiSpy = simple.stub().callFn(() => Promise.resolve({ user_id: userId, device_id: "wrong" }));
            client.getWhoAmI = whoamiSpy;

            bindNullEngine(http);
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);
            expect(whoamiSpy.callCount).toEqual(0);
            expect(client.crypto.clientDeviceId).toEqual(TEST_DEVICE_ID);
        }));
    });

    describe('processSync', () => {
        /**
         * Helper class to be able to call {@link MatrixClient#processSync}, which is otherwise private.
         */
        interface ProcessSyncClient {
            processSync: MatrixClient["processSync"];
        }

        it('should process encrypted to-device messages', () => testCryptoStores(async (cryptoStoreType) => {
            const userId = "@alice:example.org";
            const { client, http } = createTestClient(null, userId, cryptoStoreType);
            const psClient = <ProcessSyncClient>(<any>client);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            const toDeviceMessage: IToDeviceMessage<IOlmEncrypted> = {
                type: "m.room.encrypted",
                sender: userId,
                content: {
                    algorithm: EncryptionAlgorithm.OlmV1Curve25519AesSha2,
                    sender_key: "sender_curve25519_key",
                    ciphertext: {
                        ["device_curve25519_key"]: {
                            type: 0,
                            body: "encrypted_payload_base_64",
                        },
                    },
                },
            };
            const sync = {
                to_device: { events: [toDeviceMessage] },
                device_unused_fallback_key_types: [OTKAlgorithm.Signed],
                device_one_time_keys_count: {
                    [OTKAlgorithm.Signed]: 12,
                    [OTKAlgorithm.Unsigned]: 14,
                },
                device_lists: {
                    changed: ["@bob:example.org"],
                    left: ["@charlie:example.org"],
                },
            };

            const toDeviceSpy = simple.stub().callFn((ev) => {
                for (const prop in toDeviceMessage) {
                    expect(ev).toHaveProperty(prop);
                }
            });
            client.on("to_device.decrypted", toDeviceSpy);

            bindNullEngine(http);
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);

            bindNullEngine(http);
            await Promise.all([
                psClient.processSync(sync),
                http.flushAllExpected(),
            ]);

            expect(toDeviceSpy.callCount).toBe(1);
        }));
    });

    describe('isRoomEncrypted', () => {
        it('should fail when the crypto has not been prepared', () => testCryptoStores(async (cryptoStoreType) => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, cryptoStoreType);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            // await client.crypto.prepare(); // deliberately commented

            try {
                await client.crypto.isRoomEncrypted("!new:example.org");

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        }));

        it('should return false for unknown rooms', () => testCryptoStores(async (cryptoStoreType) => {
            const userId = "@alice:example.org";
            const { client, http } = createTestClient(null, userId, cryptoStoreType);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            client.getRoomStateEvent = () => Promise.reject(new Error("not used"));

            bindNullEngine(http);
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(false);
        }));

        it('should return false for unencrypted rooms', () => testCryptoStores(async (cryptoStoreType) => {
            const userId = "@alice:example.org";
            const { client, http } = createTestClient(null, userId, cryptoStoreType);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            client.getRoomStateEvent = () => Promise.reject(new Error("implied 404"));

            bindNullEngine(http);
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(false);
        }));

        it('should return true for encrypted rooms (redacted state)', () => testCryptoStores(async (cryptoStoreType) => {
            const userId = "@alice:example.org";
            const { client, http } = createTestClient(null, userId, cryptoStoreType);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            client.getRoomStateEvent = () => Promise.resolve({});

            bindNullEngine(http);
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(true);
        }));

        it('should return true for encrypted rooms', () => testCryptoStores(async (cryptoStoreType) => {
            const userId = "@alice:example.org";
            const { client, http } = createTestClient(null, userId, cryptoStoreType);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            client.getRoomStateEvent = () => Promise.resolve({ algorithm: RoomEncryptionAlgorithm.MegolmV1AesSha2 });

            bindNullEngine(http);
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(true);
        }));
    });

    describe('sign', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;
        let http: HttpBackend;

        beforeEach(() => testCryptoStores(async (cryptoStoreType) => {
            const { client: mclient, http: mhttp } = createTestClient(null, userId, cryptoStoreType);
            client = mclient;
            http = mhttp;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            // client crypto not prepared for the one test which wants that state
        }));

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.sign({ doesnt: "matter" });

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should sign the object while retaining signatures without mutation', async () => {
            bindNullEngine(http);
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);

            const obj = {
                sign: "me",
                signatures: {
                    "@another:example.org": {
                        "ed25519:DEVICE": "signature goes here",
                    },
                },
                unsigned: {
                    not: "included",
                },
            };

            const signatures = await client.crypto.sign(obj);
            expect(signatures).toMatchObject({
                [userId]: {
                    [`ed25519:${TEST_DEVICE_ID}`]: expect.any(String),
                },
                ...obj.signatures,
            });
            expect(obj['signatures']).toBeDefined();
            expect(obj['unsigned']).toBeDefined();
        });
    });

    describe('encryptRoomEvent', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;
        let http: HttpBackend;

        beforeEach(() => testCryptoStores(async (cryptoStoreType) => {
            const { client: mclient, http: mhttp } = createTestClient(null, userId, cryptoStoreType);
            client = mclient;
            http = mhttp;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            // client crypto not prepared for the one test which wants that state
        }));

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.encryptRoomEvent("!room:example.org", "org.example", {});

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should fail in unencrypted rooms', async () => {
            bindNullEngine(http);
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);

            // Force unencrypted rooms
            client.crypto.isRoomEncrypted = async () => false;

            try {
                await client.crypto.encryptRoomEvent("!room:example.org", "type", {});

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("Room is not encrypted");
            }
        });

        it.skip('should get devices for invited members', async () => {
            // TODO: Support invited members, if history visibility would allow.
        });
    });

    describe('decryptRoomEvent', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(() => testCryptoStores(async (cryptoStoreType) => {
            const { client: mclient } = createTestClient(null, userId, cryptoStoreType);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            // client crypto not prepared for the one test which wants that state
        }));

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.decryptRoomEvent(null, null);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });
    });

    describe('encryptMedia', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;
        let http: HttpBackend;

        beforeEach(() => testCryptoStores(async (cryptoStoreType) => {
            const { client: mclient, http: mhttp } = createTestClient(null, userId, cryptoStoreType);
            client = mclient;
            http = mhttp;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            // client crypto not prepared for the one test which wants that state
        }));

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.encryptMedia(null);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should encrypt media', async () => {
            bindNullEngine(http);
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);

            const inputBuffer = Buffer.from("test");
            const inputStr = inputBuffer.join('');

            const result = await client.crypto.encryptMedia(inputBuffer);
            expect(result).toBeDefined();
            expect(result.buffer).toBeDefined();
            expect(result.buffer.join('')).not.toEqual(inputStr);
            expect(result.file).toBeDefined();
            expect(result.file.hashes).toBeDefined();
            expect(result.file.hashes.sha256).not.toEqual("n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg");
            expect(result.file).toMatchObject({
                hashes: {
                    sha256: expect.any(String),
                },
                key: {
                    alg: "A256CTR",
                    ext: true,
                    key_ops: ['encrypt', 'decrypt'],
                    kty: "oct",
                    k: expect.any(String),
                },
                iv: expect.any(String),
                v: "v2",
            });
        });
    });

    describe('decryptMedia', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;
        let http: HttpBackend;

        // Created from Element Web
        const testFileContents = "THIS IS A TEST FILE.";
        const mediaFileContents = Buffer.from("eB15hJlkw8WwgYxwY2mu8vS250s=", "base64");
        const testFile: EncryptedFile = {
            v: "v2",
            key: {
                alg: "A256CTR",
                ext: true,
                k: "l3OtQ3IJzfJa85j2WMsqNu7J--C-I1hzPxFvinR48mM",
                key_ops: [
                    "encrypt",
                    "decrypt",
                ],
                kty: "oct",
            },
            iv: "KJQOebQS1wwAAAAAAAAAAA",
            hashes: {
                sha256: "Qe4YzmVoPaEcLQeZwFZ4iMp/dlgeFph6mi5DmCaCOzg",
            },
            url: "mxc://localhost/uiWuISEVWixompuiiYyUoGrx",
        };

        function copyOfTestFile(): EncryptedFile {
            return JSON.parse(JSON.stringify(testFile));
        }

        beforeEach(() => testCryptoStores(async (cryptoStoreType) => {
            const { client: mclient, http: mhttp } = createTestClient(null, userId, cryptoStoreType);
            client = mclient;
            http = mhttp;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            // client crypto not prepared for the one test which wants that state
        }));

        it('should fail when the crypto has not been prepared', async () => {
            try {
                await client.crypto.encryptMedia(null);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should be symmetrical', async () => {
            bindNullEngine(http);
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);

            const mxc = "mxc://example.org/test";
            const inputBuffer = Buffer.from("test");
            const encrypted = await client.crypto.encryptMedia(inputBuffer);

            const downloadSpy = simple.stub().callFn(async (u) => {
                expect(u).toEqual(mxc);
                return { data: encrypted.buffer, contentType: "application/octet-stream" };
            });
            client.downloadContent = downloadSpy;

            const result = await client.crypto.decryptMedia({
                url: mxc,
                ...encrypted.file,
            });
            expect(result.join('')).toEqual(inputBuffer.join(''));
            expect(downloadSpy.callCount).toBe(1);
        });

        it('should decrypt', async () => {
            bindNullEngine(http);
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);

            const downloadSpy = simple.stub().callFn(async (u) => {
                expect(u).toEqual(testFile.url);
                return { data: Buffer.from(mediaFileContents), contentType: "application/octet-stream" };
            });
            client.downloadContent = downloadSpy;

            const f = copyOfTestFile();
            const result = await client.crypto.decryptMedia(f);
            expect(result.toString()).toEqual(testFileContents);
            expect(downloadSpy.callCount).toBe(1);
        });
    });

    describe('User Tracking', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;
        let http: HttpBackend;

        beforeEach(() => testCryptoStores(async (cryptoStoreType) => {
            const { client: mclient, http: mhttp } = createTestClient(null, userId, cryptoStoreType);
            client = mclient;
            http = mhttp;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            bindNullEngine(http);
            await Promise.all([
                client.crypto.prepare(),
                http.flushAllExpected(),
            ]);
        }));

        it('should update tracked users on membership changes', async () => {
            const targetUserIds = ["@bob:example.org", "@charlie:example.org"];
            const prom = new Promise<void>(extResolve => {
                const trackSpy = simple.mock().callFn((uids) => {
                    expect(uids.length).toBe(1);
                    expect(uids[0]).toEqual(targetUserIds[trackSpy.callCount - 1]);
                    if (trackSpy.callCount === 2) extResolve();
                    return Promise.resolve();
                });
                (client.crypto as any).engine.addTrackedUsers = trackSpy;
            });

            for (const targetUserId of targetUserIds) {
                client.emit("room.event", "!unused:example.org", {
                    type: "m.room.member",
                    state_key: targetUserId,
                    content: { membership: "join" },
                    sender: targetUserId + ".notthisuser",
                });
            }

            // Emit a fake update too, to try and trip up the processing
            client.emit("room.event", "!unused:example.org", {
                type: "m.room.member",
                state_key: "@notjoined:example.org",
                content: { membership: "ban" },
                sender: "@notme:example.org",
            });

            // We do weird promise things because `emit()` is sync and we're using async code, so it can
            // end up not running fast enough for our callCount checks.
            await prom;
        });

        it('should add all tracked users when the encryption config changes', async () => {
            // Stub the room tracker
            (client.crypto as any).roomTracker.onRoomEvent = () => {};

            const targetUserIds = ["@bob:example.org", "@charlie:example.org"];
            const prom1 = new Promise<void>(extResolve => {
                (client.crypto as any).engine.addTrackedUsers = simple.mock().callFn((uids) => {
                    expect(uids).toEqual(targetUserIds);
                    extResolve();
                    return Promise.resolve();
                });
            });

            const roomId = "!room:example.org";
            const prom2 = new Promise<void>(extResolve => {
                client.getRoomMembers = simple.mock().callFn((rid, token, memberships) => {
                    expect(rid).toEqual(roomId);
                    expect(token).toBeFalsy();
                    expect(memberships).toEqual(["join", "invite"]);
                    extResolve();
                    return Promise.resolve(targetUserIds.map(u => new MembershipEvent({
                        type: "m.room.member",
                        state_key: u,
                        content: { membership: "join" },
                        sender: u,
                    })));
                });
            });

            client.emit("room.event", roomId, {
                type: "m.room.encryption",
                state_key: "",
                content: {
                    algorithm: RoomEncryptionAlgorithm.MegolmV1AesSha2,
                },
            });

            // We do weird promise things because `emit()` is sync and we're using async code, so it can
            // end up not running fast enough for our callCount checks.
            await Promise.all([prom1, prom2]);
        });

        it('should update the tracked users when joining a new room', async () => {
            // Stub the room tracker
            (client.crypto as any).roomTracker.onRoomJoin = () => {};

            const targetUserIds = ["@bob:example.org", "@charlie:example.org"];
            const prom1 = new Promise<void>(extResolve => {
                (client.crypto as any).engine.addTrackedUsers = simple.mock().callFn((uids) => {
                    expect(uids).toEqual(targetUserIds);
                    extResolve();
                    return Promise.resolve();
                });
            });

            const roomId = "!room:example.org";
            const prom2 = new Promise<void>(extResolve => {
                client.getRoomMembers = simple.mock().callFn((rid, token, memberships) => {
                    expect(rid).toEqual(roomId);
                    expect(token).toBeFalsy();
                    expect(memberships).toEqual(["join", "invite"]);
                    extResolve();
                    return Promise.resolve(targetUserIds.map(u => new MembershipEvent({
                        type: "m.room.member",
                        state_key: u,
                        content: { membership: "join" },
                        sender: u,
                    })));
                });
            });

            client.crypto.isRoomEncrypted = async (rid) => {
                expect(rid).toEqual(roomId);
                return true;
            };
            client.emit("room.join", roomId);

            // We do weird promise things because `emit()` is sync and we're using async code, so it can
            // end up not running fast enough for our callCount checks.
            await Promise.all([prom1, prom2]);
        });
    });
});

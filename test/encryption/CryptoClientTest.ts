import * as simple from "simple-mock";
import {
    ConsoleLogger,
    DeviceKeyAlgorithm,
    EncryptedFile,
    LogService,
    MatrixClient,
    RoomEncryptionAlgorithm,
} from "../../src";
import { InternalOlmMachineFactory } from "../../src/e2ee/InternalOlmMachineFactory";
import { OlmMachine, Signatures } from "@turt2live/matrix-sdk-crypto-nodejs";
import { createTestClient, TEST_DEVICE_ID } from "../TestUtils";

describe('CryptoClient', () => {
    afterEach(() => {
        InternalOlmMachineFactory.FACTORY_OVERRIDE = null;
    });

    it('should not have a device ID or be ready until prepared', async () => {
        InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
            identityKeys: {},
            runEngine: () => Promise.resolve(),
        } as OlmMachine);

        const userId = "@alice:example.org";
        const { client } = createTestClient(null, userId, true);

        client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });

        expect(client.crypto).toBeDefined();
        expect(client.crypto.clientDeviceId).toBeFalsy();
        expect(client.crypto.isReady).toEqual(false);

        await client.crypto.prepare([]);

        expect(client.crypto.clientDeviceId).toEqual(TEST_DEVICE_ID);
        expect(client.crypto.isReady).toEqual(true);
    });

    describe('prepare', () => {
        it('should prepare the room tracker', async () => {
            InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
                identityKeys: {},
                runEngine: () => Promise.resolve(),
            } as OlmMachine);

            const userId = "@alice:example.org";
            const roomIds = ["!a:example.org", "!b:example.org"];
            const { client } = createTestClient(null, userId, true);

            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });

            const prepareSpy = simple.stub().callFn((rids: string[]) => {
                expect(rids).toBe(roomIds);
                return Promise.resolve();
            });

            (<any>client.crypto).roomTracker.prepare = prepareSpy; // private member access

            await client.crypto.prepare(roomIds);
            expect(prepareSpy.callCount).toEqual(1);
        });

        it('should use a stored device ID', async () => {
            InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
                identityKeys: {},
                runEngine: () => Promise.resolve(),
            } as OlmMachine);

            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            const whoamiSpy = simple.stub().callFn(() => Promise.resolve({ user_id: userId, device_id: "wrong" }));
            client.getWhoAmI = whoamiSpy;

            await client.crypto.prepare([]);
            expect(whoamiSpy.callCount).toEqual(0);
            expect(client.crypto.clientDeviceId).toEqual(TEST_DEVICE_ID);
        });
    });

    describe('isRoomEncrypted', () => {
        it('should fail when the crypto has not been prepared', async () => {
            InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
                identityKeys: {},
                runEngine: () => Promise.resolve(),
            } as OlmMachine);

            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            // await client.crypto.prepare([]); // deliberately commented

            try {
                await client.crypto.isRoomEncrypted("!new:example.org");

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should return false for unknown rooms', async () => {
            InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
                identityKeys: {},
                runEngine: () => Promise.resolve(),
            } as OlmMachine);

            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            client.getRoomStateEvent = () => Promise.reject("return value not used");
            await client.crypto.prepare([]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(false);
        });

        it('should return false for unencrypted rooms', async () => {
            InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
                identityKeys: {},
                runEngine: () => Promise.resolve(),
            } as OlmMachine);

            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            client.getRoomStateEvent = () => Promise.reject("implying 404");
            await client.crypto.prepare([]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(false);
        });

        it('should return true for encrypted rooms (redacted state)', async () => {
            InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
                identityKeys: {},
                runEngine: () => Promise.resolve(),
            } as OlmMachine);

            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            client.getRoomStateEvent = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(true);
        });

        it('should return true for encrypted rooms', async () => {
            InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
                identityKeys: {},
                runEngine: () => Promise.resolve(),
            } as OlmMachine);

            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            client.getRoomStateEvent = () => Promise.resolve({ algorithm: RoomEncryptionAlgorithm.MegolmV1AesSha2 });
            await client.crypto.prepare([]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(true);
        });
    });

    describe('sign', () => {
        const userId = "@alice:example.org";
        let client: MatrixClient;

        beforeEach(async () => {
            InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
                identityKeys: {},
                runEngine: () => Promise.resolve(),
                sign: async (_) => ({
                    [userId]: {
                        [DeviceKeyAlgorithm.Ed25519 + ":" + TEST_DEVICE_ID]: "SIGNATURE_GOES_HERE",
                    },
                } as Signatures),
            } as OlmMachine);

            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            // client crypto not prepared for the one test which wants that state
        });

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
            await client.crypto.prepare([]);

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

        beforeEach(async () => {
            InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
                identityKeys: {},
                runEngine: () => Promise.resolve(),
            } as OlmMachine);

            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            // client crypto not prepared for the one test which wants that state
        });

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
            await client.crypto.prepare([]);

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

        beforeEach(async () => {
            InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
                identityKeys: {},
                runEngine: () => Promise.resolve(),
            } as OlmMachine);

            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            // client crypto not prepared for the one test which wants that state
        });

        afterEach(async () => {
            LogService.setLogger(new ConsoleLogger());
        });

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

        beforeEach(async () => {
            InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
                identityKeys: {},
                runEngine: () => Promise.resolve(),
            } as OlmMachine);

            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            // client crypto not prepared for the one test which wants that state
        });

        afterEach(async () => {
            LogService.setLogger(new ConsoleLogger());
        });

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
            await client.crypto.prepare([]);

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

        beforeEach(async () => {
            InternalOlmMachineFactory.FACTORY_OVERRIDE = () => ({
                identityKeys: {},
                runEngine: () => Promise.resolve(),
            } as OlmMachine);

            const { client: mclient } = createTestClient(null, userId, true);
            client = mclient;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            // client crypto not prepared for the one test which wants that state
        });

        afterEach(async () => {
            LogService.setLogger(new ConsoleLogger());
        });

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
            await client.crypto.prepare([]);

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
            await client.crypto.prepare([]);

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
});

import { MatrixClient } from "../MatrixClient";
import { LogService } from "../logging/LogService";
import * as Olm from "@matrix-org/olm";
import * as crypto from "crypto";
import * as anotherJson from "another-json";
import {
    DeviceKeyAlgorithm,
    IMegolmEncrypted,
    IOlmEncrypted,
    IToDeviceMessage,
    OTKAlgorithm,
    OTKCounts,
    Signatures,
} from "../models/Crypto";
import { requiresReady } from "./decorators";
import { RoomTracker } from "./RoomTracker";
import { EncryptedRoomEvent } from "../models/events/EncryptedRoomEvent";
import { RoomEvent } from "../models/events/RoomEvent";
import { EncryptedFile } from "../models/events/MessageEvent";
import {
    decodeUnpaddedBase64,
    decodeUnpaddedUrlSafeBase64,
    encodeUnpaddedBase64,
    encodeUnpaddedUrlSafeBase64,
} from "../b64";
import { PassThrough } from "stream";
import { OlmMachine } from "matrix-sdk-crypto-nodejs";
import { RustSdkCryptoStorageProvider } from "../storage/RustSdkCryptoStorageProvider";
import { SdkOlmEngine } from "./SdkOlmEngine";

/**
 * Manages encryption for a MatrixClient. Get an instance from a MatrixClient directly
 * rather than creating one manually.
 * @category Encryption
 */
export class CryptoClient {
    private ready = false;
    private deviceId: string;
    private deviceEd25519: string;
    private deviceCurve25519: string;
    private roomTracker: RoomTracker;
    private machine: OlmMachine;

    public constructor(private client: MatrixClient) {
        this.roomTracker = new RoomTracker(this.client);
    }

    private get storage(): RustSdkCryptoStorageProvider {
        return <RustSdkCryptoStorageProvider>this.client.cryptoStore;
    }

    /**
     * The device ID for the MatrixClient.
     */
    public get clientDeviceId(): string {
        return this.deviceId;
    }

    /**
     * Whether or not the crypto client is ready to be used. If not ready, prepare() should be called.
     * @see prepare
     */
    public get isReady(): boolean {
        return this.ready;
    }

    /**
     * Prepares the crypto client for usage.
     * @param {string[]} roomIds The room IDs the MatrixClient is joined to.
     */
    public async prepare(roomIds: string[]) {
        await this.roomTracker.prepare(roomIds);

        if (this.ready) return; // stop re-preparing here

        const storedDeviceId = await this.client.cryptoStore.getDeviceId();
        if (storedDeviceId) {
            this.deviceId = storedDeviceId;
        } else {
            const deviceId = (await this.client.getWhoAmI())['device_id'];
            if (!deviceId) {
                throw new Error("Encryption not possible: server not revealing device ID");
            }
            this.deviceId = deviceId;
            await this.client.cryptoStore.setDeviceId(this.deviceId);
        }

        LogService.debug("CryptoClient", "Starting with device ID:", this.deviceId);

        this.machine = OlmMachine.withSledBackend(await this.client.getUserId(), this.deviceId, new SdkOlmEngine(this.client), this.storage.sledPath);
        await this.machine.runEngineUntilComplete();

        const identity = this.machine.identityKeys;
        this.deviceCurve25519 = identity[DeviceKeyAlgorithm.Curve25519];
        this.deviceEd25519 = identity[DeviceKeyAlgorithm.Ed25519];

        this.ready = true;
    }

    /**
     * Checks if a room is encrypted.
     * @param {string} roomId The room ID to check.
     * @returns {Promise<boolean>} Resolves to true if encrypted, false otherwise.
     */
    @requiresReady()
    public async isRoomEncrypted(roomId: string): Promise<boolean> {
        const config = await this.roomTracker.getRoomCryptoConfig(roomId);
        return !!config?.algorithm;
    }

    /**
     * Updates the client's sync-related data.
     * @param {IToDeviceMessage<IOlmEncrypted>} toDeviceMessages The to-device messages received.
     * @param {OTKCounts} otkCounts The current OTK counts.
     * @param {OTKAlgorithm[]} unusedFallbackKeyAlgs The unused fallback key algorithms.
     * @param {string[]} changedDeviceLists The user IDs which had device list changes.
     * @param {string[]} leftDeviceLists The user IDs which the server believes we no longer need to track.
     * @returns {Promise<void>} Resolves when complete.
     */
    @requiresReady()
    public async updateSyncData(toDeviceMessages: IToDeviceMessage<IOlmEncrypted>[], otkCounts: OTKCounts, unusedFallbackKeyAlgs: OTKAlgorithm[], changedDeviceLists: string[], leftDeviceLists: string[]): Promise<void> {
        await this.machine.pushSync(toDeviceMessages, {changed: changedDeviceLists, left: leftDeviceLists}, otkCounts, unusedFallbackKeyAlgs);
    }

    /**
     * Signs an object using the device keys.
     * @param {object} obj The object to sign.
     * @returns {Promise<Signatures>} The signatures for the object.
     */
    @requiresReady()
    public async sign(obj: object): Promise<Signatures> {
        obj = JSON.parse(JSON.stringify(obj));
        const existingSignatures = obj['signatures'] || {};

        delete obj['signatures'];
        delete obj['unsigned'];

        const sig = await this.machine.sign(obj);
        return {
            ...sig,
            ...existingSignatures,
        };
    }

    /**
     * Verifies a signature on an object.
     * @param {object} obj The signed object.
     * @param {string} key The key which has supposedly signed the object.
     * @param {string} signature The advertised signature.
     * @returns {Promise<boolean>} Resolves to true if a valid signature, false otherwise.
     */
    @requiresReady()
    public async verifySignature(obj: object, key: string, signature: string): Promise<boolean> {
        obj = JSON.parse(JSON.stringify(obj));

        delete obj['signatures'];
        delete obj['unsigned'];

        const util = new Olm.Utility();
        try {
            const message = anotherJson.stringify(obj);
            util.ed25519_verify(key, message, signature);
        } catch (e) {
            // Assume it's a verification failure
            return false;
        } finally {
            util.free();
        }

        return true;
    }

    /**
     * Encrypts the details of a room event, returning an encrypted payload to be sent in an
     * `m.room.encrypted` event to the room. If needed, this function will send decryption keys
     * to the appropriate devices in the room (this happens when the Megolm session rotates or
     * gets created).
     * @param {string} roomId The room ID to encrypt within. If the room is not encrypted, an
     * error is thrown.
     * @param {string} eventType The event type being encrypted.
     * @param {any} content The event content being encrypted.
     * @returns {Promise<IMegolmEncrypted>} Resolves to the encrypted content for an `m.room.encrypted` event.
     */
    @requiresReady()
    public async encryptRoomEvent(roomId: string, eventType: string, content: any): Promise<IMegolmEncrypted> {
        if (!(await this.isRoomEncrypted(roomId))) {
            throw new Error("Room is not encrypted");
        }

        let relatesTo: any;
        if (content['m.relates_to']) {
            relatesTo = JSON.parse(JSON.stringify(content['m.relates_to']));
            delete content['m.relates_to'];
        }

        const encrypted = await this.machine.encryptRoomEvent(roomId, eventType, content);
        return encrypted as IMegolmEncrypted;
    }

    /**
     * Decrypts a room event. Currently only supports Megolm-encrypted events (default for this SDK).
     * @param {EncryptedRoomEvent} event The encrypted event.
     * @param {string} roomId The room ID where the event was sent.
     * @returns {Promise<RoomEvent<unknown>>} Resolves to a decrypted room event, or rejects/throws with
     * an error if the event is undecryptable.
     */
    @requiresReady()
    public async decryptRoomEvent(event: EncryptedRoomEvent, roomId: string): Promise<RoomEvent<unknown>> {
        const decrypted = await this.machine.decryptRoomEvent(roomId, event.raw);

        return new RoomEvent<unknown>({
            ...event.raw,
            type: decrypted.clearEvent.type || "io.t2bot.unknown",
            content: (typeof(decrypted.clearEvent.content) === 'object') ? decrypted.clearEvent.content : {},
        });
    }

    /**
     * Encrypts a file for uploading in a room, returning the encrypted data and information
     * to include in a message event (except media URL) for sending.
     * @param {Buffer} file The file to encrypt.
     * @returns {{buffer: Buffer, file: Omit<EncryptedFile, "url">}} Resolves to the encrypted
     * contents and file information.
     */
    @requiresReady()
    public async encryptMedia(file: Buffer): Promise<{buffer: Buffer, file: Omit<EncryptedFile, "url">}> {
        const key = crypto.randomBytes(32);
        const iv = new Uint8Array(16);
        crypto.randomBytes(8).forEach((v, i) => iv[i] = v); // only fill high side to avoid 64bit overflow

        const cipher = crypto.createCipheriv("aes-256-ctr", key, iv);

        const buffers: Buffer[] = [];
        cipher.on('data', b => {
            buffers.push(b);
        });

        const stream = new PassThrough();
        stream.pipe(cipher);
        stream.end(file);

        const finishPromise = new Promise<Buffer>(resolve => {
            cipher.end(() => {
                resolve(Buffer.concat(buffers));
            });
        });

        const cipheredContent = await finishPromise;

        let sha256: string;
        const util = new Olm.Utility();
        try {
            const arr = new Uint8Array(cipheredContent);
            sha256 = util.sha256(arr);
        } finally {
            util.free();
        }

        return {
            buffer: Buffer.from(cipheredContent),
            file: {
                hashes: {
                    sha256: sha256,
                },
                key: {
                    alg: "A256CTR",
                    ext: true,
                    key_ops: ['encrypt', 'decrypt'],
                    kty: "oct",
                    k: encodeUnpaddedUrlSafeBase64(key),
                },
                iv: encodeUnpaddedBase64(iv),
                v: 'v2',
            },
        };
    }

    /**
     * Decrypts a previously-uploaded encrypted file, validating the fields along the way.
     * @param {EncryptedFile} file The file to decrypt.
     * @returns {Promise<Buffer>} Resolves to the decrypted file contents.
     */
    public async decryptMedia(file: EncryptedFile): Promise<Buffer> {
        if (file.v !== "v2") {
            throw new Error("Unknown encrypted file version");
        }
        if (file.key?.kty !== "oct" || file.key?.alg !== "A256CTR" || file.key?.ext !== true) {
            throw new Error("Improper JWT: Missing or invalid fields");
        }
        if (!file.key.key_ops.includes("encrypt") || !file.key.key_ops.includes("decrypt")) {
            throw new Error("Missing required key_ops");
        }
        if (!file.hashes?.sha256) {
            throw new Error("Missing SHA256 hash");
        }

        const key = decodeUnpaddedUrlSafeBase64(file.key.k);
        const iv = decodeUnpaddedBase64(file.iv);
        const ciphered = (await this.client.downloadContent(file.url)).data;

        let sha256: string;
        const util = new Olm.Utility();
        try {
            const arr = new Uint8Array(ciphered);
            sha256 = util.sha256(arr);
        } finally {
            util.free();
        }

        if (sha256 !== file.hashes.sha256) {
            throw new Error("SHA256 mismatch");
        }

        const decipher = crypto.createDecipheriv("aes-256-ctr", key, iv);

        const buffers: Buffer[] = [];
        decipher.on('data', b => {
            buffers.push(b);
        });

        const stream = new PassThrough();
        stream.pipe(decipher);
        stream.end(ciphered);

        return new Promise<Buffer>(resolve => {
            decipher.end(() => {
                resolve(Buffer.concat(buffers));
            });
        });
    }
}

import { MatrixClient } from "../MatrixClient";
import { LogService } from "../logging/LogService";
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
    decryptFile as rustDecryptFile,
    encryptFile as rustEncryptFile,
    OlmMachine,
} from "@turt2live/matrix-sdk-crypto-nodejs";
import { RustSdkCryptoStorageProvider } from "../storage/RustSdkCryptoStorageProvider";
import { SdkOlmEngine } from "./SdkOlmEngine";
import { InternalOlmMachineFactory } from "./InternalOlmMachineFactory";

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

        this.machine = new InternalOlmMachineFactory(await this.client.getUserId(), this.deviceId, new SdkOlmEngine(this.client), this.storage.storagePath).build();
        await this.machine.runEngine();

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
        const encrypted = rustEncryptFile(file);
        return {
            buffer: encrypted.data,
            file: {
                iv: encrypted.file.iv,
                key: encrypted.file.web_key,
                v: encrypted.file.v,
                hashes: encrypted.file.hashes as {sha256: string},
            },
        };
    }

    /**
     * Decrypts a previously-uploaded encrypted file, validating the fields along the way.
     * @param {EncryptedFile} file The file to decrypt.
     * @returns {Promise<Buffer>} Resolves to the decrypted file contents.
     */
    @requiresReady()
    public async decryptMedia(file: EncryptedFile): Promise<Buffer> {
        return rustDecryptFile((await this.client.downloadContent(file.url)).data, {
            ...file,
            web_key: file.key as any, // we know it is compatible
        });
    }
}

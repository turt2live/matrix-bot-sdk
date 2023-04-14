import {
    DeviceId,
    OlmMachine,
    UserId,
    DeviceLists,
    RoomId,
    Attachment,
    EncryptedAttachment,
} from "@matrix-org/matrix-sdk-crypto-nodejs";

import { MatrixClient } from "../MatrixClient";
import { LogService } from "../logging/LogService";
import {
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
import { RustSdkCryptoStorageProvider } from "../storage/RustSdkCryptoStorageProvider";
import { RustEngine, SYNC_LOCK_NAME } from "./RustEngine";
import { MembershipEvent } from "../models/events/MembershipEvent";

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
    private engine: RustEngine;

    public constructor(private client: MatrixClient) {
        this.roomTracker = new RoomTracker(this.client);
    }

    private get storage(): RustSdkCryptoStorageProvider {
        return <RustSdkCryptoStorageProvider> this.client.cryptoStore;
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

        const machine = await OlmMachine.initialize(
            new UserId(await this.client.getUserId()),
            new DeviceId(this.deviceId),
            this.storage.storagePath, "",
            this.storage.storageType,
        );
        this.engine = new RustEngine(machine, this.client);
        await this.engine.run();

        const identity = this.engine.machine.identityKeys;
        this.deviceCurve25519 = identity.curve25519.toBase64();
        this.deviceEd25519 = identity.ed25519.toBase64();

        this.ready = true;
    }

    /**
     * Handles a room event.
     * @internal
     * @param roomId The room ID.
     * @param event The event.
     */
    public async onRoomEvent(roomId: string, event: any) {
        await this.roomTracker.onRoomEvent(roomId, event);
        if (typeof event['state_key'] !== 'string') return;
        if (event['type'] === 'm.room.member') {
            const membership = new MembershipEvent(event);
            if (membership.effectiveMembership !== 'join' && membership.effectiveMembership !== 'invite') return;
            await this.engine.addTrackedUsers([membership.membershipFor]);
        } else if (event['type'] === 'm.room.encryption') {
            const members = await this.client.getRoomMembers(roomId, null, ['join', 'invite']);
            await this.engine.addTrackedUsers(members.map(e => e.membershipFor));
        }
    }

    /**
     * Handles a room join.
     * @internal
     * @param roomId The room ID.
     */
    public async onRoomJoin(roomId: string) {
        await this.roomTracker.onRoomJoin(roomId);
        if (await this.isRoomEncrypted(roomId)) {
            const members = await this.client.getRoomMembers(roomId, null, ['join', 'invite']);
            await this.engine.addTrackedUsers(members.map(e => e.membershipFor));
        }
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
     * @param {Array.<IToDeviceMessage<IOlmEncrypted>>} toDeviceMessages The to-device messages received.
     * @param {OTKCounts} otkCounts The current OTK counts.
     * @param {OTKAlgorithm[]} unusedFallbackKeyAlgs The unused fallback key algorithms.
     * @param {string[]} changedDeviceLists The user IDs which had device list changes.
     * @param {string[]} leftDeviceLists The user IDs which the server believes we no longer need to track.
     * @returns {Promise<void>} Resolves when complete.
     */
    @requiresReady()
    public async updateSyncData(
        toDeviceMessages: IToDeviceMessage<IOlmEncrypted>[],
        otkCounts: OTKCounts,
        unusedFallbackKeyAlgs: OTKAlgorithm[],
        changedDeviceLists: string[],
        leftDeviceLists: string[],
    ): Promise<void> {
        const deviceMessages = JSON.stringify(toDeviceMessages);
        const deviceLists = new DeviceLists(
            changedDeviceLists.map(u => new UserId(u)),
            leftDeviceLists.map(u => new UserId(u)));

        await this.engine.lock.acquire(SYNC_LOCK_NAME, async () => {
            const syncResp = await this.engine.machine.receiveSyncChanges(deviceMessages, deviceLists, otkCounts, unusedFallbackKeyAlgs);
            const decryptedToDeviceMessages = JSON.parse(syncResp);
            if (Array.isArray(decryptedToDeviceMessages)) {
                for (const msg of decryptedToDeviceMessages) {
                    this.client.emit("to_device.decrypted", msg);
                }
            }

            await this.engine.run();
        });
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

        const container = await this.engine.machine.sign(JSON.stringify(obj));
        const userSignature = container.get(new UserId(await this.client.getUserId()));
        const sig: Signatures = {
            [await this.client.getUserId()]: {},
        };
        for (const [key, maybeSignature] of Object.entries(userSignature)) {
            if (maybeSignature.isValid) {
                sig[await this.client.getUserId()][key] = maybeSignature.signature.toBase64();
            }
        }
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

        await this.engine.prepareEncrypt(roomId, await this.roomTracker.getRoomCryptoConfig(roomId));

        const encrypted = JSON.parse(await this.engine.machine.encryptRoomEvent(new RoomId(roomId), eventType, JSON.stringify(content)));
        await this.engine.run();
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
        const decrypted = await this.engine.machine.decryptRoomEvent(JSON.stringify(event.raw), new RoomId(roomId));
        const clearEvent = JSON.parse(decrypted.event);

        return new RoomEvent<unknown>({
            ...event.raw,
            type: clearEvent.type || "io.t2bot.unknown",
            content: (typeof (clearEvent.content) === 'object') ? clearEvent.content : {},
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
    public async encryptMedia(file: Buffer): Promise<{ buffer: Buffer, file: Omit<EncryptedFile, "url"> }> {
        const encrypted = Attachment.encrypt(file);
        const info = JSON.parse(encrypted.mediaEncryptionInfo);
        return {
            buffer: Buffer.from(encrypted.encryptedData),
            file: info,
        };
    }

    /**
     * Decrypts a previously-uploaded encrypted file, validating the fields along the way.
     * @param {EncryptedFile} file The file to decrypt.
     * @returns {Promise<Buffer>} Resolves to the decrypted file contents.
     */
    @requiresReady()
    public async decryptMedia(file: EncryptedFile): Promise<Buffer> {
        const contents = (await this.client.downloadContent(file.url)).data;
        const encrypted = new EncryptedAttachment(
            contents,
            JSON.stringify(file),
        );
        const decrypted = Attachment.decrypt(encrypted);
        return Buffer.from(decrypted);
    }
}

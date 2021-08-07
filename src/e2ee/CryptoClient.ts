import { MatrixClient } from "../MatrixClient";
import { LogService } from "../logging/LogService";
import * as Olm from "@matrix-org/olm";
import * as crypto from "crypto";
import * as anotherJson from "another-json";
import {
    DeviceKeyAlgorithm,
    EncryptionAlgorithm,
    IOlmEncrypted,
    IOlmPayload,
    IOlmSession,
    OTKAlgorithm,
    OTKCounts,
    OTKs,
    Signatures,
    UserDevice,
} from "../models/Crypto";
import { requiresReady } from "./decorators";
import { RoomTracker } from "./RoomTracker";
import { DeviceTracker } from "./DeviceTracker";
import { EncryptionEvent } from "../models/events/EncryptionEvent";

/**
 * Manages encryption for a MatrixClient. Get an instance from a MatrixClient directly
 * rather than creating one manually.
 * @category Encryption
 */
export class CryptoClient {
    private ready = false;
    private deviceId: string;
    private pickleKey: string;
    private pickledAccount: string;
    private deviceEd25519: string;
    private deviceCurve25519: string;
    private maxOTKs: number;
    private roomTracker: RoomTracker;
    private deviceTracker: DeviceTracker;

    public constructor(private client: MatrixClient) {
        this.roomTracker = new RoomTracker(this.client);
        this.deviceTracker = new DeviceTracker(this.client);
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

    private async getOlmAccount(): Promise<Olm.Account> {
        const account = new Olm.Account();
        account.unpickle(this.pickleKey, this.pickledAccount);
        return account;
    }

    private async storeAndFreeOlmAccount(account: Olm.Account) {
        const pickled = account.pickle(this.pickleKey);
        await this.client.cryptoStore.setPickledAccount(pickled);
        account.free();
    }

    /**
     * Prepares the crypto client for usage.
     * @param {string[]} roomIds The room IDs the MatrixClient is joined to.
     */
    public async prepare(roomIds: string[]) {
        await this.roomTracker.prepare(roomIds);

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

        // We should be in a ready enough shape to kick off Olm
        await Olm.init();

        let pickled = await this.client.cryptoStore.getPickledAccount();
        let pickleKey = await this.client.cryptoStore.getPickleKey();

        const account = new Olm.Account();
        try {
            if (!pickled || !pickleKey) {
                LogService.debug("CryptoClient", "Creating new Olm account: previous session lost or not set up");

                account.create();
                pickleKey = crypto.randomBytes(64).toString('hex');
                pickled = account.pickle(pickleKey);
                await this.client.cryptoStore.setPickleKey(pickleKey);
                await this.client.cryptoStore.setPickledAccount(pickled);

                this.pickleKey = pickleKey;
                this.pickledAccount = pickled;

                this.maxOTKs = account.max_number_of_one_time_keys();

                const keys = JSON.parse(account.identity_keys());
                this.deviceCurve25519 = keys['curve25519'];
                this.deviceEd25519 = keys['ed25519'];

                this.ready = true;

                const counts = await this.client.uploadDeviceKeys([
                    EncryptionAlgorithm.MegolmV1AesSha2,
                    EncryptionAlgorithm.OlmV1Curve25519AesSha2,
                ], {
                    [`${DeviceKeyAlgorithm.Ed25119}:${this.deviceId}`]: this.deviceEd25519,
                    [`${DeviceKeyAlgorithm.Curve25519}:${this.deviceId}`]: this.deviceCurve25519,
                });
                await this.updateCounts(counts);
            } else {
                account.unpickle(pickleKey, pickled);
                this.pickleKey = pickleKey;
                this.pickledAccount = pickled;
                this.maxOTKs = account.max_number_of_one_time_keys();

                const keys = JSON.parse(account.identity_keys());
                this.deviceCurve25519 = keys['curve25519'];
                this.deviceEd25519 = keys['ed25519'];

                this.ready = true;
                await this.updateCounts(await this.client.checkOneTimeKeyCounts());
            }
        } finally {
            account.free();
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
     * Updates the One Time Key counts, potentially triggering an async upload of more
     * one time keys.
     * @param {OTKCounts} counts The current counts to work within.
     * @returns {Promise<void>} Resolves when complete.
     */
    @requiresReady()
    public async updateCounts(counts: OTKCounts) {
        const have = counts[OTKAlgorithm.Signed] || 0;
        const need = Math.floor(this.maxOTKs / 2) - have;
        if (need <= 0) return;

        LogService.debug("CryptoClient", `Creating ${need} more OTKs`);

        const account = await this.getOlmAccount();
        try {
            account.generate_one_time_keys(need);
            const { curve25519: keys } = JSON.parse(account.one_time_keys());
            const signed: OTKs = {};
            for (const keyId in keys) {
                if (!keys.hasOwnProperty(keyId)) continue;
                const obj = {key: keys[keyId]};
                obj['signatures'] = await this.sign(obj);
                signed[`${OTKAlgorithm.Signed}:${keyId}`] = obj;
            }
            await this.client.uploadDeviceOneTimeKeys(signed);
            account.mark_keys_as_published();
        } finally {
            await this.storeAndFreeOlmAccount(account);
        }
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

        const account = await this.getOlmAccount();
        try {
            const sig = account.sign(anotherJson.stringify(obj));
            return {
                ...existingSignatures,
                [await this.client.getUserId()]: {
                    [`${DeviceKeyAlgorithm.Ed25119}:${this.deviceId}`]: sig,
                },
            };
        } finally {
            account.free();
        }
    }

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
     * Flags multiple user's device lists as outdated, optionally queuing an immediate update.
     * @param {string} userIds The user IDs to flag the device lists of.
     * @param {boolean} resync True (default) to queue an immediate update, false otherwise.
     */
    public flagUsersDeviceListsOutdated(userIds: string[], resync = true) {
        // noinspection JSIgnoredPromiseFromCall
        this.deviceTracker.flagUsersOutdated(userIds, resync);
    }

    /**
     * Gets or creates Olm sessions for the given users and devices. Where sessions cannot be created,
     * the user/device will be excluded from the returned map.
     * @param {Record<string, string[]>} userDeviceMap Map of user IDs to device IDs
     * @returns {Promise<Record<string, Record<string, IOlmSession>>>} Resolves to a map of user ID to device
     * ID to session. Users/devices which cannot have sessions made will not be included, thus the object
     * may be empty.
     */
    public async getOrCreateOlmSessions(userDeviceMap: Record<string, string[]>): Promise<Record<string, Record<string, IOlmSession>>> {
        const otkClaimRequest: Record<string, Record<string, OTKAlgorithm>> = {};
        const userDeviceSessionIds: Record<string, Record<string, IOlmSession>> = {};

        const myUserId = await this.client.getUserId();
        const myDeviceId = this.clientDeviceId;
        for (const userId of Object.keys(userDeviceMap)) {
            for (const deviceId of userDeviceMap[userId]) {
                if (userId === myUserId && deviceId === myDeviceId) {
                    // Skip creating a session for our own device
                    continue;
                }

                const existingSession = await this.client.cryptoStore.getCurrentOlmSession(userId, deviceId);
                if (existingSession) {
                    if (!userDeviceSessionIds[userId]) userDeviceSessionIds[userId] = {};
                    userDeviceSessionIds[userId][deviceId] = existingSession;
                } else {
                    if (!otkClaimRequest[userId]) otkClaimRequest[userId] = {};
                    otkClaimRequest[userId][deviceId] = OTKAlgorithm.Signed;
                }
            }
        }

        const claimed = await this.client.claimOneTimeKeys(otkClaimRequest);
        for (const userId of Object.keys(claimed.one_time_keys)) {
            const storedDevices = await this.client.cryptoStore.getUserDevices(userId);
            for (const deviceId of Object.keys(claimed.one_time_keys[userId])) {
                try {
                    const device = storedDevices.find(d => d.user_id === userId && d.device_id === deviceId);
                    if (!device) {
                        LogService.warn("CryptoClient", `Failed to handle claimed OTK: unable to locate stored device for user: ${userId} ${deviceId}`);
                        continue;
                    }

                    const deviceKeyLabel = `${DeviceKeyAlgorithm.Ed25119}:${deviceId}`;

                    const keyId = Object.keys(claimed.one_time_keys[userId][deviceId])[0];
                    const signedKey = claimed.one_time_keys[userId][deviceId][keyId];
                    const signature = signedKey?.signatures?.[userId]?.[deviceKeyLabel];
                    if (!signature) {
                        LogService.warn("CryptoClient", `Failed to find appropriate signature for claimed OTK ${userId} ${deviceId}`);
                        continue;
                    }

                    const verified = await this.verifySignature(signedKey, device.keys[deviceKeyLabel], signature);
                    if (!verified) {
                        LogService.warn("CryptoClient", `Invalid signature for claimed OTK ${userId} ${deviceId}`);
                        continue;
                    }

                    // TODO: Handle spec rate limiting
                    // Clients should rate-limit the number of sessions it creates per device that it receives a message
                    // from. Clients should not create a new session with another device if it has already created one
                    // for that given device in the past 1 hour.

                    // Finally, we can create a session. We do this on each loop just in case something goes wrong given
                    // we don't have app-level transaction support here. We want to persist as many outbound sessions as
                    // we can before exploding.
                    const account = await this.getOlmAccount();
                    const session = new Olm.Session();
                    try {
                        const curveDeviceKey = device.keys[`${DeviceKeyAlgorithm.Curve25519}:${deviceId}`];
                        session.create_outbound(account, curveDeviceKey, signedKey.key);
                        const storedSession: IOlmSession = {
                            sessionId: session.session_id(),
                            lastDecryptionTs: Date.now(),
                            pickled: session.pickle(this.pickleKey),
                        };
                        await this.client.cryptoStore.storeOlmSession(userId, deviceId, storedSession);

                        if (!userDeviceSessionIds[userId]) userDeviceSessionIds[userId] = {};
                        userDeviceSessionIds[userId][deviceId] = storedSession;

                        // Send a dummy event so the device can prepare the session.
                        // await this.encryptAndSendOlmMessage(device, storedSession, "m.dummy", {});
                    } finally {
                        session.free();
                        await this.storeAndFreeOlmAccount(account);
                    }
                } catch (e) {
                    LogService.warn("CryptoClient", `Unable to verify signature of claimed OTK ${userId} ${deviceId}:`, e);
                }
            }
        }

        return userDeviceSessionIds;
    }

    private async encryptAndSendOlmMessage(device: UserDevice, session: IOlmSession, type: string, content: any): Promise<void> {
        const olmSession = new Olm.Session();
        try {
            olmSession.unpickle(this.pickleKey, session.pickled);
            const payload: IOlmPayload = {
                keys: {
                    ed25519: this.deviceEd25519,
                },
                recipient_keys: {
                    ed25519: device.keys[`${DeviceKeyAlgorithm.Ed25119}:${device.device_id}`],
                },
                recipient: device.user_id,
                sender: await this.client.getUserId(),
                content: content,
                type: type,
            };
            const encrypted = olmSession.encrypt(JSON.stringify(payload));
            await this.client.cryptoStore.storeOlmSession(device.user_id, device.device_id, {
                pickled: olmSession.pickle(this.pickleKey),
                lastDecryptionTs: session.lastDecryptionTs,
                sessionId: olmSession.session_id(),
            });
            const message: IOlmEncrypted = {
                algorithm: EncryptionAlgorithm.OlmV1Curve25519AesSha2,
                ciphertext: {
                    [device.keys[`${DeviceKeyAlgorithm.Curve25519}:${device.device_id}`]]: encrypted as any,
                },
                sender_key: this.deviceCurve25519,
            };
            await this.client.sendToDevices("m.room.encrypted", {
                [device.user_id]: {
                    [device.device_id]: message,
                },
            });
        } finally {
            olmSession.free();
        }
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
     * @returns {Promise<any>} Resolves to the encrypted content for an `m.room.encrypted` event.
     */
    public async encryptRoomEvent(roomId: string, eventType: string, content: any): Promise<any> {
        if (!(await this.isRoomEncrypted(roomId))) {
            throw new Error("Room is not encrypted");
        }

        const now = (new Date()).getTime();

        let currentSession = await this.client.cryptoStore.getCurrentOutboundGroupSession(roomId);
        if (currentSession && (currentSession.expiresTs <= now || currentSession.usesLeft <= 0)) {
            currentSession = null; // force rotation
        }
        if (!currentSession) {
            // Make a new session, either because we don't have one or it rotated.
            const roomConfig = new EncryptionEvent({
                type: "m.room.encryption",
                state_key: "",
                content: await this.roomTracker.getRoomCryptoConfig(roomId),
            });

            const session = new Olm.OutboundGroupSession();
            try {
                session.create();
                const pickled = session.pickle(this.pickleKey);
                currentSession = {
                    sessionId: session.session_id(),
                    roomId: roomId,
                    pickled: pickled,
                    isCurrent: true,
                    usesLeft: roomConfig.rotationPeriodMessages,
                    expiresTs: now + roomConfig.rotationPeriodMs,
                };
                await this.client.cryptoStore.storeOutboundGroupSession(currentSession);
                // TODO: Store as inbound session too

            } finally {
                session.free();
            }
        }

        // TODO: Include invited members?
        const memberUserIds = await this.client.getJoinedRoomMembers(roomId);
        const devices = await this.deviceTracker.getDevicesFor(memberUserIds);

        const session = new Olm.OutboundGroupSession();
        try {
            session.unpickle(this.pickleKey, currentSession.pickled);

            const neededSessions: Record<string, string[]> = {};
            for (const userId of Object.keys(devices)) {
                neededSessions[userId] = devices[userId].map(d => d.device_id);
            }
            const olmSessions = await this.getOrCreateOlmSessions(neededSessions);

            for (const userId of Object.keys(devices)) {
                for (const device of devices[userId]) {
                    const olmSession = olmSessions[userId]?.[device.device_id];
                    if (!olmSession) {
                        LogService.warn("CryptoClient", `Unable to send Megolm session to ${userId} ${device.device_id}: No Olm session`);
                        continue;
                    }
                    await this.encryptAndSendOlmMessage(device, olmSession, "m.room_key", {
                        algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                        room_id: roomId,
                        session_id: session.session_id(),
                        session_key: session.session_key(),
                    });
                }
            }

            const encrypted = session.encrypt(JSON.stringify({
                type: eventType,
                content: content,
                room_id: roomId,
            }));

            return {
                algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                sender_key: this.deviceCurve25519,
                ciphertext: encrypted,
                session_id: session.session_id(),
                device_id: this.clientDeviceId,
            };
        } finally {
            session.free();
        }


    }
}

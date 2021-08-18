import { MatrixClient } from "../MatrixClient";
import { LogService } from "../logging/LogService";
import * as Olm from "@matrix-org/olm";
import * as crypto from "crypto";
import * as anotherJson from "another-json";
import {
    DeviceKeyAlgorithm,
    EncryptionAlgorithm,
    FallbackKey,
    IMegolmEncrypted,
    IMRoomKey,
    IOlmEncrypted,
    IOlmPayload,
    IOlmSession,
    IToDeviceMessage,
    OTKAlgorithm,
    OTKCounts,
    OTKs,
    Signatures,
    SignedCurve25519OTK,
    UserDevice,
} from "../models/Crypto";
import { requiresReady } from "./decorators";
import { RoomTracker } from "./RoomTracker";
import { DeviceTracker } from "./DeviceTracker";
import { EncryptionEvent } from "../models/events/EncryptionEvent";
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

/**
 * Manages encryption for a MatrixClient. Get an instance from a MatrixClient directly
 * rather than creating one manually.
 * @category Encryption
 */
export class CryptoClient {
    private ready = false;
    private deviceId: string;
    private pickleKey: string;
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
        account.unpickle(this.pickleKey, await this.client.cryptoStore.getPickledAccount());
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

        const makeReady = () => {
            const keys = JSON.parse(account.identity_keys());
            this.deviceCurve25519 = keys['curve25519'];
            this.deviceEd25519 = keys['ed25519'];

            this.pickleKey = pickleKey;
            this.maxOTKs = account.max_number_of_one_time_keys();
            this.ready = true;
        };

        try {
            if (!pickled || !pickleKey) {
                LogService.debug("CryptoClient", "Creating new Olm account: previous session lost or not set up");

                account.create();
                pickleKey = crypto.randomBytes(64).toString('hex');
                pickled = account.pickle(pickleKey);
                await this.client.cryptoStore.setPickleKey(pickleKey);
                await this.client.cryptoStore.setPickledAccount(pickled);

                makeReady();

                const counts = await this.client.uploadDeviceKeys([
                    EncryptionAlgorithm.MegolmV1AesSha2,
                    EncryptionAlgorithm.OlmV1Curve25519AesSha2,
                ], {
                    [`${DeviceKeyAlgorithm.Ed25519}:${this.deviceId}`]: this.deviceEd25519,
                    [`${DeviceKeyAlgorithm.Curve25519}:${this.deviceId}`]: this.deviceCurve25519,
                });
                await this.updateCounts(counts);
            } else {
                account.unpickle(pickleKey, pickled);
                makeReady();
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
     * Updates the client's fallback key.
     * @returns {Promise<void>} Resolves when complete.
     */
    @requiresReady()
    public async updateFallbackKey(): Promise<void> {
        const account = await this.getOlmAccount();
        try {
            account.generate_fallback_key();

            const key = JSON.parse(account.fallback_key());
            const keyId = Object.keys(key[OTKAlgorithm.Unsigned])[0];
            const obj: Partial<SignedCurve25519OTK> = {
                key: key[OTKAlgorithm.Unsigned][keyId],
                fallback: true,
            };
            const signatures = await this.sign(obj);
            const fallback: FallbackKey = {
                keyId: keyId,
                key: {
                    ...obj,
                    signatures: signatures,
                } as SignedCurve25519OTK & {fallback: true},
            };
            await this.client.uploadFallbackKey(fallback);
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
                [await this.client.getUserId()]: {
                    [`${DeviceKeyAlgorithm.Ed25519}:${this.deviceId}`]: sig,
                },
                ...existingSignatures,
            };
        } finally {
            account.free();
        }
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
     * Flags multiple user's device lists as outdated, optionally queuing an immediate update.
     * @param {string} userIds The user IDs to flag the device lists of.
     * @param {boolean} resync True (default) to queue an immediate update, false otherwise.
     * @returns {Promise<void>} Resolves when the device lists have been flagged. Will also wait
     * for the resync if one was requested.
     */
    @requiresReady()
    public flagUsersDeviceListsOutdated(userIds: string[], resync = true): Promise<void> {
        return this.deviceTracker.flagUsersOutdated(userIds, resync);
    }

    /**
     * Gets or creates Olm sessions for the given users and devices. Where sessions cannot be created,
     * the user/device will be excluded from the returned map.
     * @param {Record<string, string[]>} userDeviceMap Map of user IDs to device IDs
     * @param {boolean} force If true, force creation of a session for the referenced users.
     * @returns {Promise<Record<string, Record<string, IOlmSession>>>} Resolves to a map of user ID to device
     * ID to session. Users/devices which cannot have sessions made will not be included, thus the object
     * may be empty.
     */
    @requiresReady()
    public async getOrCreateOlmSessions(userDeviceMap: Record<string, string[]>, force = false): Promise<Record<string, Record<string, IOlmSession>>> {
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

                const existingSession = force ? null : (await this.client.cryptoStore.getCurrentOlmSession(userId, deviceId));
                if (existingSession) {
                    if (!userDeviceSessionIds[userId]) userDeviceSessionIds[userId] = {};
                    userDeviceSessionIds[userId][deviceId] = existingSession;
                } else {
                    if (!otkClaimRequest[userId]) otkClaimRequest[userId] = {};
                    otkClaimRequest[userId][deviceId] = OTKAlgorithm.Signed;
                }
            }
        }

        if (Object.keys(otkClaimRequest).length > 0) {
            const claimed = await this.client.claimOneTimeKeys(otkClaimRequest);
            for (const userId of Object.keys(claimed.one_time_keys)) {
                if (!otkClaimRequest[userId]) {
                    LogService.warn("CryptoClient", `Server injected unexpected user: ${userId} - not claiming keys`);
                    continue;
                }
                const storedDevices = await this.client.cryptoStore.getActiveUserDevices(userId);
                for (const deviceId of Object.keys(claimed.one_time_keys[userId])) {
                    try {
                        if (!otkClaimRequest[userId][deviceId]) {
                            LogService.warn("CryptoClient", `Server provided an unexpected device in claim response (skipping): ${userId} ${deviceId}`);
                            continue;
                        }

                        const device = storedDevices.find(d => d.user_id === userId && d.device_id === deviceId);
                        if (!device) {
                            LogService.warn("CryptoClient", `Failed to handle claimed OTK: unable to locate stored device for user: ${userId} ${deviceId}`);
                            continue;
                        }

                        const deviceKeyLabel = `${DeviceKeyAlgorithm.Ed25519}:${deviceId}`;

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
                        } finally {
                            session.free();
                            await this.storeAndFreeOlmAccount(account);
                        }
                    } catch (e) {
                        LogService.warn("CryptoClient", `Unable to verify signature of claimed OTK ${userId} ${deviceId}:`, e);
                    }
                }
            }
        }

        return userDeviceSessionIds;
    }

    @requiresReady()
    private async encryptAndSendOlmMessage(device: UserDevice, session: IOlmSession, type: string, content: any): Promise<void> {
        const olmSession = new Olm.Session();
        try {
            olmSession.unpickle(this.pickleKey, session.pickled);
            const payload: IOlmPayload = {
                keys: {
                    ed25519: this.deviceEd25519,
                },
                recipient_keys: {
                    ed25519: device.keys[`${DeviceKeyAlgorithm.Ed25519}:${device.device_id}`],
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

            const newSession = new Olm.OutboundGroupSession();
            try {
                newSession.create();
                const pickled = newSession.pickle(this.pickleKey);
                currentSession = {
                    sessionId: newSession.session_id(),
                    roomId: roomId,
                    pickled: pickled,
                    isCurrent: true,
                    usesLeft: roomConfig.rotationPeriodMessages,
                    expiresTs: now + roomConfig.rotationPeriodMs,
                };

                // Store the session as an inbound session up front. This is to ensure that we have the
                // earliest possible ratchet available to our own decryption functions. We don't store
                // the outbound session here as it is stored earlier on.
                await this.storeInboundGroupSession({
                    room_id: roomId,
                    session_id: newSession.session_id(),
                    session_key: newSession.session_key(),
                    algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                }, await this.client.getUserId(), this.clientDeviceId);
            } finally {
                newSession.free();
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
                    const lastSession = await this.client.cryptoStore.getLastSentOutboundGroupSession(userId, device.device_id, roomId);
                    if (lastSession?.sessionId !== session.session_id() || session.message_index() < (lastSession?.index ?? Number.MAX_SAFE_INTEGER)) {
                        await this.encryptAndSendOlmMessage(device, olmSession, "m.room_key", <IMRoomKey>{
                            algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
                            room_id: roomId,
                            session_id: session.session_id(),
                            session_key: session.session_key(),
                        });
                        await this.client.cryptoStore.storeSentOutboundGroupSession(currentSession, session.message_index(), device);
                    }
                }
            }

            // Encrypt after to avoid UNKNOWN_MESSAGE_INDEX errors on remote end
            const encrypted = session.encrypt(JSON.stringify({
                type: eventType,
                content: content,
                room_id: roomId,
            }));

            currentSession.pickled = session.pickle(this.pickleKey);
            currentSession.usesLeft--;
            await this.client.cryptoStore.storeOutboundGroupSession(currentSession);

            const body = {
                sender_key: this.deviceCurve25519,
                ciphertext: encrypted,
                session_id: session.session_id(),
                device_id: this.clientDeviceId,
            };
            if (relatesTo) {
                body['m.relates_to'] = relatesTo;
            }
            return {
                ...body,
                algorithm: EncryptionAlgorithm.MegolmV1AesSha2,
            };
        } finally {
            session.free();
        }
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
        if (event.algorithm !== EncryptionAlgorithm.MegolmV1AesSha2) {
            throw new Error("Unable to decrypt: Unknown algorithm");
        }

        const encrypted = event.megolmProperties;
        const senderDevice = await this.client.cryptoStore.getActiveUserDevice(event.sender, encrypted.device_id);
        if (!senderDevice) {
            throw new Error("Unable to decrypt: Unknown device for sender");
        }

        if (senderDevice.keys[`${DeviceKeyAlgorithm.Curve25519}:${senderDevice.device_id}`] !== encrypted.sender_key) {
            throw new Error("Unable to decrypt: Device key mismatch");
        }

        const storedSession = await this.client.cryptoStore.getInboundGroupSession(event.sender, encrypted.device_id, roomId, encrypted.session_id);
        if (!storedSession) {
            throw new Error("Unable to decrypt: Unknown inbound session ID");
        }

        const session = new Olm.InboundGroupSession();
        try {
            session.unpickle(this.pickleKey, storedSession.pickled);
            const cleartext = session.decrypt(encrypted.ciphertext) as { plaintext: string, message_index: number };
            const eventBody = JSON.parse(cleartext.plaintext);
            const messageIndex = cleartext.message_index;

            const existingEventId = await this.client.cryptoStore.getEventForMessageIndex(roomId, storedSession.sessionId, messageIndex);
            if (existingEventId && existingEventId !== event.eventId) {
                throw new Error("Unable to decrypt: Message replay attack");
            }

            await this.client.cryptoStore.setMessageIndexForEvent(roomId, event.eventId, storedSession.sessionId, messageIndex);

            storedSession.pickled = session.pickle(this.pickleKey);
            await this.client.cryptoStore.storeInboundGroupSession(storedSession);

            return new RoomEvent<unknown>({
                ...event.raw,
                type: eventBody.type || "io.t2bot.unknown",
                content: (typeof(eventBody.content) === 'object') ? eventBody.content : {},
            });
        } finally {
            session.free();
        }
    }

    /**
     * Handles an inbound to-device message, decrypting it if needed. This will not throw
     * under normal circumstances and should always resolve successfully.
     * @param {IToDeviceMessage<IOlmEncrypted>} message The message to process.
     * @returns {Promise<void>} Resolves when complete. Should never fail.
     */
    @requiresReady()
    public async processInboundDeviceMessage(message: IToDeviceMessage<IOlmEncrypted>): Promise<void> {
        if (!message?.content || !message?.sender || !message?.type) {
            LogService.warn("CryptoClient", "Received invalid encrypted message");
            return;
        }
        try {
            if (message.type === "m.room.encrypted") {
                if (message.content?.['algorithm'] !== EncryptionAlgorithm.OlmV1Curve25519AesSha2) {
                    LogService.warn("CryptoClient", "Received encrypted message with unknown encryption algorithm");
                    return;
                }

                const myMessage = message.content.ciphertext?.[this.deviceCurve25519];
                if (!myMessage) {
                    LogService.warn("CryptoClient", "Received encrypted message not intended for us (ignoring message)");
                    return;
                }

                if (!Number.isFinite(myMessage.type) || !myMessage.body) {
                    LogService.warn("CryptoClient", "Received invalid encrypted message (ignoring message)");
                    return;
                }

                const userDevices = await this.client.cryptoStore.getActiveUserDevices(message.sender);
                const senderDevice = userDevices.find(d => d.keys[`${DeviceKeyAlgorithm.Curve25519}:${d.device_id}`] === message.content.sender_key);
                if (!senderDevice) {
                    LogService.warn("CryptoClient", "Received encrypted message from unknown identity key (ignoring message):", message.content.sender_key);
                    return;
                }

                const sessions = await this.client.cryptoStore.getOlmSessions(senderDevice.user_id, senderDevice.device_id);
                let trySession: IOlmSession;
                for (const storedSession of sessions) {
                    const checkSession = new Olm.Session();
                    try {
                        checkSession.unpickle(this.pickleKey, storedSession.pickled);
                        if (checkSession.matches_inbound(myMessage.body)) {
                            trySession = storedSession;
                            break;
                        }
                    } finally {
                        checkSession.free();
                    }
                }

                if (myMessage.type === 0 && !trySession) {
                    // Store the session because we can
                    const inboundSession = new Olm.Session();
                    const account = await this.getOlmAccount();
                    try {
                        inboundSession.create_inbound_from(account, message.content.sender_key, myMessage.body);
                        account.remove_one_time_keys(inboundSession);
                        trySession = {
                            pickled: inboundSession.pickle(this.pickleKey),
                            sessionId: inboundSession.session_id(),
                            lastDecryptionTs: Date.now(),
                        };
                        await this.client.cryptoStore.storeOlmSession(senderDevice.user_id, senderDevice.device_id, trySession);
                    } finally {
                        inboundSession.free();
                        await this.storeAndFreeOlmAccount(account);
                    }
                }

                if (myMessage.type !== 0 && !trySession) {
                    LogService.warn("CryptoClient", "Unable to find suitable session for encrypted to-device message; Establishing new session");
                    await this.establishNewOlmSession(senderDevice);
                    return;
                }

                // Try decryption (finally)
                const session = new Olm.Session();
                let decrypted: IOlmPayload;
                try {
                    session.unpickle(this.pickleKey, trySession.pickled);
                    decrypted = JSON.parse(session.decrypt(myMessage.type, myMessage.body));
                } catch (e) {
                    LogService.warn("CryptoClient", "Decryption error with to-device message, assuming corrupted session and re-establishing.", e);
                    await this.establishNewOlmSession(senderDevice);
                    return;
                } finally {
                    session.free();
                }

                const wasForUs = decrypted.recipient === (await this.client.getUserId());
                const wasFromThem = decrypted.sender === message.sender;
                const hasType = typeof(decrypted.type) === 'string';
                const hasContent = !!decrypted.content && typeof(decrypted.content) === 'object';
                const ourKeyMatches = decrypted.recipient_keys?.ed25519 === this.deviceEd25519;
                const theirKeyMatches = decrypted.keys?.ed25519 === senderDevice.keys[`${DeviceKeyAlgorithm.Ed25519}:${senderDevice.device_id}`];
                if (!wasForUs || !wasFromThem || !hasType || !hasContent || !ourKeyMatches || !theirKeyMatches) {
                    LogService.warn("CryptoClient", "Successfully decrypted to-device message, but it failed validation. Ignoring message.", {
                        wasForUs,
                        wasFromThem,
                        hasType,
                        hasContent,
                        ourKeyMatches,
                        theirKeyMatches,
                    });
                    return;
                }

                trySession.lastDecryptionTs = Date.now();
                await this.client.cryptoStore.storeOlmSession(senderDevice.user_id, senderDevice.device_id, trySession);

                if (decrypted.type === "m.room_key") {
                    await this.handleInboundRoomKey(decrypted, senderDevice, message);
                } else if (decrypted.type === "m.dummy") {
                    // success! Nothing to do.
                } else {
                    LogService.warn("CryptoClient", `Unknown decrypted to-device message type: ${decrypted.type}`);
                }
            } else {
                LogService.warn("CryptoClient", `Unknown to-device message type: ${message.type}`);
            }
        } catch (e) {
            LogService.error("CryptoClient", "Non-fatal error while processing to-device message:", e);
        }
    }

    private async handleInboundRoomKey(message: IToDeviceMessage<IMRoomKey>, device: UserDevice, original: IToDeviceMessage<IOlmEncrypted>): Promise<void> {
        if (message.content?.algorithm !== EncryptionAlgorithm.MegolmV1AesSha2) {
            LogService.warn("CryptoClient", "Ignoring m.room_key for unknown encryption algorithm");
            return;
        }
        if (!message.content?.room_id || !message.content?.session_id || !message.content?.session_key) {
            LogService.warn("CryptoClient", "Ignoring invalid m.room_key");
            return;
        }

        const deviceKey = device.keys[`${DeviceKeyAlgorithm.Curve25519}:${device.device_id}`];
        if (deviceKey !== original.content?.sender_key) {
            LogService.warn("CryptoClient", "Ignoring m.room_key message from unexpected sender");
            return;
        }

        // See if we already know about this session (if we do: ignore the message)
        const knownSession = await this.client.cryptoStore.getInboundGroupSession(device.user_id, device.device_id, message.content.room_id, message.content.session_id);
        if (knownSession) {
            return; // ignore
        }

        await this.storeInboundGroupSession(message.content, device.user_id, device.device_id);
    }

    private async storeInboundGroupSession(key: IMRoomKey, senderUserId: string, senderDeviceId: string): Promise<void> {
        const inboundSession = new Olm.InboundGroupSession();
        try {
            inboundSession.create(key.session_key);
            if (inboundSession.session_id() !== key.session_id) {
                LogService.warn("CryptoClient", "Ignoring m.room_key with mismatched session_id");
                return;
            }
            await this.client.cryptoStore.storeInboundGroupSession({
                roomId: key.room_id,
                sessionId: key.session_id,
                senderDeviceId: senderDeviceId,
                senderUserId: senderUserId,
                pickled: inboundSession.pickle(this.pickleKey),
            });
        } finally {
            inboundSession.free();
        }
    }

    private async establishNewOlmSession(device: UserDevice): Promise<void> {
        const olmSessions = await this.getOrCreateOlmSessions({
            [device.user_id]: [device.device_id],
        }, true);

        // Share the session immediately
        await this.encryptAndSendOlmMessage(device, olmSessions[device.user_id][device.device_id], "m.dummy", {});
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

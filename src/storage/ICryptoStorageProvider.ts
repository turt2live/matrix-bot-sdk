import { EncryptionEventContent } from "../models/events/EncryptionEvent";
import {
    IInboundGroupSession,
    IOlmSession,
    IOutboundGroupSession,
    StoredUserDevice,
    UserDevice,
} from "../models/Crypto";

/**
 * A storage provider capable of only providing crypto-related storage.
 * @category Storage providers
 */
export interface ICryptoStorageProvider {
    /**
     * Sets the client's device ID.
     * @param {string} deviceId The device ID.
     * @returns {Promise<void>} Resolves when complete.
     */
    setDeviceId(deviceId: string): Promise<void>;

    /**
     * Gets the client's device ID, if known.
     * @returns {Promise<string>} Resolves to the device ID, or falsy if not known.
     */
    getDeviceId(): Promise<string>;

    /**
     * Sets the pickle key for the client.
     * @param {string} pickleKey The pickle key to store.
     * @returns {Promise<void>} Resolves when complete.
     */
    setPickleKey(pickleKey: string): Promise<void>;

    /**
     * Gets the pickle key for the client. If no pickle key is set, this resolves
     * to falsy.
     * @returns {Promise<string>} Resolves to the pickle key, or falsy if not set.
     */
    getPickleKey(): Promise<string>;

    /**
     * Sets the pickled copy of the Olm account. This should be stored securely
     * if possible.
     * @param {string} pickled Encoded, pickled, copy of the Olm account.
     * @returns {Promise<void>} Resolves when complete.
     */
    setPickledAccount(pickled: string): Promise<void>;

    /**
     * Gets the pickled copy of the Olm account, or falsy if not set.
     * @returns {Promise<string>} Resolves to the pickled account, or falsy if not set.
     */
    getPickledAccount(): Promise<string>;

    /**
     * Stores a room's configuration.
     * @param {string} roomId The room ID to store the configuration for.
     * @param {Partial<EncryptionEventContent>} config The room's encryption config. May be empty.
     * @returns {Promise<void>} Resolves when complete.
     */
    storeRoom(roomId: string, config: Partial<EncryptionEventContent>): Promise<void>;

    /**
     * Gets a room's configuration. If the room is unknown, a falsy value is returned.
     * @param {string} roomId The room ID to get the configuration for.
     * @returns {Promise<Partial<EncryptionEventContent>>} Resolves to the room's configuration, or
     * to falsy if the room is unknown.
     */
    getRoom(roomId: string): Promise<Partial<EncryptionEventContent>>;

    /**
     * Sets the user's stored devices to the given array. All devices not in this set will be deleted.
     * This will clear the user's outdated flag, if set.
     * @param {string} userId The user ID to set the devices for.
     * @param {UserDevice[]} devices The devices to set for the user.
     * @returns {Promise<void>} Resolves when complete.
     */
    setActiveUserDevices(userId: string, devices: UserDevice[]): Promise<void>;

    /**
     * Gets the user's active stored devices. If no devices are stored, an empty array is returned.
     * @param {string} userId The user ID to get devices for.
     * @returns {Promise<UserDevice[]>} Resolves to the array of devices for the user. If no
     * devices are known, the array will be empty.
     */
    getActiveUserDevices(userId: string): Promise<UserDevice[]>;

    /**
     * Gets a user's active stored device. If the device is not known or active, falsy is returned.
     * @param {string} userId The user ID.
     * @param {string} deviceId The device ID.
     * @returns {Promise<UserDevice>} Resolves to the user's device, or falsy if not known.
     */
    getActiveUserDevice(userId: string, deviceId: string): Promise<UserDevice>;

    /**
     * Gets all of the user's devices, regardless of whether or not they are active. The active flag
     * will be stored in the unsigned portion of the returned device.
     * @param {string} userId The user ID to get devices for.
     * @returns {Promise<StoredUserDevice[]>} Resolves to the array of devices for the user, or empty
     * if no devices are known.
     */
    getAllUserDevices(userId: string): Promise<StoredUserDevice[]>;

    /**
     * Flags multiple user's device lists as outdated.
     * @param {string} userIds The user IDs to flag.
     * @returns {Promise<void>} Resolves when complete.
     */
    flagUsersOutdated(userIds: string[]): Promise<void>;

    /**
     * Checks to see if a user's device list is flagged as outdated. If the user is not known
     * then they will be considered outdated.
     * @param {string} userId The user ID to check.
     * @returns {Promise<boolean>} Resolves to true if outdated, false otherwise.
     */
    isUserOutdated(userId: string): Promise<boolean>;

    /**
     * Stores a pickled outbound group session. If the session is flagged as current, all other sessions
     * for the room ID will be flagged as not-current.
     * @param {IOutboundGroupSession} session The session to store.
     * @returns {Promise<void>} Resolves when complete.
     */
    storeOutboundGroupSession(session: IOutboundGroupSession): Promise<void>;

    /**
     * Gets a previously stored outbound group session. If the session ID is not known, a falsy value
     * will be returned.
     * @param {string} sessionId The session ID.
     * @param {string} roomId The room ID where the session is stored.
     * @returns {Promise<IOutboundGroupSession>} Resolves to the session, or falsy if not known.
     */
    getOutboundGroupSession(sessionId: string, roomId: string): Promise<IOutboundGroupSession>;

    /**
     * Gets the current outbound group session for a room. If the room does not have a current session,
     * a falsy value will be returned.
     * @param {string} roomId The room ID.
     * @returns {Promise<IOutboundGroupSession>} Resolves to the current session, or falsy if not known.
     */
    getCurrentOutboundGroupSession(roomId: string): Promise<IOutboundGroupSession>;

    /**
     * Stores a session as sent to a user's device.
     * @param {IOutboundGroupSession} session The session that was sent.
     * @param {number} index The session index.
     * @param {UserDevice} device The device the session was sent to.
     * @returns {Promise<void>} Resolves when complete.
     */
    storeSentOutboundGroupSession(session: IOutboundGroupSession, index: number, device: UserDevice): Promise<void>;

    /**
     * Gets the last sent session that was sent to a user's device. If none is recorded,
     * a falsy value is returned.
     * @param {string} userId The user ID to look for.
     * @param {string} deviceId The device ID to look for.
     * @param {string} roomId The room ID to look in.
     * @returns {Promise<{sessionId: string, index: number}>} Resolves to the last session
     * sent, or falsy if not known.
     */
    getLastSentOutboundGroupSession(userId: string, deviceId: string, roomId: string): Promise<{sessionId: string, index: number}>;

    /**
     * Stores/updates an Olm session for a user's device.
     * @param {string} userId The user ID.
     * @param {string} deviceId The device ID.
     * @param {IOlmSession} session The session.
     * @returns {Promise<void>} Resolves when complete.
     */
    storeOlmSession(userId: string, deviceId: string, session: IOlmSession): Promise<void>;

    /**
     * Gets the most current Olm session for the user's device. If none is present, a falsy value is returned.
     * @param {string} userId The user ID.
     * @param {string} deviceId The device ID.
     * @returns {Promise<IOlmSession>} Resolves to the Olm session, or falsy if none found.
     */
    getCurrentOlmSession(userId: string, deviceId: string): Promise<IOlmSession>;

    /**
     * Gets all the Olm sessions known for a given user's device. Note that this may not return in order,
     * so callers needing to know the "current" Olm session should use the appropriate function.
     * @param {string} userId The user ID.
     * @param {string} deviceId The device ID.
     * @returns {Promise<IOlmSession[]>} Resolves to the known Olm sessions, or an empty array if none are known.
     */
    getOlmSessions(userId: string, deviceId: string): Promise<IOlmSession[]>;

    /**
     * Stores an inbound group session.
     * @param {IInboundGroupSession} session The session to store.
     * @returns {Promise<void>} Resolves when complete.
     */
    storeInboundGroupSession(session: IInboundGroupSession): Promise<void>;

    /**
     * Gets a previously stored inbound group session. If the session is not known, a falsy value is returned.
     * @param {string} senderUserId The user ID who sent the session in the first place.
     * @param {string} senderDeviceId The device ID of the sender.
     * @param {string} roomId The room ID where the session should belong.
     * @param {string} sessionId The session ID itself.
     * @returns {Promise<IInboundGroupSession>} Resolves to the session, or falsy if not known.
     */
    getInboundGroupSession(senderUserId: string, senderDeviceId: string, roomId: string, sessionId: string): Promise<IInboundGroupSession>;

    /**
     * Sets the successfully decrypted message index for an event. Useful for tracking replay attacks.
     * @param {string} roomId The room ID where the event was sent.
     * @param {string} eventId The event ID.
     * @param {string} sessionId The inbound group session ID for the event.
     * @param {number} messageIndex The message index, as reported after decryption.
     * @returns {Promise<void>} Resolves when complete.
     */
    setMessageIndexForEvent(roomId: string, eventId: string, sessionId: string, messageIndex: number): Promise<void>;

    /**
     * Gets the event ID for a previously successful decryption from a session and message index. If
     * no event ID is known, this will return falsy. The caller can use this function to determine if
     * a replay attack is being performed by checking the returned event ID, if present, against the
     * event ID of the event it is decrypting. If the event IDs do not match but are truthy then the
     * session may have been inappropriately re-used.
     * @param {string} roomId The room ID.
     * @param {string} sessionId The inbound group session ID.
     * @param {number} messageIndex The message index.
     * @returns {Promise<string>} Resolves to the event ID of the matching event, or falsy if not known.
     */
    getEventForMessageIndex(roomId: string, sessionId: string, messageIndex: number): Promise<string>;
}

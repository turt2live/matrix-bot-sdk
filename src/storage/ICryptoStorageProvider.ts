import { EncryptionEventContent } from "../models/events/EncryptionEvent";

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
}

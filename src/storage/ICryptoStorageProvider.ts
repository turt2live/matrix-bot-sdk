import { ICryptoRoomInformation } from "../e2ee/ICryptoRoomInformation";

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
     * Stores a room's configuration.
     * @param {string} roomId The room ID to store the configuration for.
     * @param {ICryptoRoomInformation} config The room's encryption config. May be empty.
     * @returns {Promise<void>} Resolves when complete.
     */
    storeRoom(roomId: string, config: ICryptoRoomInformation): Promise<void>;

    /**
     * Gets a room's configuration. If the room is unknown, a falsy value is returned.
     * @param {string} roomId The room ID to get the configuration for.
     * @returns {Promise<ICryptoRoomInformation>} Resolves to the room's configuration, or
     * to falsy if the room is unknown.
     */
    getRoom(roomId: string): Promise<ICryptoRoomInformation>;
}

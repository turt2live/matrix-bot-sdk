import { Appservice } from "./Appservice";
import { Intent } from "./Intent";

export const REMOTE_USER_INFO_ACCOUNT_DATA_EVENT_TYPE = "io.t2bot.sdk.bot.remote_user_info";
export const REMOTE_ROOM_INFO_ACCOUNT_DATA_EVENT_TYPE = "io.t2bot.sdk.bot.remote_room_info";
export const REMOTE_USER_MAP_ACCOUNT_DATA_EVENT_TYPE_PREFIX = "io.t2bot.sdk.bot.remote_user_map";
export const REMOTE_ROOM_MAP_ACCOUNT_DATA_EVENT_TYPE_PREFIX = "io.t2bot.sdk.bot.remote_room_map";

/**
 * @see MatrixBridge
 * @category Application services
 */
export interface IRemoteRoomInfo {
    /**
     * A unique identifier for the remote user.
     */
    id: string;
}

/**
 * @see MatrixBridge
 * @category Application services
 */
export interface IRemoteUserInfo {
    /**
     * A unique identifier for the remote room (or room equivalent).
     */
    id: string;
}

/**
 * Utility class for common operations performed by bridges (represented
 * as appservices).
 *
 * The storage utilities are not intended for bridges which allow 1:many
 * relationships with the remote network.
 *
 * Bridges are generally expected to create their own classes which extend
 * the IRemoteRoomInfo and IRemoteUserInfo interfaces and serialize to JSON
 * cleanly. The serialized version of these classes is persisted in various
 * account data locations for future lookups.
 * @category Application services
 */
export class MatrixBridge {
    constructor(private appservice: Appservice) {
    }

    /**
     * Gets information about a remote user.
     * @param {Intent} userIntent The Matrix user intent to get information on.
     * @returns {Promise<IRemoteUserInfo>} Resolves to the remote user information.
     */
    public async getRemoteUserInfo<T extends IRemoteUserInfo>(userIntent: Intent): Promise<T> {
        await userIntent.ensureRegistered();
        return <Promise<T>>userIntent.underlyingClient.getAccountData(REMOTE_USER_INFO_ACCOUNT_DATA_EVENT_TYPE);
    }

    /**
     * Sets information about a remote user. Calling this function will map the
     * provided remote user ID to the intent's owner.
     * @param {Intent} userIntent The Matrix user intent to store information on.
     * @param {IRemoteUserInfo} remoteInfo The remote user information to store
     * @returns {Promise<any>} Resolves when the information has been updated.
     */
    public async setRemoteUserInfo<T extends IRemoteUserInfo>(userIntent: Intent, remoteInfo: T): Promise<any> {
        await userIntent.ensureRegistered();
        await userIntent.underlyingClient.setAccountData(REMOTE_USER_INFO_ACCOUNT_DATA_EVENT_TYPE, remoteInfo);
        await this.updateRemoteUserMapping(userIntent.userId, remoteInfo.id);
    }

    /**
     * Gets information about a remote room.
     * @param {string} matrixRoomId The Matrix room ID to get information on.
     * @returns {Promise<IRemoteRoomInfo>} Resolves to the remote room information.
     */
    public async getRemoteRoomInfo<T extends IRemoteRoomInfo>(matrixRoomId: string): Promise<T> {
        const bridgeBot = this.appservice.botIntent;
        await bridgeBot.ensureRegistered();
        // We do not need to ensure the user is joined to the room because we can associate
        // room account data with any arbitrary room.
        return <Promise<T>>bridgeBot.underlyingClient.getRoomAccountData(REMOTE_ROOM_INFO_ACCOUNT_DATA_EVENT_TYPE, matrixRoomId);
    }

    /**
     * Sets information about a remote room. Calling this function will map the
     * provided remote room ID to the matrix room ID.
     * @param {string} matrixRoomId The Matrix room ID to store information on.
     * @param {IRemoteRoomInfo} remoteInfo The remote room information to store
     * @returns {Promise<any>} Resolves when the information has been updated.
     */
    public async setRemoteRoomInfo<T extends IRemoteRoomInfo>(matrixRoomId: string, remoteInfo: T): Promise<any> {
        const bridgeBot = this.appservice.botIntent;
        await bridgeBot.ensureRegistered();
        // We do not need to ensure the user is joined to the room because we can associate
        // room account data with any arbitrary room.
        await bridgeBot.underlyingClient.setRoomAccountData(REMOTE_ROOM_INFO_ACCOUNT_DATA_EVENT_TYPE, matrixRoomId, remoteInfo);
        await this.updateRemoteRoomMapping(matrixRoomId, remoteInfo.id);
    }

    /**
     * Gets the Matrix room ID for the provided remote room ID.
     * @param {string} remoteRoomId The remote room ID to look up.
     * @returns {Promise<string>} Resolves to the Matrix room ID.
     */
    public async getMatrixRoomIdForRemote(remoteRoomId: string): Promise<string> {
        const eventType = `${REMOTE_ROOM_MAP_ACCOUNT_DATA_EVENT_TYPE_PREFIX}.${remoteRoomId}`;
        const bridgeBot = this.appservice.botIntent;
        await bridgeBot.ensureRegistered();
        const result = await bridgeBot.underlyingClient.getAccountData(eventType);
        return result['id'];
    }

    /**
     * Gets a Matrix user intent for the provided remote user ID.
     * @param {string} remoteUserId The remote user ID to look up.
     * @returns {Promise<Intent>} Resolves to the Matrix user intent.
     */
    public async getIntentForRemote(remoteUserId: string): Promise<Intent> {
        const eventType = `${REMOTE_USER_MAP_ACCOUNT_DATA_EVENT_TYPE_PREFIX}.${remoteUserId}`;
        const bridgeBot = this.appservice.botIntent;
        await bridgeBot.ensureRegistered();
        const result = await bridgeBot.underlyingClient.getAccountData(eventType);
        return this.appservice.getIntentForUserId(result['id']);
    }

    private async updateRemoteUserMapping(matrixUserId: string, remoteUserId: string): Promise<any> {
        const eventType = `${REMOTE_USER_MAP_ACCOUNT_DATA_EVENT_TYPE_PREFIX}.${remoteUserId}`;
        const bridgeBot = this.appservice.botIntent;
        await bridgeBot.ensureRegistered();
        await bridgeBot.underlyingClient.setAccountData(eventType, {id: matrixUserId});
    }

    private async updateRemoteRoomMapping(matrixRoomId: string, remoteRoomId: string): Promise<any> {
        const eventType = `${REMOTE_ROOM_MAP_ACCOUNT_DATA_EVENT_TYPE_PREFIX}.${remoteRoomId}`;
        const bridgeBot = this.appservice.botIntent;
        await bridgeBot.ensureRegistered();
        await bridgeBot.underlyingClient.setAccountData(eventType, {id: matrixRoomId});
    }
}

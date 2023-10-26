import { EventEmitter } from "events";
import { htmlEncode } from "htmlencode";
import { htmlToText } from "html-to-text";

import { IStorageProvider } from "./storage/IStorageProvider";
import { MemoryStorageProvider } from "./storage/MemoryStorageProvider";
import { IJoinRoomStrategy } from "./strategies/JoinRoomStrategy";
import { UnstableApis } from "./UnstableApis";
import { IPreprocessor } from "./preprocessors/IPreprocessor";
import { getRequestFn } from "./request";
import { extractRequestError, LogService } from "./logging/LogService";
import { RichReply } from "./helpers/RichReply";
import { Metrics } from "./metrics/Metrics";
import { timedMatrixClientFunctionCall } from "./metrics/decorators";
import { AdminApis } from "./AdminApis";
import { Presence } from "./models/Presence";
import { Membership, MembershipEvent } from "./models/events/MembershipEvent";
import { RoomEvent, RoomEventContent, StateEvent } from "./models/events/RoomEvent";
import { EventContext } from "./models/EventContext";
import { PowerLevelBounds } from "./models/PowerLevelBounds";
import { EventKind } from "./models/events/EventKind";
import { IdentityClient } from "./identity/IdentityClient";
import { OpenIDConnectToken } from "./models/OpenIDConnect";
import { doHttpRequest } from "./http";
import { Space, SpaceCreateOptions } from "./models/Spaces";
import { PowerLevelAction } from "./models/PowerLevelAction";
import { CryptoClient } from "./e2ee/CryptoClient";
import {
    FallbackKey,
    IToDeviceMessage,
    MultiUserDeviceListResponse,
    OTKAlgorithm,
    OTKClaimResponse,
    OTKCounts,
    OTKs,
    OwnUserDevice,
} from "./models/Crypto";
import { requiresCrypto } from "./e2ee/decorators";
import { ICryptoStorageProvider } from "./storage/ICryptoStorageProvider";
import { EncryptedRoomEvent } from "./models/events/EncryptedRoomEvent";
import { IWhoAmI } from "./models/Account";
import { RustSdkCryptoStorageProvider } from "./storage/RustSdkCryptoStorageProvider";
import { DMs } from "./DMs";
import { ServerVersions } from "./models/ServerVersions";
import { RoomCreateOptions } from "./models/CreateRoom";
import { PresenceState } from './models/events/PresenceEvent';

const SYNC_BACKOFF_MIN_MS = 5000;
const SYNC_BACKOFF_MAX_MS = 15000;
const VERSIONS_CACHE_MS = 7200000; // 2 hours

/**
 * A client that is capable of interacting with a matrix homeserver.
 */
export class MatrixClient extends EventEmitter {
    /**
     * The presence status to use while syncing. The valid values are "online" to set the account as online,
     * "offline" to set the user as offline, "unavailable" for marking the user away, and null for not setting
     * an explicit presence (the default).
     *
     * Has no effect if the client is not syncing. Does not apply until the next sync request.
     */
    public syncingPresence: PresenceState | null = null;

    /**
     * The number of milliseconds to wait for new events for on the next sync.
     *
     * Has no effect if the client is not syncing. Does not apply until the next sync request.
     */
    public syncingTimeout = 30000;

    /**
     * The crypto manager instance for this client. Generally speaking, this shouldn't
     * need to be accessed but is made available.
     *
     * Will be null/undefined if crypto is not possible.
     */
    public readonly crypto: CryptoClient;

    /**
     * The DM manager instance for this client.
     */
    public readonly dms: DMs;

    private userId: string;
    private requestId = 0;
    private lastJoinedRoomIds: string[] = [];
    private impersonatedUserId: string;
    private impersonatedDeviceId: string;
    private joinStrategy: IJoinRoomStrategy = null;
    private eventProcessors: { [eventType: string]: IPreprocessor[] } = {};
    private filterId = 0;
    private stopSyncing = false;
    private metricsInstance: Metrics = new Metrics();
    private unstableApisInstance = new UnstableApis(this);
    private cachedVersions: ServerVersions;
    private versionsLastFetched = 0;

    /**
     * Set this to true to have the client only persist the sync token after the sync
     * has been processed successfully. Note that if this is true then when the sync
     * loop throws an error the client will not persist a token.
     */
    protected persistTokenAfterSync = false;

    /**
     * Creates a new matrix client
     * @param {string} homeserverUrl The homeserver's client-server API URL
     * @param {string} accessToken The access token for the homeserver
     * @param {IStorageProvider} storage The storage provider to use. Defaults to MemoryStorageProvider.
     * @param {ICryptoStorageProvider} cryptoStore Optional crypto storage provider to use. If not supplied,
     * end-to-end encryption will not be functional in this client.
     */
    constructor(
        public readonly homeserverUrl: string,
        public readonly accessToken: string,
        private storage: IStorageProvider = null,
        public readonly cryptoStore: ICryptoStorageProvider = null,
    ) {
        super();

        if (this.homeserverUrl.endsWith("/")) {
            this.homeserverUrl = this.homeserverUrl.substring(0, this.homeserverUrl.length - 1);
        }

        if (this.cryptoStore) {
            if (!this.storage || this.storage instanceof MemoryStorageProvider) {
                LogService.warn("MatrixClientLite", "Starting an encryption-capable client with a memory store is not considered a good idea.");
            }
            if (!(this.cryptoStore instanceof RustSdkCryptoStorageProvider)) {
                throw new Error("Cannot support custom encryption stores: Use a RustSdkCryptoStorageProvider");
            }
            this.crypto = new CryptoClient(this);
            this.on("room.event", (roomId, event) => {
                // noinspection JSIgnoredPromiseFromCall
                this.crypto.onRoomEvent(roomId, event);
            });
            this.on("room.join", (roomId) => {
                // noinspection JSIgnoredPromiseFromCall
                this.crypto.onRoomJoin(roomId);
            });
            LogService.debug("MatrixClientLite", "End-to-end encryption client created");
        } else {
            // LogService.trace("MatrixClientLite", "Not setting up encryption");
        }

        if (!this.storage) this.storage = new MemoryStorageProvider();

        this.dms = new DMs(this);
    }

    /**
     * The storage provider for this client. Direct access is usually not required.
     */
    public get storageProvider(): IStorageProvider {
        return this.storage;
    }

    /**
     * The metrics instance for this client
     */
    public get metrics(): Metrics {
        return this.metricsInstance;
    }

    /**
     * Assigns a new metrics instance, overwriting the old one.
     * @param {Metrics} metrics The new metrics instance.
     */
    public set metrics(metrics: Metrics) {
        if (!metrics) throw new Error("Metrics cannot be null/undefined");
        this.metricsInstance = metrics;
    }

    /**
     * Gets the unstable API access class. This is generally not recommended to be
     * used by clients.
     * @return {UnstableApis} The unstable API access class.
     */
    public get unstableApis(): UnstableApis {
        return this.unstableApisInstance;
    }

    /**
     * Gets the admin API access class.
     * @return {AdminApis} The admin API access class.
     */
    public get adminApis(): AdminApis {
        return new AdminApis(this);
    }

    /**
     * Sets a user ID to impersonate as. This will assume that the access token for this client
     * is for an application service, and that the userId given is within the reach of the
     * application service. Setting this to null will stop future impersonation. The user ID is
     * assumed to already be valid
     * @param {string} userId The user ID to masquerade as, or `null` to clear masquerading.
     * @param {string} deviceId Optional device ID to impersonate under the given user, if supported
     * by the server. Check the whoami response after setting.
     */
    public impersonateUserId(userId: string | null, deviceId?: string): void {
        this.impersonatedUserId = userId;
        this.userId = userId;
        if (userId) {
            this.impersonatedDeviceId = deviceId;
        } else if (deviceId) {
            throw new Error("Cannot impersonate just a device: need a user ID");
        } else {
            this.impersonatedDeviceId = null;
        }
    }

    /**
     * Acquires an identity server client for communicating with an identity server. Note that
     * this will automatically do the login portion to establish a usable token with the identity
     * server provided, but it will not automatically accept any terms of service.
     *
     * The identity server name provided will in future be resolved to a server address - for now
     * that resolution is assumed to be prefixing the name with `https://`.
     * @param {string} identityServerName The domain of the identity server to connect to.
     * @returns {Promise<IdentityClient>} Resolves to a prepared identity client.
     */
    public async getIdentityServerClient(identityServerName: string): Promise<IdentityClient> {
        const oidcToken = await this.getOpenIDConnectToken();
        return IdentityClient.acquire(oidcToken, `https://${identityServerName}`, this);
    }

    /**
     * Sets the strategy to use for when joinRoom is called on this client
     * @param {IJoinRoomStrategy} strategy The strategy to use, or null to use none
     */
    public setJoinStrategy(strategy: IJoinRoomStrategy): void {
        this.joinStrategy = strategy;
    }

    /**
     * Adds a preprocessor to the event pipeline. When this client encounters an event, it
     * will try to run it through the preprocessors it can in the order they were added.
     * @param {IPreprocessor} preprocessor the preprocessor to add
     */
    public addPreprocessor(preprocessor: IPreprocessor): void {
        if (!preprocessor) throw new Error("Preprocessor cannot be null");

        const eventTypes = preprocessor.getSupportedEventTypes();
        if (!eventTypes) return; // Nothing to do

        for (const eventType of eventTypes) {
            if (!this.eventProcessors[eventType]) this.eventProcessors[eventType] = [];
            this.eventProcessors[eventType].push(preprocessor);
        }
    }

    private async processEvent(event: any): Promise<any> {
        if (!event) return event;
        if (!this.eventProcessors[event["type"]]) return event;

        for (const processor of this.eventProcessors[event["type"]]) {
            await processor.processEvent(event, this, EventKind.RoomEvent);
        }

        return event;
    }

    /**
     * Retrieves the server's supported specification versions and unstable features.
     * @returns {Promise<ServerVersions>} Resolves to the server's supported versions.
     */
    @timedMatrixClientFunctionCall()
    public async getServerVersions(): Promise<ServerVersions> {
        if (!this.cachedVersions || (Date.now() - this.versionsLastFetched) >= VERSIONS_CACHE_MS) {
            this.cachedVersions = await this.doRequest("GET", "/_matrix/client/versions");
            this.versionsLastFetched = Date.now();
        }

        return this.cachedVersions;
    }

    /**
     * Determines if the server supports a given unstable feature flag. Useful for determining
     * if the server can support an unstable MSC.
     * @param {string} feature The feature name to look for.
     * @returns {Promise<boolean>} Resolves to true if the server supports the flag, false otherwise.
     */
    public async doesServerSupportUnstableFeature(feature: string): Promise<boolean> {
        return !!(await this.getServerVersions()).unstable_features?.[feature];
    }

    /**
     * Determines if the server supports a given version of the specification or not.
     * @param {string} version The version to look for. Eg: "v1.1"
     * @returns {Promise<boolean>} Resolves to true if the server supports the version, false otherwise.
     */
    public async doesServerSupportVersion(version: string): Promise<boolean> {
        return (await this.getServerVersions()).versions.includes(version);
    }

    /**
     * Determines if the server supports at least one of the given specification versions or not.
     * @param {string[]} versions The versions to look for. Eg: ["v1.1"]
     * @returns {Promise<boolean>} Resolves to true if the server supports any of the versions, false otherwise.
     */
    public async doesServerSupportAnyOneVersion(versions: string[]): Promise<boolean> {
        for (const version of versions) {
            if (await this.doesServerSupportVersion(version)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Retrieves an OpenID Connect token from the homeserver for the current user.
     * @returns {Promise<OpenIDConnectToken>} Resolves to the token.
     */
    @timedMatrixClientFunctionCall()
    public async getOpenIDConnectToken(): Promise<OpenIDConnectToken> {
        const userId = encodeURIComponent(await this.getUserId());
        return this.doRequest("POST", "/_matrix/client/v3/user/" + userId + "/openid/request_token", null, {});
    }

    /**
     * Retrieves content from account data.
     * @param {string} eventType The type of account data to retrieve.
     * @returns {Promise<any>} Resolves to the content of that account data.
     */
    @timedMatrixClientFunctionCall()
    public async getAccountData<T>(eventType: string): Promise<T> {
        const userId = encodeURIComponent(await this.getUserId());
        eventType = encodeURIComponent(eventType);
        return this.doRequest("GET", "/_matrix/client/v3/user/" + userId + "/account_data/" + eventType);
    }

    /**
     * Retrieves content from room account data.
     * @param {string} eventType The type of room account data to retrieve.
     * @param {string} roomId The room to read the account data from.
     * @returns {Promise<any>} Resolves to the content of that account data.
     */
    @timedMatrixClientFunctionCall()
    public async getRoomAccountData<T>(eventType: string, roomId: string): Promise<T> {
        const userId = encodeURIComponent(await this.getUserId());
        eventType = encodeURIComponent(eventType);
        roomId = encodeURIComponent(roomId);
        return this.doRequest("GET", "/_matrix/client/v3/user/" + userId + "/rooms/" + roomId + "/account_data/" + eventType);
    }

    /**
     * Retrieves content from account data. If the account data request throws an error,
     * this simply returns the default provided.
     * @param {string} eventType The type of account data to retrieve.
     * @param {any} defaultContent The default value. Defaults to null.
     * @returns {Promise<any>} Resolves to the content of that account data, or the default.
     */
    @timedMatrixClientFunctionCall()
    public async getSafeAccountData<T>(eventType: string, defaultContent: T = null): Promise<T> {
        try {
            return await this.getAccountData(eventType);
        } catch (e) {
            LogService.warn("MatrixClient", `Error getting ${eventType} account data:`, extractRequestError(e));
            return defaultContent;
        }
    }

    /**
     * Retrieves content from room account data. If the account data request throws an error,
     * this simply returns the default provided.
     * @param {string} eventType The type of room account data to retrieve.
     * @param {string} roomId The room to read the account data from.
     * @param {any} defaultContent The default value. Defaults to null.
     * @returns {Promise<any>} Resolves to the content of that room account data, or the default.
     */
    @timedMatrixClientFunctionCall()
    public async getSafeRoomAccountData<T>(eventType: string, roomId: string, defaultContent: T = null): Promise<T> {
        try {
            return await this.getRoomAccountData(eventType, roomId);
        } catch (e) {
            LogService.warn("MatrixClient", `Error getting ${eventType} room account data in ${roomId}:`, extractRequestError(e));
            return defaultContent;
        }
    }

    /**
     * Sets account data.
     * @param {string} eventType The type of account data to set
     * @param {any} content The content to set
     * @returns {Promise<any>} Resolves when updated
     */
    @timedMatrixClientFunctionCall()
    public async setAccountData(eventType: string, content: any): Promise<any> {
        const userId = encodeURIComponent(await this.getUserId());
        eventType = encodeURIComponent(eventType);
        return this.doRequest("PUT", "/_matrix/client/v3/user/" + userId + "/account_data/" + eventType, null, content);
    }

    /**
     * Sets room account data.
     * @param {string} eventType The type of room account data to set
     * @param {string} roomId The room to set account data in
     * @param {any} content The content to set
     * @returns {Promise<any>} Resolves when updated
     */
    @timedMatrixClientFunctionCall()
    public async setRoomAccountData(eventType: string, roomId: string, content: any): Promise<any> {
        const userId = encodeURIComponent(await this.getUserId());
        eventType = encodeURIComponent(eventType);
        roomId = encodeURIComponent(roomId);
        return this.doRequest("PUT", "/_matrix/client/v3/user/" + userId + "/rooms/" + roomId + "/account_data/" + eventType, null, content);
    }

    /**
     * Gets the presence information for the current user.
     * @returns {Promise<Presence>} Resolves to the presence status of the user.
     */
    @timedMatrixClientFunctionCall()
    public async getPresenceStatus(): Promise<Presence> {
        return this.getPresenceStatusFor(await this.getUserId());
    }

    /**
     * Gets the presence information for a given user.
     * @param {string} userId The user ID to look up the presence of.
     * @returns {Promise<Presence>} Resolves to the presence status of the user.
     */
    @timedMatrixClientFunctionCall()
    public async getPresenceStatusFor(userId: string): Promise<Presence> {
        return this.doRequest("GET", "/_matrix/client/v3/presence/" + encodeURIComponent(userId) + "/status").then(r => new Presence(r));
    }

    /**
     * Sets the presence status for the current user.
     * @param {PresenceState} presence The new presence state for the user.
     * @param {string?} statusMessage Optional status message to include with the presence.
     * @returns {Promise<any>} Resolves when complete.
     */
    @timedMatrixClientFunctionCall()
    public async setPresenceStatus(presence: PresenceState, statusMessage: string | undefined = undefined): Promise<any> {
        return this.doRequest("PUT", "/_matrix/client/v3/presence/" + encodeURIComponent(await this.getUserId()) + "/status", null, {
            presence: presence,
            status_msg: statusMessage,
        });
    }

    /**
     * Gets a published alias for the given room. These are supplied by the room admins
     * and should point to the room, but may not. This is primarily intended to be used
     * in the context of rendering a mention (pill) for a room.
     * @param {string} roomIdOrAlias The room ID or alias to get an alias for.
     * @returns {Promise<string>} Resolves to a published room alias, or falsey if none found.
     */
    @timedMatrixClientFunctionCall()
    public async getPublishedAlias(roomIdOrAlias: string): Promise<string> {
        try {
            const roomId = await this.resolveRoom(roomIdOrAlias);
            const event = await this.getRoomStateEvent(roomId, "m.room.canonical_alias", "");
            if (!event) return null;

            const canonical = event['alias'];
            const alt = event['alt_aliases'] || [];

            return canonical || alt[0];
        } catch (e) {
            // Assume none
            return null;
        }
    }

    /**
     * Adds a new room alias to the room directory
     * @param {string} alias The alias to add (eg: "#my-room:matrix.org")
     * @param {string} roomId The room ID to add the alias to
     * @returns {Promise} resolves when the alias has been added
     */
    @timedMatrixClientFunctionCall()
    public createRoomAlias(alias: string, roomId: string): Promise<any> {
        alias = encodeURIComponent(alias);
        return this.doRequest("PUT", "/_matrix/client/v3/directory/room/" + alias, null, {
            "room_id": roomId,
        });
    }

    /**
     * Removes a room alias from the room directory
     * @param {string} alias The alias to remove
     * @returns {Promise} resolves when the alias has been deleted
     */
    @timedMatrixClientFunctionCall()
    public deleteRoomAlias(alias: string): Promise<any> {
        alias = encodeURIComponent(alias);
        return this.doRequest("DELETE", "/_matrix/client/v3/directory/room/" + alias);
    }

    /**
     * Sets the visibility of a room in the directory.
     * @param {string} roomId The room ID to manipulate the visibility of
     * @param {"public" | "private"} visibility The visibility to set for the room
     * @return {Promise} resolves when the visibility has been updated
     */
    @timedMatrixClientFunctionCall()
    public setDirectoryVisibility(roomId: string, visibility: "public" | "private"): Promise<any> {
        roomId = encodeURIComponent(roomId);
        return this.doRequest("PUT", "/_matrix/client/v3/directory/list/room/" + roomId, null, {
            "visibility": visibility,
        });
    }

    /**
     * Gets the visibility of a room in the directory.
     * @param {string} roomId The room ID to query the visibility of
     * @return {Promise<"public"|"private">} The visibility of the room
     */
    @timedMatrixClientFunctionCall()
    public getDirectoryVisibility(roomId: string): Promise<"public" | "private"> {
        roomId = encodeURIComponent(roomId);
        return this.doRequest("GET", "/_matrix/client/v3/directory/list/room/" + roomId).then(response => {
            return response["visibility"];
        });
    }

    /**
     * Resolves a room ID or alias to a room ID. If the given ID or alias looks like a room ID
     * already, it will be returned as-is. If the room ID or alias looks like a room alias, it
     * will be resolved to a room ID if possible. If the room ID or alias is neither, an error
     * will be raised.
     * @param {string} roomIdOrAlias the room ID or alias to resolve to a room ID
     * @returns {Promise<string>} resolves to the room ID
     */
    @timedMatrixClientFunctionCall()
    public async resolveRoom(roomIdOrAlias: string): Promise<string> {
        if (roomIdOrAlias.startsWith("!")) return roomIdOrAlias; // probably
        if (roomIdOrAlias.startsWith("#")) return this.lookupRoomAlias(roomIdOrAlias).then(r => r.roomId);
        throw new Error("Invalid room ID or alias");
    }

    /**
     * Does a room directory lookup for a given room alias
     * @param {string} roomAlias the room alias to look up in the room directory
     * @returns {Promise<RoomDirectoryLookupResponse>} resolves to the room's information
     */
    @timedMatrixClientFunctionCall()
    public lookupRoomAlias(roomAlias: string): Promise<RoomDirectoryLookupResponse> {
        return this.doRequest("GET", "/_matrix/client/v3/directory/room/" + encodeURIComponent(roomAlias)).then(response => {
            return {
                roomId: response["room_id"],
                residentServers: response["servers"],
            };
        });
    }

    /**
     * Invites a user to a room.
     * @param {string} userId the user ID to invite
     * @param {string} roomId the room ID to invite the user to
     * @returns {Promise<any>} resolves when completed
     */
    @timedMatrixClientFunctionCall()
    public inviteUser(userId, roomId) {
        return this.doRequest("POST", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/invite", null, {
            user_id: userId,
        });
    }

    /**
     * Kicks a user from a room.
     * @param {string} userId the user ID to kick
     * @param {string} roomId the room ID to kick the user in
     * @param {string?} reason optional reason for the kick
     * @returns {Promise<any>} resolves when completed
     */
    @timedMatrixClientFunctionCall()
    public kickUser(userId, roomId, reason = null) {
        return this.doRequest("POST", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/kick", null, {
            user_id: userId,
            reason: reason,
        });
    }

    /**
     * Bans a user from a room.
     * @param {string} userId the user ID to ban
     * @param {string} roomId the room ID to set the ban in
     * @param {string?} reason optional reason for the ban
     * @returns {Promise<any>} resolves when completed
     */
    @timedMatrixClientFunctionCall()
    public banUser(userId, roomId, reason = null) {
        return this.doRequest("POST", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/ban", null, {
            user_id: userId,
            reason: reason,
        });
    }

    /**
     * Unbans a user in a room.
     * @param {string} userId the user ID to unban
     * @param {string} roomId the room ID to lift the ban in
     * @returns {Promise<any>} resolves when completed
     */
    @timedMatrixClientFunctionCall()
    public unbanUser(userId, roomId) {
        return this.doRequest("POST", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/unban", null, {
            user_id: userId,
        });
    }

    /**
     * Gets the current user ID for this client
     * @returns {Promise<string>} The user ID of this client
     */
    @timedMatrixClientFunctionCall()
    public async getUserId(): Promise<string> {
        if (this.userId) return this.userId;

        // getWhoAmI should populate `this.userId` for us
        await this.getWhoAmI();

        return this.userId;
    }

    /**
     * Gets the user's information from the server directly.
     * @returns {Promise<IWhoAmI>} The "who am I" response.
     */
    public async getWhoAmI(): Promise<IWhoAmI> {
        const whoami = await this.doRequest("GET", "/_matrix/client/v3/account/whoami");
        this.userId = whoami["user_id"];
        return whoami;
    }

    /**
     * Stops the client from syncing.
     */
    public stop() {
        this.stopSyncing = true;
    }

    /**
     * Starts syncing the client with an optional filter
     * @param {any} filter The filter to use, or null for none
     * @returns {Promise<any>} Resolves when the client has started syncing
     */
    public async start(filter: any = null): Promise<any> {
        await this.dms.update();

        this.stopSyncing = false;
        if (!filter || typeof (filter) !== "object") {
            LogService.trace("MatrixClientLite", "No filter given or invalid object - using defaults.");
            filter = null;
        }

        LogService.trace("MatrixClientLite", "Populating joined rooms to avoid excessive join emits");
        this.lastJoinedRoomIds = await this.getJoinedRooms();

        const userId = await this.getUserId();

        if (this.crypto) {
            LogService.debug("MatrixClientLite", "Preparing end-to-end encryption");
            await this.crypto.prepare(this.lastJoinedRoomIds);
            LogService.info("MatrixClientLite", "End-to-end encryption enabled");
        }

        let createFilter = false;

        // noinspection ES6RedundantAwait
        const existingFilter = await Promise.resolve(this.storage.getFilter());
        if (existingFilter) {
            LogService.trace("MatrixClientLite", "Found existing filter. Checking consistency with given filter");
            if (JSON.stringify(existingFilter.filter) === JSON.stringify(filter)) {
                LogService.trace("MatrixClientLite", "Filters match");
                this.filterId = existingFilter.id;
            } else {
                createFilter = true;
            }
        } else {
            createFilter = true;
        }

        if (createFilter && filter) {
            LogService.trace("MatrixClientLite", "Creating new filter");
            await this.doRequest("POST", "/_matrix/client/v3/user/" + encodeURIComponent(userId) + "/filter", null, filter).then(async response => {
                this.filterId = response["filter_id"];
                // noinspection ES6RedundantAwait
                await Promise.resolve(this.storage.setSyncToken(null));
                // noinspection ES6RedundantAwait
                await Promise.resolve(this.storage.setFilter({
                    id: this.filterId,
                    filter: filter,
                }));
            });
        }

        LogService.trace("MatrixClientLite", "Starting sync with filter ID " + this.filterId);
        return this.startSyncInternal();
    }

    protected startSyncInternal(): Promise<any> {
        return this.startSync();
    }

    protected async startSync(emitFn: (emitEventType: string, ...payload: any[]) => Promise<any> = null) {
        // noinspection ES6RedundantAwait
        let token = await Promise.resolve(this.storage.getSyncToken());

        const promiseWhile = async () => {
            if (this.stopSyncing) {
                LogService.info("MatrixClientLite", "Client stop requested - stopping sync");
                return;
            }

            try {
                const response = await this.doSync(token);
                token = response["next_batch"];

                if (!this.persistTokenAfterSync) {
                    await Promise.resolve(this.storage.setSyncToken(token));
                }

                LogService.debug("MatrixClientLite", "Received sync. Next token: " + token);
                await this.processSync(response, emitFn);

                if (this.persistTokenAfterSync) {
                    await Promise.resolve(this.storage.setSyncToken(token));
                }
            } catch (e) {
                // If we've requested to stop syncing, don't bother checking the error.
                if (this.stopSyncing) {
                    LogService.info("MatrixClientLite", "Client stop requested - cancelling sync");
                    return;
                }

                LogService.error("MatrixClientLite", "Error handling sync " + extractRequestError(e));
                const backoffTime = SYNC_BACKOFF_MIN_MS + Math.random() * (SYNC_BACKOFF_MAX_MS - SYNC_BACKOFF_MIN_MS);
                LogService.info("MatrixClientLite", `Backing off for ${backoffTime}ms`);
                await new Promise((r) => setTimeout(r, backoffTime));
            }

            return promiseWhile();
        };

        promiseWhile(); // start the loop
    }

    @timedMatrixClientFunctionCall()
    protected doSync(token: string): Promise<any> {
        LogService.debug("MatrixClientLite", "Performing sync with token " + token);
        const conf = {
            full_state: false,
            timeout: Math.max(0, this.syncingTimeout),
        };
        // synapse complains if the variables are null, so we have to have it unset instead
        if (token) conf["since"] = token;
        if (this.filterId) conf['filter'] = this.filterId;
        if (this.syncingPresence) conf['presence'] = this.syncingPresence;

        // timeout is 40s if we have a token, otherwise 10min
        return this.doRequest("GET", "/_matrix/client/v3/sync", conf, null, (token ? 40000 : 600000));
    }

    @timedMatrixClientFunctionCall()
    protected async processSync(raw: any, emitFn: (emitEventType: string, ...payload: any[]) => Promise<any> = null): Promise<any> {
        if (!emitFn) emitFn = (e, ...p) => Promise.resolve<any>(this.emit(e, ...p));

        if (!raw) return; // nothing to process

        if (this.crypto) {
            const inbox: IToDeviceMessage[] = [];
            if (raw['to_device']?.['events']) {
                inbox.push(...raw['to_device']['events']);
                // TODO: Emit or do something with unknown messages?
            }

            let unusedFallbacks: OTKAlgorithm[] = [];
            if (raw['org.matrix.msc2732.device_unused_fallback_key_types']) {
                unusedFallbacks = raw['org.matrix.msc2732.device_unused_fallback_key_types'];
            } else if (raw['device_unused_fallback_key_types']) {
                unusedFallbacks = raw['device_unused_fallback_key_types'];
            }

            const counts = raw['device_one_time_keys_count'] ?? {};

            const changed = raw['device_lists']?.['changed'] ?? [];
            const left = raw['device_lists']?.['left'] ?? [];

            await this.crypto.updateSyncData(inbox, counts, unusedFallbacks, changed, left);
        }

        // Always process device messages first to ensure there are decryption keys

        if (raw['account_data'] && raw['account_data']['events']) {
            for (const event of raw['account_data']['events']) {
                await emitFn("account_data", event);
            }
        }

        if (!raw['rooms']) return; // nothing more to process

        const leftRooms = raw['rooms']['leave'] || {};
        const inviteRooms = raw['rooms']['invite'] || {};
        const joinedRooms = raw['rooms']['join'] || {};

        // Process rooms we've left first
        for (const roomId in leftRooms) {
            const room = leftRooms[roomId];

            if (room['account_data'] && room['account_data']['events']) {
                for (const event of room['account_data']['events']) {
                    await emitFn("room.account_data", roomId, event);
                }
            }

            if (!room['timeline'] || !room['timeline']['events']) continue;

            let leaveEvent = null;
            for (const event of room['timeline']['events']) {
                if (event['type'] !== 'm.room.member') continue;
                if (event['state_key'] !== await this.getUserId()) continue;

                const membership = event["content"]?.["membership"];
                if (membership !== "leave" && membership !== "ban") continue;

                const oldAge = leaveEvent && leaveEvent['unsigned'] && leaveEvent['unsigned']['age'] ? leaveEvent['unsigned']['age'] : 0;
                const newAge = event['unsigned'] && event['unsigned']['age'] ? event['unsigned']['age'] : 0;
                if (leaveEvent && oldAge < newAge) continue;

                leaveEvent = event;
            }

            if (!leaveEvent) {
                LogService.warn("MatrixClientLite", "Left room " + roomId + " without receiving an event");
                continue;
            }

            leaveEvent = await this.processEvent(leaveEvent);
            await emitFn("room.leave", roomId, leaveEvent);
            this.lastJoinedRoomIds = this.lastJoinedRoomIds.filter(r => r !== roomId);
        }

        // Process rooms we've been invited to
        for (const roomId in inviteRooms) {
            const room = inviteRooms[roomId];
            if (!room['invite_state'] || !room['invite_state']['events']) continue;

            let inviteEvent = null;
            for (const event of room['invite_state']['events']) {
                if (event['type'] !== 'm.room.member') continue;
                if (event['state_key'] !== await this.getUserId()) continue;
                if (!event['content']) continue;
                if (event['content']['membership'] !== "invite") continue;

                const oldAge = inviteEvent && inviteEvent['unsigned'] && inviteEvent['unsigned']['age'] ? inviteEvent['unsigned']['age'] : 0;
                const newAge = event['unsigned'] && event['unsigned']['age'] ? event['unsigned']['age'] : 0;
                if (inviteEvent && oldAge < newAge) continue;

                inviteEvent = event;
            }

            if (!inviteEvent) {
                LogService.warn("MatrixClientLite", "Invited to room " + roomId + " without receiving an event");
                continue;
            }

            inviteEvent = await this.processEvent(inviteEvent);
            await emitFn("room.invite", roomId, inviteEvent);
        }

        // Process rooms we've joined and their events
        for (const roomId in joinedRooms) {
            const room = joinedRooms[roomId];

            if (room['account_data'] && room['account_data']['events']) {
                for (const event of room['account_data']['events']) {
                    await emitFn("room.account_data", roomId, event);
                }
            }

            if (!room['timeline'] || !room['timeline']['events']) continue;

            for (let event of room['timeline']['events']) {
                if (event['type'] === "m.room.member" && event['state_key'] === await this.getUserId()) {
                    if (event['content']?.['membership'] === "join" && this.lastJoinedRoomIds.indexOf(roomId) === -1) {
                        await emitFn("room.join", roomId, await this.processEvent(event));
                        this.lastJoinedRoomIds.push(roomId);
                    }
                }

                event = await this.processEvent(event);
                if (event['type'] === 'm.room.encrypted' && await this.crypto?.isRoomEncrypted(roomId)) {
                    await emitFn("room.encrypted_event", roomId, event);
                    try {
                        event = (await this.crypto.decryptRoomEvent(new EncryptedRoomEvent(event), roomId)).raw;
                        event = await this.processEvent(event);
                        await emitFn("room.decrypted_event", roomId, event);
                    } catch (e) {
                        LogService.error("MatrixClientLite", `Decryption error on ${roomId} ${event['event_id']}`, e);
                        await emitFn("room.failed_decryption", roomId, event, e);
                    }
                }
                if (event['type'] === 'm.room.message') {
                    await emitFn("room.message", roomId, event);
                }
                if (event['type'] === 'm.room.tombstone' && event['state_key'] === '') {
                    await emitFn("room.archived", roomId, event);
                }
                if (event['type'] === 'm.room.create' && event['state_key'] === '' && event['content']
                    && event['content']['predecessor'] && event['content']['predecessor']['room_id']) {
                    await emitFn("room.upgraded", roomId, event);
                }
                await emitFn("room.event", roomId, event);
            }
        }
    }

    /**
     * Gets an event for a room. If the event is encrypted, and the client supports encryption,
     * and the room is encrypted, then this will return a decrypted event.
     * @param {string} roomId the room ID to get the event in
     * @param {string} eventId the event ID to look up
     * @returns {Promise<any>} resolves to the found event
     */
    @timedMatrixClientFunctionCall()
    public async getEvent(roomId: string, eventId: string): Promise<any> {
        const event = await this.getRawEvent(roomId, eventId);
        if (event['type'] === 'm.room.encrypted' && await this.crypto?.isRoomEncrypted(roomId)) {
            return this.processEvent((await this.crypto.decryptRoomEvent(new EncryptedRoomEvent(event), roomId)).raw);
        }
        return event;
    }

    /**
     * Gets an event for a room. Returned as a raw event.
     * @param {string} roomId the room ID to get the event in
     * @param {string} eventId the event ID to look up
     * @returns {Promise<any>} resolves to the found event
     */
    @timedMatrixClientFunctionCall()
    public getRawEvent(roomId: string, eventId: string): Promise<any> {
        return this.doRequest("GET", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/event/" + encodeURIComponent(eventId))
            .then(ev => this.processEvent(ev));
    }

    /**
     * Gets the room state for the given room. Returned as raw events.
     * @param {string} roomId the room ID to get state for
     * @returns {Promise<any[]>} resolves to the room's state
     */
    @timedMatrixClientFunctionCall()
    public getRoomState(roomId: string): Promise<any[]> {
        return this.doRequest("GET", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/state")
            .then(state => Promise.all(state.map(ev => this.processEvent(ev))));
    }

    /**
     * Gets the state events for a given room of a given type under the given state key.
     * @param {string} roomId the room ID
     * @param {string} type the event type
     * @param {String} stateKey the state key, falsey if not needed
     * @returns {Promise<any|any[]>} resolves to the state event(s)
     * @deprecated It is not possible to get an array of events - use getRoomStateEvent instead
     */
    @timedMatrixClientFunctionCall()
    public getRoomStateEvents(roomId, type, stateKey): Promise<any | any[]> {
        return this.getRoomStateEvent(roomId, type, stateKey);
    }

    /**
     * Gets a state event for a given room of a given type under the given state key.
     * @param {string} roomId the room ID
     * @param {string} type the event type
     * @param {String} stateKey the state key
     * @returns {Promise<any>} resolves to the state event
     */
    @timedMatrixClientFunctionCall()
    public getRoomStateEvent(roomId, type, stateKey): Promise<any> {
        const path = "/_matrix/client/v3/rooms/"
            + encodeURIComponent(roomId) + "/state/"
            + encodeURIComponent(type) + "/"
            + encodeURIComponent(stateKey ? stateKey : '');
        return this.doRequest("GET", path)
            .then(ev => this.processEvent(ev));
    }

    /**
     * Gets the context surrounding an event.
     * @param {string} roomId The room ID to get the context in.
     * @param {string} eventId The event ID to get the context of.
     * @param {number} limit The maximum number of events to return on either side of the event.
     * @returns {Promise<EventContext>} The context of the event
     */
    @timedMatrixClientFunctionCall()
    public async getEventContext(roomId: string, eventId: string, limit = 10): Promise<EventContext> {
        const res = await this.doRequest("GET", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/context/" + encodeURIComponent(eventId), { limit });
        return {
            event: new RoomEvent<RoomEventContent>(res['event']),
            before: res['events_before'].map(e => new RoomEvent<RoomEventContent>(e)),
            after: res['events_after'].map(e => new RoomEvent<RoomEventContent>(e)),
            state: res['state'].map(e => new StateEvent<RoomEventContent>(e)),
        };
    }

    /**
     * Gets the profile for a given user
     * @param {string} userId the user ID to lookup
     * @returns {Promise<any>} the profile of the user
     */
    @timedMatrixClientFunctionCall()
    public getUserProfile(userId: string): Promise<any> {
        return this.doRequest("GET", "/_matrix/client/v3/profile/" + encodeURIComponent(userId));
    }

    /**
     * Sets a new display name for the user.
     * @param {string} displayName the new display name for the user, or null to clear
     * @returns {Promise<any>} resolves when complete
     */
    @timedMatrixClientFunctionCall()
    public async setDisplayName(displayName: string): Promise<any> {
        const userId = encodeURIComponent(await this.getUserId());
        return this.doRequest("PUT", "/_matrix/client/v3/profile/" + userId + "/displayname", null, {
            displayname: displayName,
        });
    }

    /**
     * Sets a new avatar url for the user.
     * @param {string} avatarUrl the new avatar URL for the user, in the form of a Matrix Content URI
     * @returns {Promise<any>} resolves when complete
     */
    @timedMatrixClientFunctionCall()
    public async setAvatarUrl(avatarUrl: string): Promise<any> {
        const userId = encodeURIComponent(await this.getUserId());
        return this.doRequest("PUT", "/_matrix/client/v3/profile/" + userId + "/avatar_url", null, {
            avatar_url: avatarUrl,
        });
    }

    /**
     * Joins the given room
     * @param {string} roomIdOrAlias the room ID or alias to join
     * @param {string[]} viaServers the server names to try and join through
     * @returns {Promise<string>} resolves to the joined room ID
     */
    @timedMatrixClientFunctionCall()
    public async joinRoom(roomIdOrAlias: string, viaServers: string[] = []): Promise<string> {
        const apiCall = (targetIdOrAlias: string) => {
            targetIdOrAlias = encodeURIComponent(targetIdOrAlias);
            const qs = {};
            if (viaServers.length > 0) qs['server_name'] = viaServers;
            return this.doRequest("POST", "/_matrix/client/v3/join/" + targetIdOrAlias, qs, {}).then(response => {
                return response['room_id'];
            });
        };

        const userId = await this.getUserId();
        if (this.joinStrategy) return this.joinStrategy.joinRoom(roomIdOrAlias, userId, apiCall);
        else return apiCall(roomIdOrAlias);
    }

    /**
     * Gets a list of joined room IDs
     * @returns {Promise<string[]>} resolves to a list of room IDs the client participates in
     */
    @timedMatrixClientFunctionCall()
    public getJoinedRooms(): Promise<string[]> {
        return this.doRequest("GET", "/_matrix/client/v3/joined_rooms").then(response => response['joined_rooms']);
    }

    /**
     * Gets the joined members in a room. The client must be in the room to make this request.
     * @param {string} roomId The room ID to get the joined members of.
     * @returns {Promise<string>} The joined user IDs in the room
     */
    @timedMatrixClientFunctionCall()
    public getJoinedRoomMembers(roomId: string): Promise<string[]> {
        return this.doRequest("GET", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/joined_members").then(response => {
            return Object.keys(response['joined']);
        });
    }

    /**
     * Gets the joined members in a room, as an object mapping userIds to profiles. The client must be in the room to make this request.
     * @param {string} roomId The room ID to get the joined members of.
     * @returns {Object} The joined user IDs in the room as an object mapped to a set of profiles.
     */
    @timedMatrixClientFunctionCall()
    public async getJoinedRoomMembersWithProfiles(roomId: string): Promise<{ [userId: string]: { display_name?: string, avatar_url?: string } }> {
        return (await this.doRequest("GET", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/joined_members")).joined;
    }

    /**
     * Gets the membership events of users in the room. Defaults to all membership
     * types, though this can be controlled with the membership and notMembership
     * arguments. To change the point in time, use the batchToken.
     * @param {string} roomId The room ID to get members in.
     * @param {string} batchToken The point in time to get members at (or null for 'now')
     * @param {string[]} membership The membership kinds to search for.
     * @param {string[]} notMembership The membership kinds to not search for.
     * @returns {Promise<MembershipEvent[]>} Resolves to the membership events of the users in the room.
     * @see getRoomMembersByMembership
     * @see getRoomMembersWithoutMembership
     * @see getAllRoomMembers
     */
    @timedMatrixClientFunctionCall()
    public getRoomMembers(roomId: string, batchToken: string = null, membership: Membership[] = null, notMembership: Membership[] = null): Promise<MembershipEvent[]> {
        if (!membership && !notMembership) {
            return this.getAllRoomMembers(roomId, batchToken);
        }

        return Promise.all([
            ...(membership ?? []).map(m => this.getRoomMembersAt(roomId, m, null, batchToken)),
            ...(notMembership ?? []).map(m => this.getRoomMembersAt(roomId, null, m, batchToken)),
        ]).then(r => r.reduce((p, c) => {
            p.push(...c);
            return p;
        }, [])).then(r => {
            // Shouldn't ever happen, but dedupe just in case.
            const vals = new Map<string, MembershipEvent>();
            for (const ev of r) {
                if (!vals.has(ev.membershipFor)) {
                    vals.set(ev.membershipFor, ev);
                }
            }
            return Array.from(vals.values());
        });
    }

    /**
     * Gets all room members in the room, optionally at a given point in time.
     * @param {string} roomId The room ID to get members of.
     * @param {string} atToken Optional batch token to get members at. Leave falsy for "now".
     * @returns {Promise<MembershipEvent[]>} Resolves to the member events in the room.
     */
    @timedMatrixClientFunctionCall()
    public getAllRoomMembers(roomId: string, atToken?: string): Promise<MembershipEvent[]> {
        return this.getRoomMembersAt(roomId, null, null, atToken);
    }

    /**
     * Gets the membership events of users in the room which have a particular membership type. To change
     * the point in time the server should return membership events at, use `atToken`.
     * @param {string} roomId The room ID to get members in.
     * @param {Membership} membership The membership to search for.
     * @param {string?} atToken Optional batch token to use, or null for "now".
     * @returns {Promise<MembershipEvent[]>} Resolves to the membership events of the users in the room.
     */
    @timedMatrixClientFunctionCall()
    public getRoomMembersByMembership(roomId: string, membership: Membership, atToken?: string): Promise<MembershipEvent[]> {
        return this.getRoomMembersAt(roomId, membership, null, atToken);
    }

    /**
     * Gets the membership events of users in the room which lack a particular membership type. To change
     * the point in time the server should return membership events at, use `atToken`.
     * @param {string} roomId The room ID to get members in.
     * @param {Membership} notMembership The membership to NOT search for.
     * @param {string?} atToken Optional batch token to use, or null for "now".
     * @returns {Promise<MembershipEvent[]>} Resolves to the membership events of the users in the room.
     */
    @timedMatrixClientFunctionCall()
    public async getRoomMembersWithoutMembership(roomId: string, notMembership: Membership, atToken?: string): Promise<MembershipEvent[]> {
        return this.getRoomMembersAt(roomId, null, notMembership, atToken);
    }

    private getRoomMembersAt(roomId: string, membership: Membership | null, notMembership: Membership | null, atToken: string | null): Promise<MembershipEvent[]> {
        const qs = {};
        if (atToken) qs["at"] = atToken;
        if (membership) qs["membership"] = membership;
        if (notMembership) qs["not_membership"] = notMembership;

        return this.doRequest("GET", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/members", qs).then(r => {
            return r['chunk'].map(e => new MembershipEvent(e));
        });
    }

    /**
     * Leaves the given room
     * @param {string} roomId the room ID to leave
     * @param {string=} reason Optional reason to be included as the reason for leaving the room.
     * @returns {Promise<any>} resolves when left
     */
    @timedMatrixClientFunctionCall()
    public leaveRoom(roomId: string, reason?: string): Promise<any> {
        return this.doRequest("POST", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/leave", null, { reason });
    }

    /**
     * Forgets the given room
     * @param {string} roomId the room ID to forget
     * @returns {Promise<{}>} Resolves when forgotten
     */
    @timedMatrixClientFunctionCall()
    public forgetRoom(roomId: string): Promise<{}> {
        return this.doRequest("POST", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/forget");
    }

    /**
     * Sends a read receipt for an event in a room
     * @param {string} roomId the room ID to send the receipt to
     * @param {string} eventId the event ID to set the receipt at
     * @returns {Promise<any>} resolves when the receipt has been sent
     */
    @timedMatrixClientFunctionCall()
    public sendReadReceipt(roomId: string, eventId: string): Promise<any> {
        return this.doRequest("POST", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/receipt/m.read/" + encodeURIComponent(eventId), null, {});
    }

    /**
     * Sets the typing status of the current user in a room
     * @param {string} roomId the room ID the user is typing in
     * @param {boolean} typing is the user currently typing
     * @param {number} timeout how long should the server preserve the typing state, in milliseconds
     * @returns {Promise<any>} resolves when the typing state has been set
     */
    @timedMatrixClientFunctionCall()
    public async setTyping(roomId: string, typing: boolean, timeout = 30000): Promise<any> {
        const userId = await this.getUserId();
        return this.doRequest("PUT", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/typing/" + encodeURIComponent(userId), null, {
            typing,
            timeout,
        });
    }

    /**
     * Replies to a given event with the given text. The event is sent with a msgtype of m.text.
     * The message will be encrypted if the client supports encryption and the room is encrypted.
     * @param {string} roomId the room ID to reply in
     * @param {any} event the event to reply to
     * @param {string} text the text to reply with
     * @param {string} html the HTML to reply with, or falsey to use the `text`
     * @returns {Promise<string>} resolves to the event ID which was sent
     */
    @timedMatrixClientFunctionCall()
    public replyText(roomId: string, event: any, text: string, html: string = null): Promise<string> {
        if (!html) html = htmlEncode(text);

        const reply = RichReply.createFor(roomId, event, text, html);
        return this.sendMessage(roomId, reply);
    }

    /**
     * Replies to a given event with the given HTML. The event is sent with a msgtype of m.text.
     * The message will be encrypted if the client supports encryption and the room is encrypted.
     * @param {string} roomId the room ID to reply in
     * @param {any} event the event to reply to
     * @param {string} html the HTML to reply with.
     * @returns {Promise<string>} resolves to the event ID which was sent
     */
    @timedMatrixClientFunctionCall()
    public replyHtmlText(roomId: string, event: any, html: string): Promise<string> {
        const text = htmlToText(html, { wordwrap: false });
        const reply = RichReply.createFor(roomId, event, text, html);
        return this.sendMessage(roomId, reply);
    }

    /**
     * Replies to a given event with the given text. The event is sent with a msgtype of m.notice.
     * The message will be encrypted if the client supports encryption and the room is encrypted.
     * @param {string} roomId the room ID to reply in
     * @param {any} event the event to reply to
     * @param {string} text the text to reply with
     * @param {string} html the HTML to reply with, or falsey to use the `text`
     * @returns {Promise<string>} resolves to the event ID which was sent
     */
    @timedMatrixClientFunctionCall()
    public replyNotice(roomId: string, event: any, text: string, html: string = null): Promise<string> {
        if (!html) html = htmlEncode(text);

        const reply = RichReply.createFor(roomId, event, text, html);
        reply['msgtype'] = 'm.notice';
        return this.sendMessage(roomId, reply);
    }

    /**
     * Replies to a given event with the given HTML. The event is sent with a msgtype of m.notice.
     * The message will be encrypted if the client supports encryption and the room is encrypted.
     * @param {string} roomId the room ID to reply in
     * @param {any} event the event to reply to
     * @param {string} html the HTML to reply with.
     * @returns {Promise<string>} resolves to the event ID which was sent
     */
    @timedMatrixClientFunctionCall()
    public replyHtmlNotice(roomId: string, event: any, html: string): Promise<string> {
        const text = htmlToText(html, { wordwrap: false });
        const reply = RichReply.createFor(roomId, event, text, html);
        reply['msgtype'] = 'm.notice';
        return this.sendMessage(roomId, reply);
    }

    /**
     * Sends a notice to the given room. The message will be encrypted if the client supports
     * encryption and the room is encrypted.
     * @param {string} roomId the room ID to send the notice to
     * @param {string} text the text to send
     * @returns {Promise<string>} resolves to the event ID that represents the message
     */
    @timedMatrixClientFunctionCall()
    public sendNotice(roomId: string, text: string): Promise<string> {
        return this.sendMessage(roomId, {
            body: text,
            msgtype: "m.notice",
        });
    }

    /**
     * Sends a notice to the given room with HTML content. The message will be encrypted if the client supports
     * encryption and the room is encrypted.
     * @param {string} roomId the room ID to send the notice to
     * @param {string} html the HTML to send
     * @returns {Promise<string>} resolves to the event ID that represents the message
     */
    @timedMatrixClientFunctionCall()
    public sendHtmlNotice(roomId: string, html: string): Promise<string> {
        return this.sendMessage(roomId, {
            body: htmlToText(html, { wordwrap: false }),
            msgtype: "m.notice",
            format: "org.matrix.custom.html",
            formatted_body: html,
        });
    }

    /**
     * Sends a text message to the given room. The message will be encrypted if the client supports
     * encryption and the room is encrypted.
     * @param {string} roomId the room ID to send the text to
     * @param {string} text the text to send
     * @returns {Promise<string>} resolves to the event ID that represents the message
     */
    @timedMatrixClientFunctionCall()
    public sendText(roomId: string, text: string): Promise<string> {
        return this.sendMessage(roomId, {
            body: text,
            msgtype: "m.text",
        });
    }

    /**
     * Sends a text message to the given room with HTML content. The message will be encrypted if the client supports
     * encryption and the room is encrypted.
     * @param {string} roomId the room ID to send the text to
     * @param {string} html the HTML to send
     * @returns {Promise<string>} resolves to the event ID that represents the message
     */
    @timedMatrixClientFunctionCall()
    public sendHtmlText(roomId: string, html: string): Promise<string> {
        return this.sendMessage(roomId, {
            body: htmlToText(html, { wordwrap: false }),
            msgtype: "m.text",
            format: "org.matrix.custom.html",
            formatted_body: html,
        });
    }

    /**
     * Sends a message to the given room. The message will be encrypted if the client supports
     * encryption and the room is encrypted.
     * @param {string} roomId the room ID to send the message to
     * @param {object} content the event content to send
     * @returns {Promise<string>} resolves to the event ID that represents the message
     */
    @timedMatrixClientFunctionCall()
    public sendMessage(roomId: string, content: any): Promise<string> {
        return this.sendEvent(roomId, "m.room.message", content);
    }

    /**
     * Sends an event to the given room. This will encrypt the event before sending if the room is
     * encrypted and the client supports encryption. Use sendRawEvent() to avoid this behaviour.
     * @param {string} roomId the room ID to send the event to
     * @param {string} eventType the type of event to send
     * @param {string} content the event body to send
     * @returns {Promise<string>} resolves to the event ID that represents the event
     */
    @timedMatrixClientFunctionCall()
    public async sendEvent(roomId: string, eventType: string, content: any): Promise<string> {
        if (await this.crypto?.isRoomEncrypted(roomId)) {
            content = await this.crypto.encryptRoomEvent(roomId, eventType, content);
            eventType = "m.room.encrypted";
        }
        return this.sendRawEvent(roomId, eventType, content);
    }

    /**
     * Sends an event to the given room.
     * @param {string} roomId the room ID to send the event to
     * @param {string} eventType the type of event to send
     * @param {string} content the event body to send
     * @returns {Promise<string>} resolves to the event ID that represents the event
     */
    @timedMatrixClientFunctionCall()
    public async sendRawEvent(roomId: string, eventType: string, content: any): Promise<string> {
        const txnId = (new Date().getTime()) + "__inc" + (++this.requestId);
        const path = "/_matrix/client/v3/rooms/"
            + encodeURIComponent(roomId) + "/send/"
            + encodeURIComponent(eventType) + "/"
            + encodeURIComponent(txnId);
        return this.doRequest("PUT", path, null, content).then(response => {
            return response['event_id'];
        });
    }

    /**
     * Sends a state event to the given room
     * @param {string} roomId the room ID to send the event to
     * @param {string} type the event type to send
     * @param {string} stateKey the state key to send, should not be null
     * @param {string} content the event body to send
     * @returns {Promise<string>} resolves to the event ID that represents the message
     */
    @timedMatrixClientFunctionCall()
    public sendStateEvent(roomId: string, type: string, stateKey: string, content: any): Promise<string> {
        const path = "/_matrix/client/v3/rooms/"
            + encodeURIComponent(roomId) + "/state/"
            + encodeURIComponent(type) + "/"
            + encodeURIComponent(stateKey);
        return this.doRequest("PUT", path, null, content).then(response => {
            return response['event_id'];
        });
    }

    /**
     * Redact an event in a given room
     * @param {string} roomId the room ID to send the redaction to
     * @param {string} eventId the event ID to redact
     * @param {String} reason an optional reason for redacting the event
     * @returns {Promise<string>} resolves to the event ID that represents the redaction
     */
    @timedMatrixClientFunctionCall()
    public redactEvent(roomId: string, eventId: string, reason: string | null = null): Promise<string> {
        const txnId = (new Date().getTime()) + "__inc" + (++this.requestId);
        const content = reason !== null ? { reason } : {};
        return this.doRequest("PUT", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/redact/${encodeURIComponent(eventId)}/${txnId}`, null, content).then(response => {
            return response['event_id'];
        });
    }

    /**
     * Creates a room. See the RoomCreateOptions interface
     * for more information on what to provide for `properties`. Note that creating
     * a room may cause the bot/appservice to raise a join event.
     * @param {RoomCreateOptions} properties the properties of the room.
     * @returns {Promise<string>} resolves to the room ID that represents the room
     */
    @timedMatrixClientFunctionCall()
    public createRoom(properties: RoomCreateOptions = {}): Promise<string> {
        return this.doRequest("POST", "/_matrix/client/v3/createRoom", null, properties).then(response => {
            return response['room_id'];
        });
    }

    /**
     * Checks if a given user has a required power level required to send the given event.
     * @param {string} userId the user ID to check the power level of
     * @param {string} roomId the room ID to check the power level in
     * @param {string} eventType the event type to look for in the `events` property of the power levels
     * @param {boolean} isState true to indicate the event is intended to be a state event
     * @returns {Promise<boolean>} resolves to true if the user has the required power level, resolves to false otherwise
     */
    @timedMatrixClientFunctionCall()
    public async userHasPowerLevelFor(userId: string, roomId: string, eventType: string, isState: boolean): Promise<boolean> {
        const powerLevelsEvent = await this.getRoomStateEvent(roomId, "m.room.power_levels", "");
        if (!powerLevelsEvent) {
            // This is technically supposed to be non-fatal, but it's pretty unreasonable for a room to be missing
            // power levels.
            throw new Error("No power level event found");
        }

        let requiredPower = isState ? 50 : 0;
        if (isState && Number.isFinite(powerLevelsEvent["state_default"])) requiredPower = powerLevelsEvent["state_default"];
        if (!isState && Number.isFinite(powerLevelsEvent["events_default"])) requiredPower = powerLevelsEvent["events_default"];
        if (Number.isFinite(powerLevelsEvent["events"]?.[eventType])) requiredPower = powerLevelsEvent["events"][eventType];

        let userPower = 0;
        if (Number.isFinite(powerLevelsEvent["users_default"])) userPower = powerLevelsEvent["users_default"];
        if (Number.isFinite(powerLevelsEvent["users"]?.[userId])) userPower = powerLevelsEvent["users"][userId];

        return userPower >= requiredPower;
    }

    /**
     * Checks if a given user has a required power level to perform the given action
     * @param {string} userId the user ID to check the power level of
     * @param {string} roomId the room ID to check the power level in
     * @param {PowerLevelAction} action the action to check power level for
     * @returns {Promise<boolean>} resolves to true if the user has the required power level, resolves to false otherwise
     */
    @timedMatrixClientFunctionCall()
    public async userHasPowerLevelForAction(userId: string, roomId: string, action: PowerLevelAction): Promise<boolean> {
        const powerLevelsEvent = await this.getRoomStateEvent(roomId, "m.room.power_levels", "");
        if (!powerLevelsEvent) {
            // This is technically supposed to be non-fatal, but it's pretty unreasonable for a room to be missing
            // power levels.
            throw new Error("No power level event found");
        }

        const defaultForActions: { [A in PowerLevelAction]: number } = {
            [PowerLevelAction.Ban]: 50,
            [PowerLevelAction.Invite]: 50,
            [PowerLevelAction.Kick]: 50,
            [PowerLevelAction.RedactEvents]: 50,
            [PowerLevelAction.NotifyRoom]: 50,
        };

        let requiredPower = defaultForActions[action];

        let investigate = powerLevelsEvent;
        action.split('.').forEach(k => (investigate = investigate?.[k]));
        if (Number.isFinite(investigate)) requiredPower = investigate;

        let userPower = 0;
        if (Number.isFinite(powerLevelsEvent["users_default"])) userPower = powerLevelsEvent["users_default"];
        if (Number.isFinite(powerLevelsEvent["users"]?.[userId])) userPower = powerLevelsEvent["users"][userId];

        return userPower >= requiredPower;
    }

    /**
     * Determines the boundary conditions for this client's ability to change another user's power level
     * in a given room. This will identify the maximum possible level this client can change the user to,
     * and if that change could even be possible. If the returned object indicates that the client can
     * change the power level of the user, the client is able to set the power level to any value equal
     * to or less than the maximum value.
     * @param {string} targetUserId The user ID to compare against.
     * @param {string} roomId The room ID to compare within.
     * @returns {Promise<PowerLevelBounds>} The bounds of the client's ability to change the user's power level.
     */
    @timedMatrixClientFunctionCall()
    public async calculatePowerLevelChangeBoundsOn(targetUserId: string, roomId: string): Promise<PowerLevelBounds> {
        const myUserId = await this.getUserId();

        const canChangePower = await this.userHasPowerLevelFor(myUserId, roomId, "m.room.power_levels", true);
        if (!canChangePower) return { canModify: false, maximumPossibleLevel: 0 };

        const powerLevelsEvent = await this.getRoomStateEvent(roomId, "m.room.power_levels", "");
        if (!powerLevelsEvent) {
            throw new Error("No power level event found");
        }

        let targetUserPower = 0;
        let myUserPower = 0;
        if (powerLevelsEvent["users"] && powerLevelsEvent["users"][targetUserId]) targetUserPower = powerLevelsEvent["users"][targetUserId];
        if (powerLevelsEvent["users"] && powerLevelsEvent["users"][myUserId]) myUserPower = powerLevelsEvent["users"][myUserId];

        if (myUserId === targetUserId) {
            return { canModify: true, maximumPossibleLevel: myUserPower };
        }

        if (targetUserPower >= myUserPower) {
            return { canModify: false, maximumPossibleLevel: myUserPower };
        }

        return { canModify: true, maximumPossibleLevel: myUserPower };
    }

    /**
     * Sets the power level for a given user ID in the given room. Note that this is not safe to
     * call multiple times concurrently as changes are not atomic. This will throw an error if
     * the user lacks enough permission to change the power level, or if a power level event is
     * missing from the room.
     * @param {string} userId The user ID to change
     * @param {string} roomId The room ID to change the power level in
     * @param {number} newLevel The integer power level to set the user to.
     * @returns {Promise<any>} Resolves when complete.
     */
    @timedMatrixClientFunctionCall()
    public async setUserPowerLevel(userId: string, roomId: string, newLevel: number): Promise<any> {
        const currentLevels = await this.getRoomStateEvent(roomId, "m.room.power_levels", "");
        if (!currentLevels['users']) currentLevels['users'] = {};
        currentLevels['users'][userId] = newLevel;
        await this.sendStateEvent(roomId, "m.room.power_levels", "", currentLevels);
    }

    /**
     * Converts a MXC URI to an HTTP URL.
     * @param {string} mxc The MXC URI to convert
     * @returns {string} The HTTP URL for the content.
     */
    public mxcToHttp(mxc: string): string {
        if (!mxc.startsWith("mxc://")) throw new Error("Not a MXC URI");
        const parts = mxc.substring("mxc://".length).split('/');
        const originHomeserver = parts[0];
        const mediaId = parts.slice(1, parts.length).join('/');
        return `${this.homeserverUrl}/_matrix/media/v3/download/${encodeURIComponent(originHomeserver)}/${encodeURIComponent(mediaId)}`;
    }

    /**
     * Converts a MXC URI to an HTTP URL for downsizing the content.
     * @param {string} mxc The MXC URI to convert and downsize.
     * @param {number} width The width, as an integer, for the thumbnail.
     * @param {number} height The height, as an intenger, for the thumbnail.
     * @param {"crop"|"scale"} method Whether to crop or scale (preserve aspect ratio) the content.
     * @returns {string} The HTTP URL for the downsized content.
     */
    public mxcToHttpThumbnail(mxc: string, width: number, height: number, method: "crop" | "scale"): string {
        const downloadUri = this.mxcToHttp(mxc);
        return downloadUri.replace("/_matrix/media/v3/download", "/_matrix/media/v3/thumbnail")
            + `?width=${width}&height=${height}&method=${encodeURIComponent(method)}`;
    }

    /**
     * Uploads data to the homeserver's media repository. Note that this will <b>not</b> automatically encrypt
     * media as it cannot determine if the media should be encrypted.
     * @param {Buffer} data the content to upload.
     * @param {string} contentType the content type of the file. Defaults to application/octet-stream
     * @param {string} filename the name of the file. Optional.
     * @returns {Promise<string>} resolves to the MXC URI of the content
     */
    @timedMatrixClientFunctionCall()
    public uploadContent(data: Buffer, contentType = "application/octet-stream", filename: string = null): Promise<string> {
        // TODO: Make doRequest take an object for options
        return this.doRequest("POST", "/_matrix/media/v3/upload", { filename: filename }, data, 60000, false, contentType)
            .then(response => response["content_uri"]);
    }

    /**
     * Download content from the homeserver's media repository. Note that this will <b>not</b> automatically decrypt
     * media as it cannot determine if the media is encrypted.
     * @param {string} mxcUrl The MXC URI for the content.
     * @param {string} allowRemote Indicates to the server that it should not attempt to fetch the
     * media if it is deemed remote. This is to prevent routing loops where the server contacts itself.
     * Defaults to true if not provided.
     * @returns {Promise<{data: Buffer, contentType: string}>} Resolves to the downloaded content.
     */
    public async downloadContent(mxcUrl: string, allowRemote = true): Promise<{ data: Buffer, contentType: string }> {
        if (!mxcUrl.toLowerCase().startsWith("mxc://")) {
            throw Error("'mxcUrl' does not begin with mxc://");
        }
        const urlParts = mxcUrl.substr("mxc://".length).split("/");
        const domain = encodeURIComponent(urlParts[0]);
        const mediaId = encodeURIComponent(urlParts[1].split("/")[0]);
        const path = `/_matrix/media/v3/download/${domain}/${mediaId}`;
        const res = await this.doRequest("GET", path, { allow_remote: allowRemote }, null, null, true, null, true);
        return {
            data: res.body,
            contentType: res.headers["content-type"],
        };
    }

    /**
     * Uploads data to the homeserver's media repository after downloading it from the
     * provided URL.
     * @param {string} url The URL to download content from.
     * @returns {Promise<string>} Resolves to the MXC URI of the content
     */
    @timedMatrixClientFunctionCall()
    public uploadContentFromUrl(url: string): Promise<string> {
        return new Promise<{ body: Buffer, contentType: string }>((resolve, reject) => {
            const requestId = ++this.requestId;
            const params = {
                uri: url,
                method: "GET",
                encoding: null,
            };
            getRequestFn()(params, (err, response, resBody) => {
                if (err) {
                    LogService.error("MatrixClientLite", "(REQ-" + requestId + ")", extractRequestError(err));
                    reject(err);
                } else {
                    const contentType = response.headers['content-type'] || "application/octet-stream";

                    LogService.trace("MatrixClientLite", "(REQ-" + requestId + " RESP-H" + response.statusCode + ")", "<data>");
                    if (response.statusCode < 200 || response.statusCode >= 300) {
                        LogService.error("MatrixClientLite", "(REQ-" + requestId + ")", "<data>");
                        reject(response);
                    } else resolve({ body: resBody, contentType: contentType });
                }
            });
        }).then(obj => {
            return this.uploadContent(obj.body, obj.contentType);
        });
    }

    /**
     * Determines the upgrade history for a given room as a doubly-linked list styled structure. Given
     * a room ID in the history of upgrades, the resulting `previous` array will hold any rooms which
     * are older than the given room. The resulting `newer` array will hold any rooms which are newer
     * versions of the room. Both arrays will be defined, but may be empty individually. Element zero
     * of each will always be the nearest to the given room ID and the last element will be the furthest
     * from the room. The given room will never be in either array.
     * @param {string} roomId the room ID to get the history of
     * @returns {Promise<{previous: RoomReference[], newer: RoomReference[]}>} Resolves to the room's
     * upgrade history
     */
    @timedMatrixClientFunctionCall()
    public async getRoomUpgradeHistory(roomId: string): Promise<{ previous: RoomReference[], newer: RoomReference[], current: RoomReference }> {
        const result = { previous: [], newer: [], current: null };

        const chaseCreates = async (findRoomId) => {
            try {
                const createEvent = await this.getRoomStateEvent(findRoomId, "m.room.create", "");
                if (!createEvent) return;

                if (findRoomId === roomId && !result.current) {
                    const version = createEvent['room_version'] || '1';
                    result.current = {
                        roomId: roomId,
                        version: version,
                        refEventId: null,
                    };
                }

                if (createEvent['predecessor'] && createEvent['predecessor']['room_id']) {
                    const prevRoomId = createEvent['predecessor']['room_id'];
                    if (prevRoomId === findRoomId) return; // Recursion is bad
                    if (result.previous.find(r => r.roomId === prevRoomId)) return; // Already found

                    let tombstoneEventId = null;
                    let prevVersion = "1";
                    try {
                        const roomState = await this.getRoomState(prevRoomId);
                        const tombstone = roomState.find(e => e['type'] === 'm.room.tombstone' && e['state_key'] === '');
                        const create = roomState.find(e => e['type'] === 'm.room.create' && e['state_key'] === '');

                        if (tombstone) {
                            if (!tombstone['content']) tombstone['content'] = {};
                            const tombstoneRefRoomId = tombstone['content']['replacement_room'];
                            if (tombstoneRefRoomId === findRoomId) tombstoneEventId = tombstone['event_id'];
                        }

                        if (create) {
                            if (!create['content']) create['content'] = {};
                            prevVersion = create['content']['room_version'] || "1";
                        }
                    } catch (e) {
                        // state not available
                    }

                    result.previous.push({
                        roomId: prevRoomId,
                        version: prevVersion,
                        refEventId: tombstoneEventId,
                    });

                    return chaseCreates(prevRoomId);
                }
            } catch (e) {
                // no create event - that's fine
            }
        };

        const chaseTombstones = async (findRoomId) => {
            try {
                const tombstoneEvent = await this.getRoomStateEvent(findRoomId, "m.room.tombstone", "");
                if (!tombstoneEvent) return;
                if (!tombstoneEvent['replacement_room']) return;

                const newRoomId = tombstoneEvent['replacement_room'];
                if (newRoomId === findRoomId) return; // Recursion is bad
                if (result.newer.find(r => r.roomId === newRoomId)) return; // Already found

                let newRoomVersion = "1";
                let createEventId = null;
                try {
                    const roomState = await this.getRoomState(newRoomId);
                    const create = roomState.find(e => e['type'] === 'm.room.create' && e['state_key'] === '');

                    if (create) {
                        if (!create['content']) create['content'] = {};

                        const predecessor = create['content']['predecessor'] || {};
                        const refPrevRoomId = predecessor['room_id'];
                        if (refPrevRoomId === findRoomId) {
                            createEventId = create['event_id'];
                        }

                        newRoomVersion = create['content']['room_version'] || "1";
                    }
                } catch (e) {
                    // state not available
                }

                result.newer.push({
                    roomId: newRoomId,
                    version: newRoomVersion,
                    refEventId: createEventId,
                });

                return await chaseTombstones(newRoomId);
            } catch (e) {
                // no tombstone - that's fine
            }
        };

        await chaseCreates(roomId);
        await chaseTombstones(roomId);
        return result;
    }

    /**
     * Creates a Space room.
     * @param {SpaceCreateOptions} opts The creation options.
     * @returns {Promise<Space>} Resolves to the created space.
     */
    @timedMatrixClientFunctionCall()
    public async createSpace(opts: SpaceCreateOptions): Promise<Space> {
        const roomCreateOpts: RoomCreateOptions = {
            name: opts.name,
            topic: opts.topic || "",
            preset: opts.isPublic ? "public_chat" : "private_chat",
            room_alias_name: opts.localpart,
            initial_state: [
                {
                    type: "m.room.history_visibility",
                    state_key: "",
                    content: {
                        history_visibility: opts.isPublic ? 'world_readable' : 'shared',
                    },
                },
            ],
            creation_content: {
                type: "m.space",
            },
            invite: opts.invites || [],
            power_level_content_override: {
                ban: 100,
                events_default: 50,
                invite: 50,
                kick: 100,
                notifications: {
                    room: 100,
                },
                redact: 100,
                state_default: 100,
                users: {
                    [await this.getUserId()]: 100,
                },
                users_default: 0,
            },
        };
        if (opts.avatarUrl) {
            roomCreateOpts.initial_state.push({
                type: 'm.room.avatar',
                state_key: "",
                content: {
                    url: opts.avatarUrl,
                },
            });
        }
        const roomId = await this.createRoom(roomCreateOpts);
        return new Space(roomId, this);
    }

    /**
     * Gets a Space.
     * This API does not work with unstable spaces (e.g. org.matrix.msc.1772.space)
     *
     * @throws If the room is not a space or there was an error
     * @returns {Promise<Space>} Resolves to the space.
     */
    @timedMatrixClientFunctionCall()
    public async getSpace(roomIdOrAlias: string): Promise<Space> {
        const roomId = await this.resolveRoom(roomIdOrAlias);
        const createEvent = await this.getRoomStateEvent(roomId, "m.room.create", "");
        if (createEvent["type"] !== "m.space") {
            throw new Error("Room is not a space");
        }
        return new Space(roomId, this);
    }

    /**
     * Uploads One Time Keys for the current device.
     * @param {OTKs} keys The keys to upload.
     * @returns {Promise<OTKCounts>} Resolves to the current One Time Key counts when complete.
     */
    @timedMatrixClientFunctionCall()
    @requiresCrypto()
    public async uploadDeviceOneTimeKeys(keys: OTKs): Promise<OTKCounts> {
        return this.doRequest("POST", "/_matrix/client/v3/keys/upload", null, {
            one_time_keys: keys,
        }).then(r => r['one_time_key_counts']);
    }

    /**
     * Gets the current One Time Key counts.
     * @returns {Promise<OTKCounts>} Resolves to the One Time Key counts.
     */
    @timedMatrixClientFunctionCall()
    @requiresCrypto()
    public async checkOneTimeKeyCounts(): Promise<OTKCounts> {
        return this.doRequest("POST", "/_matrix/client/v3/keys/upload", null, {})
            .then(r => r['one_time_key_counts']);
    }

    /**
     * Uploads a fallback One Time Key to the server for usage. This will replace the existing fallback
     * key.
     * @param {FallbackKey} fallbackKey The fallback key.
     * @returns {Promise<OTKCounts>} Resolves to the One Time Key counts.
     */
    @timedMatrixClientFunctionCall()
    @requiresCrypto()
    public async uploadFallbackKey(fallbackKey: FallbackKey): Promise<OTKCounts> {
        const keyObj = {
            [`${OTKAlgorithm.Signed}:${fallbackKey.keyId}`]: fallbackKey.key,
        };
        return this.doRequest("POST", "/_matrix/client/v3/keys/upload", null, {
            "org.matrix.msc2732.fallback_keys": keyObj,
            "fallback_keys": keyObj,
        }).then(r => r['one_time_key_counts']);
    }

    /**
     * Gets <b>unverified</b> device lists for the given users. The caller is expected to validate
     * and verify the device lists, including that the returned devices belong to the claimed users.
     *
     * Failures with federation are reported in the returned object. Users which did not fail a federation
     * lookup but have no devices will not appear in either the failures or in the returned devices.
     *
     * See https://matrix.org/docs/spec/client_server/r0.6.1#post-matrix-client-r0-keys-query for more
     * information.
     * @param {string[]} userIds The user IDs to query.
     * @param {number} federationTimeoutMs The default timeout for requesting devices over federation. Defaults to
     * 10 seconds.
     * @returns {Promise<MultiUserDeviceListResponse>} Resolves to the device list/errors for the requested user IDs.
     */
    @timedMatrixClientFunctionCall()
    public async getUserDevices(userIds: string[], federationTimeoutMs = 10000): Promise<MultiUserDeviceListResponse> {
        const req = {};
        for (const userId of userIds) {
            req[userId] = [];
        }
        return this.doRequest("POST", "/_matrix/client/v3/keys/query", {}, {
            timeout: federationTimeoutMs,
            device_keys: req,
        });
    }

    /**
     * Gets a device list for the client's own account, with metadata. The devices are not verified
     * in this response, but should be active on the account.
     * @returns {Promise<OwnUserDevice[]>} Resolves to the active devices on the account.
     */
    @timedMatrixClientFunctionCall()
    public async getOwnDevices(): Promise<OwnUserDevice[]> {
        return this.doRequest("GET", "/_matrix/client/v3/devices").then(r => {
            return r['devices'];
        });
    }

    /**
     * Claims One Time Keys for a set of user devices, returning those keys. The caller is expected to verify
     * and validate the returned keys.
     *
     * Failures with federation are reported in the returned object.
     * @param {Record<string, Record<string, OTKAlgorithm>>} userDeviceMap The map of user IDs to device IDs to
     * OTKAlgorithm to request a claim for.
     * @param {number} federationTimeoutMs The default timeout for claiming keys over federation. Defaults to
     * 10 seconds.
     */
    @timedMatrixClientFunctionCall()
    @requiresCrypto()
    public async claimOneTimeKeys(userDeviceMap: Record<string, Record<string, OTKAlgorithm>>, federationTimeoutMs = 10000): Promise<OTKClaimResponse> {
        return this.doRequest("POST", "/_matrix/client/v3/keys/claim", {}, {
            timeout: federationTimeoutMs,
            one_time_keys: userDeviceMap,
        });
    }

    /**
     * Sends to-device messages to the respective users/devices.
     * @param {string} type The message type being sent.
     * @param {Record<string, Record<string, any>>} messages The messages to send, mapped as user ID to
     * device ID (or "*" to denote all of the user's devices) to message payload (content).
     * @returns {Promise<void>} Resolves when complete.
     */
    @timedMatrixClientFunctionCall()
    public async sendToDevices(type: string, messages: Record<string, Record<string, any>>): Promise<void> {
        const txnId = (new Date().getTime()) + "_TDEV__inc" + (++this.requestId);
        return this.doRequest("PUT", `/_matrix/client/v3/sendToDevice/${encodeURIComponent(type)}/${encodeURIComponent(txnId)}`, null, {
            messages: messages,
        });
    }

    /**
     * Get relations for a given event.
     * @param {string} roomId The room ID to for the given event.
     * @param {string} eventId The event ID to list relations for.
     * @param {string?} relationType The type of relations (e.g. `m.room.member`) to filter for. Optional.
     * @param {string?} eventType The type of event to look for (e.g. `m.room.member`). Optional.
     * @returns {Promise<{chunk: any[]}>} Resolves to an object containing the chunk of relations
     */
    @timedMatrixClientFunctionCall()
    public async getRelationsForEvent(roomId: string, eventId: string, relationType?: string, eventType?: string): Promise<{ chunk: any[] }> {
        let url = `/_matrix/client/v1/rooms/${encodeURIComponent(roomId)}/relations/${encodeURIComponent(eventId)}`;
        if (relationType) {
            url += `/${relationType}`;
        }
        if (eventType) {
            url += `/${eventType}`;
        }
        return this.doRequest("GET", url);
    }

    /**
     * Performs a web request to the homeserver, applying appropriate authorization headers for
     * this client.
     * @param {"GET"|"POST"|"PUT"|"DELETE"} method The HTTP method to use in the request
     * @param {string} endpoint The endpoint to call. For example: "/_matrix/client/v3/account/whoami"
     * @param {any} qs The query string to send. Optional.
     * @param {any} body The request body to send. Optional. Will be converted to JSON unless the type is a Buffer.
     * @param {number} timeout The number of milliseconds to wait before timing out.
     * @param {boolean} raw If true, the raw response will be returned instead of the response body.
     * @param {string} contentType The content type to send. Only used if the `body` is a Buffer.
     * @param {string} noEncoding Set to true to disable encoding, and return a Buffer. Defaults to false
     * @returns {Promise<any>} Resolves to the response (body), rejected if a non-2xx status code was returned.
     */
    @timedMatrixClientFunctionCall()
    public doRequest(method, endpoint, qs = null, body = null, timeout = 60000, raw = false, contentType = "application/json", noEncoding = false): Promise<any> {
        if (this.impersonatedUserId) {
            if (!qs) qs = { "user_id": this.impersonatedUserId };
            else qs["user_id"] = this.impersonatedUserId;
        }
        if (this.impersonatedDeviceId) {
            if (!qs) qs = { "org.matrix.msc3202.device_id": this.impersonatedDeviceId };
            else qs["org.matrix.msc3202.device_id"] = this.impersonatedDeviceId;
        }
        const headers = {};
        if (this.accessToken) {
            headers["Authorization"] = `Bearer ${this.accessToken}`;
        }
        return doHttpRequest(this.homeserverUrl, method, endpoint, qs, body, headers, timeout, raw, contentType, noEncoding);
    }
}

export interface RoomDirectoryLookupResponse {
    roomId: string;
    residentServers: string[];
}

export interface RoomReference {
    /**
     * The room ID being referenced
     */
    roomId: string;

    /**
     * The version of the room at the time
     */
    version: string;

    /**
     * If going backwards, the tombstone event ID, otherwise the creation
     * event. If the room can't be verified, this will be null. Will be
     * null if this reference is to the current room.
     */
    refEventId: string;
}

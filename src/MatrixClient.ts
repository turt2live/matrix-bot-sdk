import { EventEmitter } from "events";
import { IStorageProvider } from "./storage/IStorageProvider";
import { MemoryStorageProvider } from "./storage/MemoryStorageProvider";
import { IJoinRoomStrategy } from "./strategies/JoinRoomStrategy";
import { UnstableApis } from "./UnstableApis";
import { IPreprocessor } from "./preprocessors/IPreprocessor";
import { getRequestFn } from "./request";
import { LogLevel, LogService } from "./logging/LogService";
import { htmlEncode } from "htmlencode";
import { RichReply } from "./helpers/RichReply";
import { Metrics } from "./metrics/Metrics";
import { timedMatrixClientFunctionCall } from "./metrics/decorators";
import { AdminApis } from "./AdminApis";
import { Presence } from "./models/Presence";
import { Membership, MembershipEvent } from "./models/events/MembershipEvent";
import { RoomEvent, RoomEventContent, StateEvent } from "./models/events/RoomEvent";
import { EventContext } from "./models/EventContext";

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
    public syncingPresence: "online" | "offline" | "unavailable" | null = null;

    /**
     * The number of milliseconds to wait for new events for on the next sync.
     *
     * Has no effect if the client is not syncing. Does not apply until the next sync request.
     */
    public syncingTimeout = 10000;

    private userId: string;
    private requestId = 0;
    private lastJoinedRoomIds: string[] = [];
    private impersonatedUserId: string;
    private joinStrategy: IJoinRoomStrategy = null;
    private eventProcessors: { [eventType: string]: IPreprocessor[] } = {};
    private filterId = 0;
    private stopSyncing = false;
    private metricsInstance: Metrics = new Metrics();

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
     */
    constructor(public readonly homeserverUrl: string, public readonly accessToken: string, private storage: IStorageProvider = null) {
        super();

        if (this.homeserverUrl.endsWith("/")) {
            this.homeserverUrl = this.homeserverUrl.substring(0, this.homeserverUrl.length - 1);
        }

        if (!this.storage) this.storage = new MemoryStorageProvider();
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
        return new UnstableApis(this);
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
     * @param {string} userId The user ID to masquerade as
     */
    public impersonateUserId(userId: string): void {
        this.impersonatedUserId = userId;
        this.userId = userId;
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
            await processor.processEvent(event, this);
        }

        return event;
    }

    /**
     * Retrieves content from account data.
     * @param {string} eventType The type of account data to retrieve.
     * @returns {Promise<any>} Resolves to the content of that account data.
     */
    @timedMatrixClientFunctionCall()
    public async getAccountData(eventType: string): Promise<any> {
        const userId = encodeURIComponent(await this.getUserId());
        eventType = encodeURIComponent(eventType);
        return this.doRequest("GET", "/_matrix/client/r0/user/" + userId + "/account_data/" + eventType);
    }

    /**
     * Retrieves content from room account data.
     * @param {string} eventType The type of room account data to retrieve.
     * @param {string} roomId The room to read the account data from
     * @returns {Promise<any>} Resolves to the content of that account data.
     */
    @timedMatrixClientFunctionCall()
    public async getRoomAccountData(eventType: string, roomId: string): Promise<any> {
        const userId = encodeURIComponent(await this.getUserId());
        eventType = encodeURIComponent(eventType);
        roomId = encodeURIComponent(roomId);
        return this.doRequest("GET", "/_matrix/client/r0/user/" + userId + "/rooms/" + roomId + "/account_data/" + eventType);
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
        return this.doRequest("PUT", "/_matrix/client/r0/user/" + userId + "/account_data/" + eventType, null, content);
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
        return this.doRequest("PUT", "/_matrix/client/r0/user/" + userId + "/rooms/" + roomId + "/account_data/" + eventType, null, content);
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
        return this.doRequest("GET", "/_matrix/client/r0/presence/" + encodeURIComponent(userId) + "/status").then(r => new Presence(r));
    }

    /**
     * Sets the presence status for the current user.
     * @param {"online"|"offline"|"unavailable"} presence The new presence state for the user.
     * @param {string} statusMessage Optional status message to include with the presence.
     * @returns {Promise<any>} Resolves when complete.
     */
    @timedMatrixClientFunctionCall()
    public async setPresenceStatus(presence: "online" | "offline" | "unavailable", statusMessage: string = null): Promise<any> {
        return this.doRequest("PUT", "/_matrix/client/r0/presence/" + encodeURIComponent(await this.getUserId()) + "/status", null, {
            presence: presence,
            status_msg: statusMessage,
        });
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
        return this.doRequest("PUT", "/_matrix/client/r0/directory/room/" + alias, null, {
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
        return this.doRequest("DELETE", "/_matrix/client/r0/directory/room/" + alias);
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
        return this.doRequest("PUT", "/_matrix/client/r0/directory/list/room/" + roomId, null, {
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
        return this.doRequest("GET", "/_matrix/client/r0/directory/list/room/" + roomId).then(response => {
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
        return this.doRequest("GET", "/_matrix/client/r0/directory/room/" + encodeURIComponent(roomAlias)).then(response => {
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
        return this.doRequest("POST", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/invite", null, {
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
        return this.doRequest("POST", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/kick", null, {
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
        return this.doRequest("POST", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/ban", null, {
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
        return this.doRequest("POST", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/unban", null, {
            user_id: userId,
        });
    }

    /**
     * Gets the current user ID for this client
     * @returns {Promise<string>} The user ID of this client
     */
    @timedMatrixClientFunctionCall()
    public getUserId(): Promise<string> {
        if (this.userId) return Promise.resolve(this.userId);

        return this.doRequest("GET", "/_matrix/client/r0/account/whoami").then(response => {
            this.userId = response["user_id"];
            return this.userId;
        });
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
    public start(filter: any = null): Promise<any> {
        this.stopSyncing = false;
        if (!filter || typeof (filter) !== "object") {
            LogService.debug("MatrixClientLite", "No filter given or invalid object - using defaults.");
            filter = null;
        }

        return this.getUserId().then(async userId => {
            let createFilter = false;

            let existingFilter = await Promise.resolve(this.storage.getFilter());
            if (existingFilter) {
                LogService.debug("MatrixClientLite", "Found existing filter. Checking consistency with given filter");
                if (JSON.stringify(existingFilter.filter) === JSON.stringify(filter)) {
                    LogService.debug("MatrixClientLite", "Filters match");
                    this.filterId = existingFilter.id;
                } else {
                    createFilter = true;
                }
            } else {
                createFilter = true;
            }

            if (createFilter && filter) {
                LogService.debug("MatrixClientLite", "Creating new filter");
                return this.doRequest("POST", "/_matrix/client/r0/user/" + encodeURIComponent(userId) + "/filter", null, filter).then(async response => {
                    this.filterId = response["filter_id"];
                    await Promise.resolve(this.storage.setSyncToken(null));
                    await Promise.resolve(this.storage.setFilter({
                        id: this.filterId,
                        filter: filter,
                    }));
                });
            }
        }).then(async () => {
            LogService.debug("MatrixClientLite", "Populating joined rooms to avoid excessive join emits");
            this.lastJoinedRoomIds = await this.getJoinedRooms();

            LogService.debug("MatrixClientLite", "Starting sync with filter ID " + this.filterId);
            this.startSyncInternal();
        });
    }

    protected startSyncInternal(): Promise<any> {
        return this.startSync();
    }

    protected async startSync(emitFn: (emitEventType: string, ...payload: any[]) => Promise<any> = null) {
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

                LogService.info("MatrixClientLite", "Received sync. Next token: " + token);
                await this.processSync(response, emitFn);

                if (this.persistTokenAfterSync) {
                    await Promise.resolve(this.storage.setSyncToken(token));
                }
            } catch (e) {
                LogService.error("MatrixClientLite", e);
            }

            return promiseWhile();
        };

        promiseWhile(); // start the loop
    }

    @timedMatrixClientFunctionCall()
    protected doSync(token: string): Promise<any> {
        LogService.info("MatrixClientLite", "Performing sync with token " + token);
        const conf = {
            full_state: false,
            timeout: Math.max(0, this.syncingTimeout),
        };
        // synapse complains if the variables are null, so we have to have it unset instead
        if (token) conf["since"] = token;
        if (this.filterId) conf['filter'] = this.filterId;
        if (this.syncingPresence) conf['presence'] = this.syncingPresence;

        // timeout is 30s if we have a token, otherwise 10min
        return this.doRequest("GET", "/_matrix/client/r0/sync", conf, null, (token ? 30000 : 600000));
    }

    @timedMatrixClientFunctionCall()
    protected async processSync(raw: any, emitFn: (emitEventType: string, ...payload: any[]) => Promise<any> = null): Promise<any> {
        if (!emitFn) emitFn = (e, ...p) => Promise.resolve<any>(this.emit(e, ...p));

        if (!raw) return; // nothing to process

        if (raw['account_data'] && raw['account_data']['events']) {
            for (const event of raw['account_data']['events']) {
                await emitFn("account_data", event);
            }
        }

        if (!raw['rooms']) return; // nothing more to process

        let leftRooms = raw['rooms']['leave'] || {};
        let inviteRooms = raw['rooms']['invite'] || {};
        let joinedRooms = raw['rooms']['join'] || {};

        // Process rooms we've left first
        for (let roomId in leftRooms) {
            const room = leftRooms[roomId];

            if (room['account_data'] && room['account_data']['events']) {
                for (const event of room['account_data']['events']) {
                    await emitFn("room.account_data", roomId, event);
                }
            }

            if (!room['timeline'] || !room['timeline']['events']) continue;

            let leaveEvent = null;
            for (let event of room['timeline']['events']) {
                if (event['type'] !== 'm.room.member') continue;
                if (event['state_key'] !== await this.getUserId()) continue;

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
        for (let roomId in inviteRooms) {
            const room = inviteRooms[roomId];
            if (!room['invite_state'] || !room['invite_state']['events']) continue;

            let inviteEvent = null;
            for (let event of room['invite_state']['events']) {
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
        for (let roomId in joinedRooms) {
            if (this.lastJoinedRoomIds.indexOf(roomId) === -1) {
                await emitFn("room.join", roomId);
                this.lastJoinedRoomIds.push(roomId);
            }

            const room = joinedRooms[roomId];

            if (room['account_data'] && room['account_data']['events']) {
                for (const event of room['account_data']['events']) {
                    await emitFn("room.account_data", roomId, event);
                }
            }

            if (!room['timeline'] || !room['timeline']['events']) continue;

            for (let event of room['timeline']['events']) {
                event = await this.processEvent(event);
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
     * Gets an event for a room. Returned as a raw event.
     * @param {string} roomId the room ID to get the event in
     * @param {string} eventId the event ID to look up
     * @returns {Promise<any>} resolves to the found event
     */
    @timedMatrixClientFunctionCall()
    public getEvent(roomId: string, eventId: string): Promise<any> {
        return this.doRequest("GET", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/event/" + encodeURIComponent(eventId))
            .then(ev => this.processEvent(ev));
    }

    /**
     * Gets the room state for the given room. Returned as raw events.
     * @param {string} roomId the room ID to get state for
     * @returns {Promise<any[]>} resolves to the room's state
     */
    @timedMatrixClientFunctionCall()
    public getRoomState(roomId: string): Promise<any[]> {
        return this.doRequest("GET", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/state")
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
        return this.doRequest("GET", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/state/" + encodeURIComponent(type) + "/" + encodeURIComponent(stateKey ? stateKey : ''))
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
        const res = await this.doRequest("GET", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/context/" + encodeURIComponent(eventId), {limit});
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
        return this.doRequest("GET", "/_matrix/client/r0/profile/" + encodeURIComponent(userId));
    }

    /**
     * Sets a new display name for the user.
     * @param {string} displayName the new display name for the user, or null to clear
     * @returns {Promise<any>} resolves when complete
     */
    @timedMatrixClientFunctionCall()
    public async setDisplayName(displayName: string): Promise<any> {
        const userId = encodeURIComponent(await this.getUserId());
        return this.doRequest("PUT", "/_matrix/client/r0/profile/" + userId + "/displayname", null, {
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
        return this.doRequest("PUT", "/_matrix/client/r0/profile/" + userId + "/avatar_url", null, {
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
            return this.doRequest("POST", "/_matrix/client/r0/join/" + targetIdOrAlias, qs).then(response => {
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
        return this.doRequest("GET", "/_matrix/client/r0/joined_rooms").then(response => response['joined_rooms']);
    }

    /**
     * Gets the joined members in a room. The client must be in the room to make this request.
     * @param {string} roomId The room ID to get the joined members of.
     * @returns {Promise<string>} The joined user IDs in the room
     */
    @timedMatrixClientFunctionCall()
    public getJoinedRoomMembers(roomId: string): Promise<string[]> {
        return this.doRequest("GET", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/joined_members").then(response => {
            return Object.keys(response['joined']);
        });
    }

    /**
     * Gets the membership events of users in the room. Defaults to all membership
     * types, though this can be controlled with the membership and notMembership
     * arguments. To change the point in time, use the batchToken.
     * @param {string} roomId The room ID to get members in.
     * @param {string} batchToken The point in time to get members at (or null for 'now')
     * @param {string[]} membership The membership kinds to search for.
     * @param {string[]} notMembership The membership kinds to not search for.
     * @returns {Promise<any[]>} Resolves to the membership events of the users in the room.
     */
    public getRoomMembers(roomId: string, batchToken: string = null, membership: Membership[] = null, notMembership: Membership[] = null): Promise<MembershipEvent[]> {
        const qs = {};
        if (batchToken) qs["at"] = batchToken;
        if (membership) qs["membership"] = membership;
        if (notMembership) qs["not_membership"] = notMembership;

        return this.doRequest("GET", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/members", qs).then(r => {
            return r['chunk'].map(e => new MembershipEvent(e));
        });
    }

    /**
     * Leaves the given room
     * @param {string} roomId the room ID to leave
     * @returns {Promise<any>} resolves when left
     */
    @timedMatrixClientFunctionCall()
    public leaveRoom(roomId: string): Promise<any> {
        return this.doRequest("POST", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/leave");
    }

    /**
     * Sends a read receipt for an event in a room
     * @param {string} roomId the room ID to send the receipt to
     * @param {string} eventId the event ID to set the receipt at
     * @returns {Promise<any>} resolves when the receipt has been sent
     */
    @timedMatrixClientFunctionCall()
    public sendReadReceipt(roomId: string, eventId: string): Promise<any> {
        return this.doRequest("POST", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/receipt/m.read/" + encodeURIComponent(eventId), null, {});
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
        return this.doRequest("PUT", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/typing/" + encodeURIComponent(userId), null, {
            typing,
            timeout,
        });
    }

    /**
     * Replies to a given event with the given text. The event is sent with a msgtype of m.text.
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
     * Replies to a given event with the given text. The event is sent with a msgtype of m.notice.
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
     * Sends a notice to the given room
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
     * Sends a text message to the given room
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
     * Sends a message to the given room
     * @param {string} roomId the room ID to send the message to
     * @param {object} content the event content to send
     * @returns {Promise<string>} resolves to the event ID that represents the message
     */
    @timedMatrixClientFunctionCall()
    public sendMessage(roomId: string, content: any): Promise<string> {
        return this.sendEvent(roomId, "m.room.message", content);
    }

    /**
     * Sends an event to the given room
     * @param {string} roomId the room ID to send the event to
     * @param {string} eventType the type of event to send
     * @param {string} content the event body to send
     * @returns {Promise<string>} resolves to the event ID that represents the event
     */
    @timedMatrixClientFunctionCall()
    public sendEvent(roomId: string, eventType: string, content: any): Promise<string> {
        const txnId = (new Date().getTime()) + "__REQ" + this.requestId;
        return this.doRequest("PUT", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/send/" + encodeURIComponent(eventType) + "/" + encodeURIComponent(txnId), null, content).then(response => {
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
        return this.doRequest("PUT", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/state/" + encodeURIComponent(type) + "/" + encodeURIComponent(stateKey), null, content).then(response => {
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
        const txnId = (new Date().getTime()) + "__REQ" + this.requestId;
        const content = reason !== null ? {reason} : {};
        return this.doRequest("PUT", `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/redact/${encodeURIComponent(eventId)}/${txnId}`, null, content).then(response => {
            return response['event_id'];
        });
    }

    /**
     * Creates a room. This does not break out the various options for creating a room
     * due to the large number of possibilities. See the /createRoom endpoint in the
     * spec for more information on what to provide for `properties`. Note that creating
     * a room may cause the bot/appservice to raise a join event.
     * @param {any} properties the properties of the room. See the spec for more information
     * @returns {Promise<string>} resolves to the room ID that represents the room
     */
    @timedMatrixClientFunctionCall()
    public createRoom(properties: any = {}): Promise<string> {
        return this.doRequest("POST", "/_matrix/client/r0/createRoom", null, properties).then(response => {
            return response['room_id'];
        });
    }

    /**
     * Checks if a given user has a required power level
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
            throw new Error("No power level event found");
        }

        let requiredPower = isState ? 50 : 0;
        if (isState && powerLevelsEvent["state_default"]) requiredPower = powerLevelsEvent["state_default"];
        if (!isState && powerLevelsEvent["users_default"]) requiredPower = powerLevelsEvent["users_default"];
        if (powerLevelsEvent["events"] && powerLevelsEvent["events"][eventType]) requiredPower = powerLevelsEvent["events"][eventType];

        let userPower = 0;
        if (powerLevelsEvent["users"] && powerLevelsEvent["users"][userId]) userPower = powerLevelsEvent["users"][userId];

        return userPower >= requiredPower;
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
    @timedMatrixClientFunctionCall()
    public mxcToHttp(mxc: string): string {
        if (!mxc.startsWith("mxc://")) throw new Error("Not a MXC URI");
        const parts = mxc.substring("mxc://".length).split('/');
        const originHomeserver = parts[0];
        const mediaId = parts.slice(1, parts.length).join('/');
        return `${this.homeserverUrl}/_matrix/media/r0/download/${encodeURIComponent(originHomeserver)}/${encodeURIComponent(mediaId)}`;
    }

    /**
     * Converts a MXC URI to an HTTP URL for downsizing the content.
     * @param {string} mxc The MXC URI to convert and downsize.
     * @param {number} width The width, as an integer, for the thumbnail.
     * @param {number} height The height, as an intenger, for the thumbnail.
     * @param {"crop"|"scale"} method Whether to crop or scale (preserve aspect ratio) the content.
     * @returns {string} The HTTP URL for the downsized content.
     */
    @timedMatrixClientFunctionCall()
    public mxcToHttpThumbnail(mxc: string, width: number, height: number, method: "crop" | "scale"): string {
        const downloadUri = this.mxcToHttp(mxc);
        return downloadUri.replace("/_matrix/media/r0/download", "/_matrix/media/r0/thumbnail")
            + `?width=${width}&height=${height}&method=${encodeURIComponent(method)}`;
    }

    /**
     * Uploads data to the homeserver's media repository.
     * @param {Buffer} data the content to upload.
     * @param {string} contentType the content type of the file. Defaults to application/octet-stream
     * @param {string} filename the name of the file. Optional.
     * @returns {Promise<string>} resolves to the MXC URI of the content
     */
    @timedMatrixClientFunctionCall()
    public uploadContent(data: Buffer, contentType = "application/octet-stream", filename: string = null): Promise<string> {
        // TODO: Make doRequest take an object for options
        return this.doRequest("POST", "/_matrix/media/r0/upload", {filename: filename}, data, 60000, false, contentType)
            .then(response => response["content_uri"]);
    }

    /**
     * Download content from the homeserver's media repository.
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
        const path = `/_matrix/media/r0/download/${domain}/${mediaId}`;
        const res = await this.doRequest("GET", path, {allow_remote: allowRemote}, null, null, true, null, true);
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
                    LogService.error("MatrixLiteClient (REQ-" + requestId + ")", err);
                    reject(err);
                } else {
                    const contentType = response.headers['content-type'] || "application/octet-stream";

                    LogService.debug("MatrixLiteClient (REQ-" + requestId + " RESP-H" + response.statusCode + ")", "<data>");
                    if (response.statusCode < 200 || response.statusCode >= 300) {
                        LogService.error("MatrixLiteClient (REQ-" + requestId + ")", "<data>");
                        reject(response);
                    } else resolve({body: resBody, contentType: contentType});
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
        const result = {previous: [], newer: [], current: null};

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
     * Performs a web request to the homeserver, applying appropriate authorization headers for
     * this client.
     * @param {"GET"|"POST"|"PUT"|"DELETE"} method The HTTP method to use in the request
     * @param {string} endpoint The endpoint to call. For example: "/_matrix/client/r0/account/whoami"
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
        if (!endpoint.startsWith('/'))
            endpoint = '/' + endpoint;

        const requestId = ++this.requestId;
        const url = this.homeserverUrl + endpoint;

        // This is logged at info so that when a request fails people can figure out which one.
        LogService.info("MatrixLiteClient (REQ-" + requestId + ")", method + " " + url);

        if (this.impersonatedUserId) {
            if (!qs) qs = {"user_id": this.impersonatedUserId};
            else qs["user_id"] = this.impersonatedUserId;
        }

        const headers = {};
        if (this.accessToken) {
            headers["Authorization"] = `Bearer ${this.accessToken}`;
        }

        // Don't log the request unless we're in debug mode. It can be large.
        if (LogService.level.includes(LogLevel.DEBUG)) {
            if (qs) LogService.debug("MatrixLiteClient (REQ-" + requestId + ")", "qs = " + JSON.stringify(qs));
            if (body && !Buffer.isBuffer(body)) LogService.debug("MatrixLiteClient (REQ-" + requestId + ")", "body = " + JSON.stringify(this.redactObjectForLogging(body)));
            if (body && Buffer.isBuffer(body)) LogService.debug("MatrixLiteClient (REQ-" + requestId + ")", "body = <Buffer>");
        }

        const params: { [k: string]: any } = {
            uri: url,
            method: method,
            qs: qs,
            // If this is undefined, then a string will be returned. If it's null, a Buffer will be returned.
            encoding: noEncoding === false ? undefined : null,
            userQuerystring: true,
            qsStringifyOptions: {
                options: {arrayFormat: 'repeat'},
            },
            timeout: timeout,
            headers: headers,
        };

        if (Buffer.isBuffer(body)) {
            params.headers["Content-Type"] = contentType;
            params.body = body;
        } else {
            params.headers["Content-Type"] = "application/json";
            params.body = JSON.stringify(body);
        }

        return new Promise((resolve, reject) => {
            getRequestFn()(params, (err, response, resBody) => {
                if (err) {
                    LogService.error("MatrixLiteClient (REQ-" + requestId + ")", err);
                    reject(err);
                } else {
                    if (typeof (resBody) === 'string') {
                        try {
                            resBody = JSON.parse(resBody);
                        } catch (e) {
                        }
                    }

                    if (typeof (response.body) === 'string') {
                        try {
                            response.body = JSON.parse(response.body);
                        } catch (e) {
                        }
                    }

                    // Don't log the body unless we're in debug mode. They can be large.
                    if (LogService.level.includes(LogLevel.DEBUG)) {
                        const redactedBody = this.redactObjectForLogging(response.body);
                        LogService.debug("MatrixLiteClient (REQ-" + requestId + " RESP-H" + response.statusCode + ")", redactedBody);
                    }
                    if (response.statusCode < 200 || response.statusCode >= 300) {
                        const redactedBody = this.redactObjectForLogging(response.body);
                        LogService.error("MatrixLiteClient (REQ-" + requestId + ")", redactedBody);
                        reject(response);
                    } else resolve(raw ? response : resBody);
                }
            });
        });
    }

    private redactObjectForLogging(input: any): any {
        if (!input) return input;

        const fieldsToRedact = [
            'access_token',
            'password',
        ];

        const redactFn = (i) => {
            if (!i) return i;

            // Don't treat strings like arrays/objects
            if (typeof i === 'string') return i;

            if (Array.isArray(i)) {
                const rebuilt = [];
                for (const v of i) {
                    rebuilt.push(redactFn(v));
                }
                return rebuilt;
            }

            if (i instanceof Object) {
                const rebuilt = {};
                for (const key of Object.keys(i)) {
                    if (fieldsToRedact.includes(key)) {
                        rebuilt[key] = '<redacted>';
                    } else {
                        rebuilt[key] = redactFn(i[key]);
                    }
                }
                return rebuilt;
            }

            return i; // It's a primitive value
        };

        return redactFn(input);
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

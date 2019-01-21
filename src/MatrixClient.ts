import { EventEmitter } from "events";
import { IStorageProvider } from "./storage/IStorageProvider";
import { MemoryStorageProvider } from "./storage/MemoryStorageProvider";
import * as Bluebird from "bluebird";
import { IJoinRoomStrategy } from "./strategies/JoinRoomStrategy";
import { UnstableApis } from "./UnstableApis";
import { IPreprocessor } from "./preprocessors/IPreprocessor";
import { getRequestFn } from "./request";

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
    private filterId = 0;
    private stopSyncing = false;
    private lastJoinedRoomIds = [];
    private impersonatedUserId: string;

    private joinStrategy: IJoinRoomStrategy = null;
    private eventProcessors: { [eventType: string]: IPreprocessor[] } = {};

    /**
     * Creates a new matrix client
     * @param {string} homeserverUrl The homeserver's client-server API URL
     * @param {string} accessToken The access token for the homeserver
     * @param {IStorageProvider} storage The storage provider to use. Defaults to MemoryStorageProvider.
     */
    constructor(private homeserverUrl: string, private accessToken: string, private storage: IStorageProvider = null) {
        super();

        if (this.homeserverUrl.endsWith("/"))
            this.homeserverUrl = this.homeserverUrl.substring(0, this.homeserverUrl.length - 2);

        if (!this.storage) this.storage = new MemoryStorageProvider();
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
     * Adds a new room alias to the room directory
     * @param {string} alias The alias to add (eg: "#my-room:matrix.org")
     * @param {string} roomId The room ID to add the alias to
     * @returns {Promise} resolves when the alias has been added
     */
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
     * @returns {Promise<*>} resolves when completed
     */
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
     * @returns {Promise<*>} resolves when completed
     */
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
     * @returns {Promise<*>} resolves when completed
     */
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
     * @returns {Promise<*>} resolves when completed
     */
    public unbanUser(userId, roomId) {
        return this.doRequest("POST", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/unban", null, {
            user_id: userId,
        });
    }

    /**
     * Gets the current user ID for this client
     * @returns {Promise<string>} The user ID of this client
     */
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
     * @param {*} filter The filter to use, or null for none
     * @returns {Promise<*>} Resolves when the client has started syncing
     */
    public start(filter: any = null): Promise<any> {
        this.stopSyncing = false;
        if (!filter || typeof (filter) !== "object") {
            console.debug("MatrixClientLite", "No filter given or invalid object - using defaults.");
            filter = null;
        }

        return this.getUserId().then(userId => {
            let createFilter = false;

            let existingFilter = this.storage.getFilter();
            if (existingFilter) {
                console.debug("MatrixClientLite", "Found existing filter. Checking consistency with given filter");
                if (JSON.stringify(existingFilter.filter) === JSON.stringify(filter)) {
                    console.debug("MatrixClientLite", "Filters match");
                    this.filterId = existingFilter.id;
                } else {
                    createFilter = true;
                }
            } else {
                createFilter = true;
            }

            if (createFilter && filter) {
                console.debug("MatrixClientLite", "Creating new filter");
                return this.doRequest("POST", "/_matrix/client/r0/user/" + encodeURIComponent(userId) + "/filter", null, filter).then(response => {
                    this.filterId = response["filter_id"];
                    this.storage.setSyncToken(null);
                    this.storage.setFilter({
                        id: this.filterId,
                        filter: filter,
                    });
                });
            }
        }).then(() => {
            console.debug("MatrixClientLite", "Starting sync with filter ID " + this.filterId);
            this.startSync();
        });
    }

    private startSync() {
        let token = this.storage.getSyncToken();

        const promiseWhile = Bluebird.method(() => {
            if (this.stopSyncing) {
                console.info("MatrixClientLite", "Client stop requested - stopping sync");
                return;
            }

            return this.doSync(token).then(response => {
                token = response["next_batch"];
                this.storage.setSyncToken(token);
                console.info("MatrixClientLite", "Received sync. Next token: " + token);

                this.processSync(response);
            }, (e) => {
                console.error(e);
                return null;
            }).then(promiseWhile.bind(this));
        });

        promiseWhile(); // start the loop
    }

    private doSync(token: string): Promise<any> {
        console.info("MatrixClientLite", "Performing sync with token " + token);
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

    private async processSync(raw: any): Promise<any> {
        if (!raw || !raw['rooms']) return; // nothing to process
        let leftRooms = raw['rooms']['leave'] || {};
        let inviteRooms = raw['rooms']['invite'] || {};
        let joinedRooms = raw['rooms']['join'] || {};

        // Process rooms we've left first
        for (let roomId in leftRooms) {
            const room = leftRooms[roomId];
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
                console.warn("MatrixClientLite", "Left room " + roomId + " without receiving an event");
                continue;
            }

            leaveEvent = await this.processEvent(leaveEvent);
            this.emit("room.leave", roomId, leaveEvent);
        }

        // Process rooms we've been invited to
        for (let roomId in inviteRooms) {
            const room = inviteRooms[roomId];
            if (!room['invite_state'] || !room['invite_state']['events']) continue;

            let inviteEvent = null;
            for (let event of room['invite_state']['events']) {
                if (event['type'] !== 'm.room.member') continue;
                if (event['state_key'] !== await this.getUserId()) continue;
                if (event['membership'] !== "invite") continue;

                const oldAge = inviteEvent && inviteEvent['unsigned'] && inviteEvent['unsigned']['age'] ? inviteEvent['unsigned']['age'] : 0;
                const newAge = event['unsigned'] && event['unsigned']['age'] ? event['unsigned']['age'] : 0;
                if (inviteEvent && oldAge < newAge) continue;

                inviteEvent = event;
            }

            if (!inviteEvent) {
                console.warn("MatrixClientLite", "Invited to room " + roomId + " without receiving an event");
                continue;
            }

            inviteEvent = await this.processEvent(inviteEvent);
            this.emit("room.invite", roomId, inviteEvent);
        }

        // Process rooms we've joined and their events
        for (let roomId in joinedRooms) {
            if (this.lastJoinedRoomIds.indexOf(roomId) === -1) {
                this.emit("room.join", roomId);
                this.lastJoinedRoomIds.push(roomId);
            }

            const room = joinedRooms[roomId];
            if (!room['timeline'] || !room['timeline']['events']) continue;

            for (let event of room['timeline']['events']) {
                event = await this.processEvent(event);
                if (event['type'] === 'm.room.message') {
                    this.emit("room.message", roomId, event);
                }
                if (event['type'] === 'm.room.tombstone' && event['state_key'] === '') {
                    this.emit("room.archived", roomId, event);
                }
                if (event['type'] === 'm.room.create' && event['state_key'] === '' && event['content'] && event['content']['predecessor']) {
                    this.emit("room.upgraded", roomId, event);
                }
                this.emit("room.event", roomId, event);
            }
        }
    }

    /**
     * Gets an event for a room. Returned as a raw event.
     * @param {string} roomId the room ID to get the event in
     * @param {string} eventId the event ID to look up
     * @returns {Promise<*>} resolves to the found event
     */
    public getEvent(roomId: string, eventId: string): Promise<any> {
        return this.doRequest("GET", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/event/" + encodeURIComponent(eventId))
            .then(ev => this.processEvent(ev));
    }

    /**
     * Gets the room state for the given room. Returned as raw events.
     * @param {string} roomId the room ID to get state for
     * @returns {Promise<*[]>} resolves to the room's state
     */
    public getRoomState(roomId: string): Promise<any[]> {
        return this.doRequest("GET", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/state")
            .then(state => Promise.all(state.map(ev => this.processEvent(ev))));
    }

    /**
     * Gets the state events for a given room of a given type under the given state key.
     * @param {string} roomId the room ID
     * @param {string} type the event type
     * @param {String} stateKey the state key, falsey if not needed
     * @returns {Promise<*|*[]>} resolves to the state event(s)
     * @deprecated It is not possible to get an array of events - use getRoomStateEvent instead
     */
    public getRoomStateEvents(roomId, type, stateKey): Promise<any | any[]> {
        return this.getRoomStateEvent(roomId, type, stateKey);
    }

    /**
     * Gets a state event for a given room of a given type under the given state key.
     * @param {string} roomId the room ID
     * @param {string} type the event type
     * @param {String} stateKey the state key
     * @returns {Promise<*>} resolves to the state event
     */
    public getRoomStateEvent(roomId, type, stateKey): Promise<any> {
        return this.doRequest("GET", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/state/" + encodeURIComponent(type) + "/" + encodeURIComponent(stateKey ? stateKey : ''))
            .then(ev => this.processEvent(ev));
    }

    /**
     * Gets the profile for a given user
     * @param {string} userId the user ID to lookup
     * @returns {Promise<*>} the profile of the user
     */
    public getUserProfile(userId: string): Promise<any> {
        return this.doRequest("GET", "/_matrix/client/r0/profile/" + encodeURIComponent(userId));
    }

    /**
     * Sets a new display name for the user.
     * @param {string} displayName the new display name for the user, or null to clear
     * @returns {Promise<*>} resolves when complete
     */
    public async setDisplayName(displayName: string): Promise<any> {
        const userId = encodeURIComponent(await this.getUserId());
        return this.doRequest("PUT", "/_matrix/client/r0/profile/" + userId + "/displayname", null, {
            displayname: displayName,
        });
    }

    /**
     * Sets a new avatar url for the user.
     * @param {string} avatarUrl the new avatar URL for the user, in the form of a Matrix Content URI
     * @returns {Promise<*>} resolves when complete
     */
    public async setAvatarUrl(avatarUrl: string): Promise<any> {
        const userId = encodeURIComponent(await this.getUserId());
        return this.doRequest("PUT", "/_matrix/client/r0/profile/" + userId + "/avatar_url", null, {
            avatar_url: avatarUrl,
        });
    }

    /**
     * Joins the given room
     * @param {string} roomIdOrAlias the room ID or alias to join
     * @returns {Promise<string>} resolves to the joined room ID
     */
    public async joinRoom(roomIdOrAlias: string): Promise<string> {
        const apiCall = (targetIdOrAlias: string) => {
            targetIdOrAlias = encodeURIComponent(targetIdOrAlias);
            return this.doRequest("POST", "/_matrix/client/r0/join/" + targetIdOrAlias).then(response => {
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
    public getJoinedRooms(): Promise<string[]> {
        return this.doRequest("GET", "/_matrix/client/r0/joined_rooms").then(response => response['joined_rooms']);
    }

    /**
     * Gets the joined members in a room. The client must be in the room to make this request.
     * @param {string} roomId The room ID to get the joined members of.
     * @returns {Promise<string>} The joined user IDs in the room
     */
    public getJoinedRoomMembers(roomId: string): Promise<string[]> {
        return this.doRequest("GET", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/joined_members").then(response => {
            return Object.keys(response['joined']);
        });
    }

    /**
     * Leaves the given room
     * @param {string} roomId the room ID to leave
     * @returns {Promise<*>} resolves when left
     */
    public leaveRoom(roomId: string): Promise<any> {
        return this.doRequest("POST", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/leave");
    }

    /**
     * Sends a read receipt for an event in a room
     * @param {string} roomId the room ID to send the receipt to
     * @param {string} eventId the event ID to set the receipt at
     * @returns {Promise<*>} resolves when the receipt has been sent
     */
    public sendReadReceipt(roomId: string, eventId: string): Promise<any> {
        return this.doRequest("POST", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/receipt/m.read/" + encodeURIComponent(eventId));
    }

    /**
     * Sends a notice to the given room
     * @param {string} roomId the room ID to send the notice to
     * @param {string} text the text to send
     * @returns {Promise<string>} resolves to the event ID that represents the message
     */
    public sendNotice(roomId: string, text: string): Promise<string> {
        const txnId = (new Date().getTime()) + "__REQ" + this.requestId;
        return this.doRequest("PUT", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/send/m.room.message/" + encodeURIComponent(txnId), null, {
            body: text,
            msgtype: "m.notice"
        }).then(response => {
            return response['event_id'];
        });
    }

    /**
     * Sends a message to the given room
     * @param {string} roomId the room ID to send the notice to
     * @param {string} content the event body to send
     * @returns {Promise<string>} resolves to the event ID that represents the message
     */
    public sendMessage(roomId: string, content: any): Promise<string> {
        const txnId = (new Date().getTime()) + "__REQ" + this.requestId;
        return this.doRequest("PUT", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/send/m.room.message/" + encodeURIComponent(txnId), null, content).then(response => {
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
    public sendStateEvent(roomId: string, type: string, stateKey: string, content: any): Promise<string> {
        return this.doRequest("PUT", "/_matrix/client/r0/rooms/" + encodeURIComponent(roomId) + "/state/" + encodeURIComponent(type) + "/" + encodeURIComponent(stateKey), null, content).then(response => {
            return response['event_id'];
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
     * Uploads data to the homeserver's media repository.
     * @param {Buffer} data the content to upload.
     * @param {string} contentType the content type of the file. Defaults to application/octet-stream
     * @param {string} filename the name of the file. Optional.
     * @returns {Promise<string>} resolves to the MXC URI of the content
     */
    public uploadContent(data: Buffer, contentType = "application/octet-stream", filename: string = null): Promise<string> {
        // TODO: Make doRequest take an object for options
        return this.doRequest("POST", "/_matrix/media/r0/upload", {filename: filename}, data, 60000, false, contentType)
            .then(response => response["content_uri"]);
    }

    /**
     * Performs a web request to the homeserver, applying appropriate authorization headers for
     * this client.
     * @param {"GET"|"POST"|"PUT"|"DELETE"} method The HTTP method to use in the request
     * @param {string} endpoint The endpoint to call. For example: "/_matrix/client/r0/account/whoami"
     * @param {*} qs The query string to send. Optional.
     * @param {*} body The request body to send. Optional. Will be converted to JSON unless the type is a Buffer.
     * @param {number} timeout The number of milliseconds to wait before timing out.
     * @param {boolean} raw If true, the raw response will be returned instead of the response body.
     * @param {string} contentType The content type to send. Only used if the `body` is a Buffer.
     * @returns {Promise<*>} Resolves to the response (body), rejected if a non-2xx status code was returned.
     */
    public doRequest(method, endpoint, qs = null, body = null, timeout = 60000, raw = false, contentType = "application/json"): Promise<any> {
        if (!endpoint.startsWith('/'))
            endpoint = '/' + endpoint;

        const requestId = ++this.requestId;
        const url = this.homeserverUrl + endpoint;

        console.debug("MatrixLiteClient (REQ-" + requestId + ")", method + " " + url);

        if (this.impersonatedUserId) {
            if (!qs) qs = {"user_id": this.impersonatedUserId};
            else qs["user_id"] = this.impersonatedUserId;
        }

        if (qs) console.debug("MatrixLiteClient (REQ-" + requestId + ")", "qs = " + JSON.stringify(qs));
        if (body && !Buffer.isBuffer(body)) console.debug("MatrixLiteClient (REQ-" + requestId + ")", "body = " + JSON.stringify(body));
        if (body && Buffer.isBuffer(body)) console.debug("MatrixLiteClient (REQ-" + requestId + ")", "body = <Buffer>");

        const params: { [k: string]: any } = {
            uri: url,
            method: method,
            qs: qs,
            timeout: timeout,
            headers: {
                "Authorization": "Bearer " + this.accessToken,
            }
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
                    console.error("MatrixLiteClient (REQ-" + requestId + ")", err);
                    reject(err);
                } else {
                    if (typeof (resBody) === 'string') {
                        try {
                            resBody = JSON.parse(resBody);
                        } catch (e) {
                        }
                    }

                    console.debug("MatrixLiteClient (REQ-" + requestId + " RESP-H" + response.statusCode + ")", response.body);
                    if (response.statusCode < 200 || response.statusCode >= 300) {
                        console.error("MatrixLiteClient (REQ-" + requestId + ")", response.body);
                        reject(response);
                    } else resolve(raw ? response : resBody);
                }
            });
        });
    }
}

export interface RoomDirectoryLookupResponse {
    roomId: string;
    residentServers: string[];
}

import { IAppserviceStorageProvider, LogService, MatrixClient, Metrics } from "..";
import { Appservice, IAppserviceOptions } from "./Appservice";

// noinspection TypeScriptPreferShortImport
import { timedIntentFunctionCall } from "../metrics/decorators";

/**
 * An Intent is an intelligent client that tracks things like the user's membership
 * in rooms to ensure the action being performed is possible. This is very similar
 * to how Intents work in the matrix-js-sdk in that the Intent will ensure that the
 * user is joined to the room before posting a message, for example.
 * @category Application services
 */
export class Intent {

    /**
     * The metrics instance for this intent. Note that this will not raise metrics
     * for the underlying client - those will be available through this instance's
     * parent (the appservice).
     */
    public readonly metrics: Metrics;

    private readonly client: MatrixClient;
    private readonly storage: IAppserviceStorageProvider;

    private knownJoinedRooms: string[] = [];

    /**
     * Creates a new intent. Intended to be created by application services.
     * @param {IAppserviceOptions} options The options for the application service.
     * @param {string} impersonateUserId The user ID to impersonate.
     * @param {Appservice} appservice The application service itself.
     */
    constructor(options: IAppserviceOptions, private impersonateUserId: string, private appservice: Appservice) {
        this.metrics = new Metrics(appservice.metrics);
        this.client = new MatrixClient(options.homeserverUrl, options.registration.as_token);
        this.client.metrics = new Metrics(appservice.metrics); // Metrics only go up by one parent

        this.storage = options.storage;
        if (impersonateUserId !== appservice.botUserId) this.client.impersonateUserId(impersonateUserId);
        if (options.joinStrategy) this.client.setJoinStrategy(options.joinStrategy);
    }

    /**
     * Gets the user ID this intent is for.
     */
    public get userId(): string {
        return this.impersonateUserId;
    }

    /**
     * Gets the underlying MatrixClient that powers this Intent.
     */
    public get underlyingClient(): MatrixClient {
        return this.client;
    }

    /**
     * Gets the joined rooms for the intent. Note that by working around
     * the intent to join rooms may yield inaccurate results.
     * @returns {Promise<string[]>} Resolves to an array of room IDs where
     * the intent is joined.
     */
    @timedIntentFunctionCall()
    public async getJoinedRooms(): Promise<string[]> {
        await this.ensureRegistered();
        if (this.knownJoinedRooms.length === 0) await this.refreshJoinedRooms();
        return this.knownJoinedRooms.map(r => r); // clone
    }

    /**
     * Leaves the given room.
     * @param {string} roomId The room ID to leave
     * @returns {Promise<any>} Resolves when the room has been left.
     */
    @timedIntentFunctionCall()
    public async leaveRoom(roomId: string): Promise<any> {
        await this.ensureRegistered();
        return this.client.leaveRoom(roomId).then(async () => {
            // Recalculate joined rooms now that we've left a room
            await this.refreshJoinedRooms();
        });
    }

    /**
     * Joins the given room
     * @param {string} roomIdOrAlias the room ID or alias to join
     * @returns {Promise<string>} resolves to the joined room ID
     */
    @timedIntentFunctionCall()
    public async joinRoom(roomIdOrAlias: string): Promise<string> {
        await this.ensureRegistered();
        return this.client.joinRoom(roomIdOrAlias).then(async roomId => {
            // Recalculate joined rooms now that we've joined a room
            await this.refreshJoinedRooms();
            return roomId;
        });
    }

    /**
     * Sends a text message to a room.
     * @param {string} roomId The room ID to send text to.
     * @param {string} body The message body to send.
     * @param {"m.text" | "m.emote" | "m.notice"} msgtype The message type to send.
     * @returns {Promise<string>} Resolves to the event ID of the sent message.
     */
    @timedIntentFunctionCall()
    public async sendText(roomId: string, body: string, msgtype: "m.text" | "m.emote" | "m.notice" = "m.text"): Promise<string> {
        return this.sendEvent(roomId, {body: body, msgtype: msgtype});
    }

    /**
     * Sends an event to a room.
     * @param {string} roomId The room ID to send the event to.
     * @param {any} content The content of the event.
     * @returns {Promise<string>} Resolves to the event ID of the sent event.
     */
    @timedIntentFunctionCall()
    public async sendEvent(roomId: string, content: any): Promise<string> {
        await this.ensureRegisteredAndJoined(roomId);
        return this.client.sendMessage(roomId, content);
    }

    /**
     * Ensures the user is registered and joined to the given room.
     * @param {string} roomId The room ID to join
     * @returns {Promise<any>} Resolves when complete
     */
    @timedIntentFunctionCall()
    public async ensureRegisteredAndJoined(roomId: string) {
        await this.ensureRegistered();
        await this.ensureJoined(roomId);
    }

    /**
     * Ensures the user is joined to the given room
     * @param {string} roomId The room ID to join
     * @returns {Promise<any>} Resolves when complete
     */
    @timedIntentFunctionCall()
    public async ensureJoined(roomId: string) {
        if (this.knownJoinedRooms.indexOf(roomId) !== -1) {
            return;
        }

        await this.refreshJoinedRooms();

        if (this.knownJoinedRooms.indexOf(roomId) !== -1) {
            return;
        }

        const returnedRoomId = await this.client.joinRoom(roomId);
        if (!this.knownJoinedRooms.includes(returnedRoomId)) {
            this.knownJoinedRooms.push(returnedRoomId);
        }
        return returnedRoomId;
    }

    /**
     * Refreshes which rooms the user is joined to, potentially saving time on
     * calls like ensureJoined()
     * @returns {Promise<string[]>} Resolves to the joined room IDs for the user.
     */
    @timedIntentFunctionCall()
    public async refreshJoinedRooms(): Promise<string[]> {
        this.knownJoinedRooms = await this.client.getJoinedRooms();
        return this.knownJoinedRooms.map(r => r); // clone
    }

    /**
     * Ensures the user is registered
     * @returns {Promise<any>} Resolves when complete
     */
    @timedIntentFunctionCall()
    public async ensureRegistered() {
        if (!(await Promise.resolve(this.storage.isUserRegistered(this.userId)))) {
            try {
                const result = await this.client.doRequest("POST", "/_matrix/client/r0/register", null, {
                    type: "m.login.application_service",
                    username: this.userId.substring(1).split(":")[0],
                });

                // HACK: Workaround for unit tests
                if (result['errcode']) {
                    // noinspection ExceptionCaughtLocallyJS
                    throw {body: result};
                }
            } catch (err) {
                if (typeof (err.body) === "string") err.body = JSON.parse(err.body);
                if (err.body && err.body["errcode"] === "M_USER_IN_USE") {
                    await Promise.resolve(this.storage.addRegisteredUser(this.userId));
                    if (this.userId === this.appservice.botUserId) {
                        return null;
                    } else {
                        LogService.error("Appservice", "Error registering user: User ID is in use");
                        return null;
                    }
                } else {
                    LogService.error("Appservice", "Encountered error registering user: ");
                    LogService.error("Appservice", err);
                }
                throw err;
            }

            await Promise.resolve(this.storage.addRegisteredUser(this.userId));
        }
    }
}

import { Appservice, MatrixClient } from "..";
import { IAppserviceOptions } from "./Appservice";
import { IAppserviceStorageProvider } from "../storage/IAppserviceStorageProvider";

/**
 * An Intent is an intelligent client that tracks things like the user's membership
 * in rooms to ensure the action being performed is possible. This is very similar
 * to how Intents work in the matrix-js-sdk in that the Intent will ensure that the
 * user is joined to the room before posting a message, for example.
 */
export class Intent {

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
        this.storage = options.storage;
        this.client = new MatrixClient(options.homeserverUrl, options.registration.as_token);
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
     * Joins the given room
     * @param {string} roomIdOrAlias the room ID or alias to join
     * @returns {Promise<string>} resolves to the joined room ID
     */
    public async joinRoom(roomIdOrAlias: string): Promise<string> {
        await this.ensureRegistered();
        return this.client.joinRoom(roomIdOrAlias);
    }

    /**
     * Sends a text message to a room.
     * @param {string} roomId The room ID to send text to.
     * @param {string} body The message body to send.
     * @param {"m.text" | "m.emote" | "m.notice"} msgtype The message type to send.
     * @returns {Promise<string>} Resolves to the event ID of the sent message.
     */
    public async sendText(roomId: string, body: string, msgtype: "m.text" | "m.emote" | "m.notice" = "m.text"): Promise<string> {
        return this.sendEvent(roomId, {body: body, msgtype: msgtype});
    }

    /**
     * Sends an event to a room.
     * @param {string} roomId The room ID to send the event to.
     * @param {*} content The content of the event.
     * @returns {Promise<string>} Resolves to the event ID of the sent event.
     */
    public async sendEvent(roomId: string, content: any): Promise<string> {
        await this.ensureRegisteredAndJoined(roomId);
        return this.client.sendMessage(roomId, content);
    }

    /**
     * Ensures the user is registered and joined to the given room.
     * @param {string} roomId The room ID to join
     * @returns {Promise<*>} Resolves when complete
     */
    public async ensureRegisteredAndJoined(roomId: string) {
        await this.ensureRegistered();
        await this.ensureJoined(roomId);
    }

    /**
     * Ensures the user is joined to the given room
     * @param {string} roomId The room ID to join
     * @returns {Promise<*>} Resolves when complete
     */
    public async ensureJoined(roomId: string) {
        if (this.knownJoinedRooms.indexOf(roomId) !== -1) {
            return;
        }

        const rooms = await this.client.getJoinedRooms();
        for (const room of rooms) {
            if (this.knownJoinedRooms.indexOf(room) === -1) this.knownJoinedRooms.push(room);
        }

        if (this.knownJoinedRooms.indexOf(roomId) !== -1) {
            return;
        }

        return this.client.joinRoom(roomId);
    }

    /**
     * Ensures the user is registered
     * @returns {Promise<*>} Resolves when complete
     */
    public async ensureRegistered() {
        if (!this.storage.isUserRegistered(this.userId)) {
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
                if (err.body && err.body["errcode"] === "M_USER_IN_USE") {
                    this.storage.addRegisteredUser(this.userId);
                    if (this.userId === this.appservice.botUserId) {
                        return null;
                    } else {
                        console.error("Error registering user: User ID is in use");
                        return null;
                    }
                } else {
                    console.error("Encountered error registering user: ");
                    console.error(err);
                }
                throw err;
            }

            this.storage.addRegisteredUser(this.userId);
        }
    }
}

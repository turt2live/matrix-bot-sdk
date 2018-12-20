import { MatrixClient } from "..";
import { IAppserviceRegistration, IAppserviceOptions } from "./appservice";
import { IAppserviceStorageProvider } from "../storage/IAppserviceStorageProvider";

/**
 * An Intent is an intelligent client that tracks things like the user's membership
 * in rooms to ensure the action being performed is possible. This is very similar
 * to how Intents work in the matrix-js-sdk in that the Intent will ensure that the
 * user is joined to the room before posting a message, for example.
 */
export class Intent {

    private client: MatrixClient;
    private knownJoinedRooms: string[] = [];

    /**
     * Creates a new intent. Intended to be created by application services.
     * @param {IAppserviceOptions} options The options for the application service.
     * @param {IAppserviceRegistration} registration The registration for the application service.
     * @param {IAppserviceStorageProvider} storage The storage mechanism the application service is using.
     * @param {string} impersonateUserId The user ID to impersonate.
     */
    constructor(options: IAppserviceOptions, registration: IAppserviceRegistration, private storage: IAppserviceStorageProvider, private impersonateUserId: string) {
        this.client = new MatrixClient(options.homeserverUrl, registration.as_token);
        this.client.impersonateUserId(impersonateUserId);
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
     * Sends a text message to a room.
     * @param {string} roomId The room ID to send text to.
     * @param {string} body The message body to send.
     * @param {"m.text" | "m.emote" | "m.notice"} msgtype The message type to send.
     * @returns {Promise<string>} Resolves to the event ID of the sent message.
     */
    public async sendText(roomId: string, body: string, msgtype: "m.text" | "m.emote" | "m.notice" = "m.text"): Promise<string> {
        return this.sendEvent(roomId, { body: body, msgtype: msgtype });
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

    private async ensureRegisteredAndJoined(roomId: string) {
        await this.ensureRegistered();
        await this.ensureJoined(roomId);
    }

    private async ensureJoined(roomId: string) {
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

        // TODO: Set the join strategy to retry and then rely on the appservice bot user to invite, if possible.
        return this.client.joinRoom(roomId);
    }

    private async ensureRegistered() {
        if (!this.storage.isUserRegistered(this.userId)) {
            await this.client.doRequest("POST", "/_matrix/client/r0/register", null, {
                type: "m.login.application_service",
                username: this.userId.substring(1).split(":")[0],
            }).catch(err => {
                console.error("Encountered error registering user: ");
                console.error(err);
                return null; // swallow error
            });

            this.storage.addRegisteredUser(this.userId);
        }
    }
}

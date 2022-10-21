import { MatrixClient } from "./MatrixClient";
import { MSC2380MediaInfo } from "./models/unstable/MediaInfo";
import { MSC3401Call } from "./voip/MSC3401Call";
import { MSC3401CallEvent } from "./models/events/MSC3401CallEvent";

/**
 * Unstable APIs that shouldn't be used in most circumstances.
 * @category Unstable APIs
 */
export class UnstableApis {
    constructor(private client: MatrixClient) {
    }

    /**
     * Gets the local room aliases that are published for a given room.
     * @param {string} roomId The room ID to get local aliases for.
     * @returns {Promise<string[]>} Resolves to the aliases on the room, or an empty array.
     * @deprecated Relies on MSC2432 endpoint.
     */
    public async getRoomAliases(roomId: string): Promise<string[]> {
        const r = await this.client.doRequest("GET", "/_matrix/client/unstable/org.matrix.msc2432/rooms/" + encodeURIComponent(roomId) + "/aliases");
        return r['aliases'] || [];
    }

    /**
     * Adds a reaction to an event. The contract for this function may change in the future.
     * @param {string} roomId The room ID to react in
     * @param {string} eventId The event ID to react against, in the given room
     * @param {string} emoji The emoji to react with
     * @returns {Promise<string>} Resolves to the event ID of the reaction
     */
    public async addReactionToEvent(roomId: string, eventId: string, emoji: string): Promise<string> {
        return this.client.sendEvent(roomId, "m.reaction", {
            "m.relates_to": {
                event_id: eventId,
                key: emoji,
                rel_type: "m.annotation",
            },
        });
    }

    /**
     * Get relations for a given event.
     * @param {string} roomId The room ID to for the given event.
     * @param {string} eventId The event ID to list relations for.
     * @param {string?} relationType The type of relations (e.g. `m.room.member`) to filter for. Optional.
     * @param {string?} eventType The type of event to look for (e.g. `m.room.member`). Optional.
     * @returns {Promise<{chunk: any[]}>} Resolves to an object containing the chunk of relations
     * @deprecated Please use the function of the same name in MatrixClient. This will be removed in a future release.
     */
    public async getRelationsForEvent(roomId: string, eventId: string, relationType?: string, eventType?: string): Promise<{ chunk: any[] }> {
        let url = `/_matrix/client/unstable/rooms/${encodeURIComponent(roomId)}/relations/${encodeURIComponent(eventId)}`;
        if (relationType) {
            url += `/${relationType}`;
        }
        if (eventType) {
            url += `/${eventType}`;
        }
        return this.client.doRequest("GET", url);
    }

    /**
     * Get information about a media item. Implements MSC2380
     * @param {string} mxcUrl The MXC to get information about.
     * @returns {Promise<MSC2380MediaInfo>} Resolves to an object containing the media information.
     */
    public async getMediaInfo(mxcUrl: string): Promise<MSC2380MediaInfo> {
        if (!mxcUrl.toLowerCase().startsWith("mxc://")) {
            throw Error("'mxcUrl' does not begin with mxc://");
        }
        const [domain, mediaId] = mxcUrl.substring("mxc://".length).split("/");
        if (!domain || !mediaId) {
            throw Error('Missing domain or media ID');
        }
        return this.client.doRequest("GET", `/_matrix/media/unstable/info/${encodeURIComponent(domain)}/${encodeURIComponent(mediaId)}`);
    }

    /**
     * Creates an MSC3401 call room (public). This is essentially a proxy to the createRoom
     * function with a special template.
     * @param {string} name The name of the call.
     * @returns {Promise<string>} Resolves to the room ID.
     */
    public async createCallRoom(name: string): Promise<string> {
        return this.client.createRoom({
            // Template borrowed from Element Call
            name: name,
            preset: "public_chat",
            room_alias_name: name,
            visibility: "private",
            power_level_content_override: {
                users_default: 0,
                events_default: 0,
                state_default: 0,
                invite: 100,
                kick: 100,
                redact: 50,
                ban: 100,
                events: {
                    "m.room.encrypted": 50,
                    "m.room.encryption": 100,
                    "m.room.history_visibility": 100,
                    "m.room.message": 0,
                    "m.room.name": 50,
                    "m.room.power_levels": 100,
                    "m.room.tombstone": 100,
                    "m.sticker": 50,
                    "org.matrix.msc3401.call.member": 0,
                },
                users: {
                    [await this.client.getUserId()]: 100,
                },
            },
        });
    }

    /**
     * Starts a call in the room.
     * @param {string} roomId The room ID to start a call in.
     * @returns {Promise<MSC3401Call>} Resolves to the call object.
     */
    public async startCallInRoom(roomId: string): Promise<MSC3401Call> {
        const roomName = await this.client.getRoomStateEvent(roomId, "m.room.name", "");
        const call = new MSC3401Call(this.client, roomId, roomName["name"]);
        await this.client.sendStateEvent(roomId, call.callEvent.type, call.callEvent.stateKey, call.callEvent.content);
        return call;
    }

    /**
     * Get all the calls in a room.
     * @param {string} roomId The room ID.
     * @returns {Promise<MSC3401Call[]>} Resolves to an array of all known calls.
     */
    public async getCallsInRoom(roomId: string): Promise<MSC3401Call[]> {
        const state = await this.client.getRoomState(roomId);
        return state
            .filter(s => s.type === 'org.matrix.msc3401.call')
            .map(s => new MSC3401Call(this.client, roomId, new MSC3401CallEvent(s)));
    }
}

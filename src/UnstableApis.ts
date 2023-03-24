import { MatrixClient } from "./MatrixClient";
import { MSC2380MediaInfo } from "./models/unstable/MediaInfo";

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
        return this.client.sendRawEvent(roomId, "m.reaction", {
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
}

import { MatrixClient } from "../MatrixClient";

export interface MSC2716BatchSendResponse {
    /**
     * List of historical state event IDs that were inserted
     */
    state_events?: string[];
    /**
     * List of historical event IDs that were inserted
     */
    events?: string[];
    /**
     * Chunk ID to be used in the next `sendHistoricalEventBatch` call.
     */
    next_chunk_id: string;
}

export interface MSC2716InsertionEventContent {
    "org.matrix.msc2716.next_chunk_id": string;
    "org.matrix.msc2716.historical": true;
}

export interface MSC2716ChunkEventContent {
    "org.matrix.msc2716.chunk_id": string;
    "org.matrix.msc2716.historical": true;
}

export interface MSC2716MarkerEventContent {
    "org.matrix.msc2716.insertion_id": string;
    "org.matrix.msc2716.historical": true;
}

/**
 * Unstable APIs that shouldn't be used in most circumstances for appservices.
 * @category Unstable APIs
 */
export class UnstableAsApis {
    constructor(private client: MatrixClient) { }

    /**
     * Send several historical events into a room.
     * @see https://github.com/matrix-org/matrix-doc/pull/2716
     * @param roomId The roomID to send to.
     * @param prevEventId The event ID where this batch will be inserted
     * @param chunkId The chunk ID returned from a previous call. Leave empty if this is the first batch.
     * @param events A set of event contents for events to be inserted into the room.
     * @param stateEventsAtStart A set of state events to be inserted into the room.
     * @returns A set of eventIds and the next chunk ID
     */
    public async sendHistoricalEventBatch(roomId: string, prevEventId: string, events: any[], stateEventsAtStart: any[] = [], chunkId?: string): Promise<MSC2716BatchSendResponse> {
        return this.client.doRequest(
            "POST",
            `/_matrix/client/unstable/org.matrix.msc2716/rooms/${encodeURIComponent(roomId)}/batch_send`,
            {
                prev_event: prevEventId,
                chunk_id: chunkId,
            }, {
                events,
                state_events_at_start: stateEventsAtStart,
            }
        );
    }

    /**
     * Sends an event to the given room with a given timestamp.
     * @param {string} roomId the room ID to send the event to
     * @param {string} eventType the type of event to send
     * @param {string} content the event body to send
     * @param {number} ts The origin_server_ts of the new event
     * @returns {Promise<string>} resolves to the event ID that represents the event
     */
    public async sendEventWithTimestamp(roomId: string, eventType: string, content: any, ts: number) {
        const txnId = `${(new Date().getTime())}__inc${this.client.getNextRequestId()}`;
        const response = await this.client.doRequest("PUT", `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(eventType)}/${encodeURIComponent(txnId)}`, {ts}, content);
        return response.event_id;
    }

    /**
     * Sends a state event to the given room with a given timestamp.
     * @param {string} roomId the room ID to send the event to
     * @param {string} type the event type to send
     * @param {string} stateKey the state key to send, should not be null
     * @param {string} content the event body to send
     * @param {number} ts The origin_server_ts of the new event
     * @returns {Promise<string>} resolves to the event ID that represents the message
     */
    public async sendStateEventWithTimestamp(roomId: string, type: string, stateKey: string, content: any, ts: number): Promise<string> {
        const response = await this.client.doRequest("PUT", `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(type)}/${encodeURIComponent(stateKey)}`, {ts}, content);
        return response.event_id;
    }
}

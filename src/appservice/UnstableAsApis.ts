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
    "m.next_chunk_id": string;
    "m.historical": true;
}

export interface MSC2716ChunkEventContent {
    "m.chunk_id": string;
    "m.historical": true;
}

export interface MSC2716MarkerEventContent {
    "m.insertion_id": string;
    "m.historical": true;
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
}

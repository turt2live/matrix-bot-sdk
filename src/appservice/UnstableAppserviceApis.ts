import { MatrixClient } from "../MatrixClient";
import { MSC2716BatchSendResponse } from "../models/MSC2176";

/**
 * Unstable APIs that shouldn't be used in most circumstances for appservices.
 * @category Unstable APIs
 */
export class UnstableAppserviceApis {
    constructor(private client: MatrixClient) {
    }

    /**
     * Send several historical events into a room.
     * @see https://github.com/matrix-org/matrix-doc/pull/2716
     * @param {string} roomId The roomID to send to.
     * @param {string} prevEventId The event ID where this batch will be inserted
     * @param {string} chunkId The chunk ID returned from a previous call. Set falsy to start at the beginning.
     * @param {any[]} events A set of event contents for events to be inserted into the room.
     * @param {any[]} stateEventsAtStart A set of state events to be inserted into the room. Defaults to empty.
     * @returns A set of eventIds and the next chunk ID
     */
    public async sendHistoricalEventBatch(roomId: string, prevEventId: string, events: any[], stateEventsAtStart: any[] = [], chunkId?: string): Promise<MSC2716BatchSendResponse> {
        return this.client.doRequest("POST", `/_matrix/client/unstable/org.matrix.msc2716/rooms/${encodeURIComponent(roomId)}/batch_send`,
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

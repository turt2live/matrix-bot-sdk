import { MatrixClient } from "../MatrixClient";
import { MSC2716BatchSendResponse } from "../models/MSC2176";

/**
 * Unstable APIs that shouldn't be used in most circumstances for appservices.
 * @category Unstable APIs
 */
export class UnstableAppserviceApis {
    private requestId = 0;

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
        return this.client.doRequest("POST", `/_matrix/client/unstable/org.matrix.msc2716/rooms/${encodeURIComponent(roomId)}/batch_send`, {
            prev_event: prevEventId,
            chunk_id: chunkId,
        }, {
            events,
            state_events_at_start: stateEventsAtStart,
        });
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
        const txnId = `${(new Date().getTime())}__inc_appts${++this.requestId}`;
        const path = `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(eventType)}/${encodeURIComponent(txnId)}`;
        const response = await this.client.doRequest("PUT", path, { ts }, content);
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
        const path = `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(type)}/${encodeURIComponent(stateKey)}`;
        const response = await this.client.doRequest("PUT", path, { ts }, content);
        return response.event_id;
    }
}

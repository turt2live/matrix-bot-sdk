/**
 * Response object for a batch send operation.
 * @category Models
 */
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

// TODO: Verify docs and move to events subdirectory if appropriate

/**
 * Partial event content for an inserted MSC2716 event.
 * @category Matrix event contents
 */
export interface MSC2716InsertionEventContent {
    "org.matrix.msc2716.next_chunk_id": string;
    "org.matrix.msc2716.historical": true;
}

/**
 * Partial event content for a chunked MSC2716 event.
 * @category Matrix event contents
 */
export interface MSC2716ChunkEventContent {
    "org.matrix.msc2716.chunk_id": string;
    "org.matrix.msc2716.historical": true;
}

/**
 * Partial event content for a marked MSC2716 event.
 * @category Matrix event contents
 */
export interface MSC2716MarkerEventContent {
    "org.matrix.msc2716.insertion_id": string;
    "org.matrix.msc2716.historical": true;
}

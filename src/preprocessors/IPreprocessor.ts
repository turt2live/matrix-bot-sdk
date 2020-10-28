import { MatrixClient } from "../MatrixClient";
import { EventKind } from "..";

/**
 * Represents a preprocessor.
 * @category Preprocessors
 */
export interface IPreprocessor {
    /**
     * Gets the types of events this preprocessor supports.
     */
    getSupportedEventTypes(): string[];

    /**
     * Processes an event, modifying it in-place if needed.
     * @param {any} event The event that should be processed.
     * @param {MatrixClient} client The Matrix client that is providing the event.
     * @param {EventKind|null|undefined} kind Optional kind identifier for an event. When not
     * supplied, the event is assumed to be a RoomEvent.
     * @returns {Promise<any>} Resolved when the event is has been modified. The resolved
     * value is ignored.
     */
    processEvent(event: any, client: MatrixClient, kind?: EventKind): Promise<any>;
}

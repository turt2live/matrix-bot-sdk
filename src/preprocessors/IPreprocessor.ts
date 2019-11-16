import { MatrixClient } from "../MatrixClient";

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
     * @param {*} event The event that should be processed.
     * @param {MatrixClient} client The Matrix client that is providing the event.
     * @returns {Promise<*>} Resolved when the event is has been modified. The resolved
     * value is ignored.
     */
    processEvent(event: any, client: MatrixClient): Promise<any>;
}

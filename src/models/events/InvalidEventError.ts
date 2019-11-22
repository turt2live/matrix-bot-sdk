/**
 * Thrown when an event is invalid.
 * @category Matrix events
 */
export class InvalidEventError extends Error {
    constructor(message: string = null) {
        super(message);
    }
}

/**
 * Thrown when an event is redacted.
 * @category Matrix events
 */
export class EventRedactedError extends InvalidEventError {
    constructor(message: string = null) {
        super(message);
    }
}

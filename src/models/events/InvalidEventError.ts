export class InvalidEventError extends Error {
    constructor(message: string = null) {
        super(message);
    }
}

export class EventRedactedError extends InvalidEventError {
    constructor(message: string = null) {
        super(message);
    }
}

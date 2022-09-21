/**
 * Represents an HTTP error from the Matrix server.
 * @category Error handling
 */
export class MatrixError extends Error {
    /**
     * The Matrix error code
     */
    public readonly errcode: string;

    /**
     * Optional human-readable error message.
     */
    public readonly error: string;

    /**
     * If rate limited, the time in milliseconds to wait before retrying the request
     */
    public readonly retryAfterMs?: number;

    /**
     * Creates a new Matrix Error
     * @param body The error body.
     * @param statusCode The HTTP status code.
     */
    constructor(public readonly body: { errcode: string, error: string, retry_after_ms?: number }, public readonly statusCode: number) {
        super();
        this.errcode = body.errcode;
        this.error = body.error;
        this.retryAfterMs = body.retry_after_ms;
    }

    /**
     * Developer-friendly error message.
     */
    public get message() {
        return `${this.errcode}: ${this.error}`;
    }
}

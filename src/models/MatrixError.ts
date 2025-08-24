import { LogService } from "../logging/LogService";

/**
 * Represents an HTTP error from the Matrix server.
 * @category Error handling
 */
export class MatrixError extends Error {
    /**
     * Parse a Retry-After header into a number of milliseconds.
     * @see https://www.rfc-editor.org/rfc/rfc9110#field.retry-after
     * @param header The value of a Retry-After header.
     * @throws If the date could not be parsed.
     */
    static parseRetryAfterHeader(header: string): number {
        // First try to parse as seconds
        const retryAfterSeconds = parseInt(header, 10);
        if (!Number.isNaN(retryAfterSeconds)) {
            return retryAfterSeconds * 1000;
        }
        const retryAfterDate = new Date(header);
        return retryAfterDate.getTime() - Date.now();
    }

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
    constructor(public readonly body: { errcode: string, error: string, retry_after_ms?: number }, public readonly statusCode: number, headers: Record<string, string>) {
        super();
        this.errcode = body.errcode;
        this.error = body.error;
        const retryAfterHeader = headers['retry-after'];
        if (this.statusCode === 429 && retryAfterHeader) {
            try {
                this.retryAfterMs = MatrixError.parseRetryAfterHeader(retryAfterHeader);
            } catch (ex) {
                // Could not parse...skip handling for now.
                LogService.warn("MatrixError", "Could not parse Retry-After header from request.", ex);
            }
        }
        // Fall back to the deprecated retry_after_ms property.
        if (!this.retryAfterMs && body.retry_after_ms) {
            this.retryAfterMs = body.retry_after_ms;
        }
    }

    /**
     * Developer-friendly error message.
     */
    public get message() {
        return `${this.errcode}: ${this.error}`;
    }
}

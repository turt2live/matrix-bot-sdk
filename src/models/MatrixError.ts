export default class MatrixError extends Error {
    public readonly errcode: string;
    public readonly error: string;
    public readonly retryAfterMs?: number;
    constructor(public readonly body: {errcode: string, error: string, retry_after_ms?: number}, public readonly statusCode: number) {
        super();
        this.errcode = body.errcode;
        this.error = body.error;
        this.retryAfterMs = body.retry_after_ms;
    }

    get message() {
        return `${this.errcode}: ${this.error}`
    }
}

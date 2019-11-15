/**
 * A Matrix event.
 */
export class MatrixEvent<T extends Object> {
    constructor(protected event: any) {
    }

    /**
     * The user ID who sent this event.
     */
    public get sender(): string {
        return this.event['sender'];
    }

    /**
     * The type of this event.
     */
    public get type(): string {
        return this.event['type'];
    }

    /**
     * The content for this event. May have no properties.
     */
    public get content(): T {
        return this.event['content'] || {};
    }
}

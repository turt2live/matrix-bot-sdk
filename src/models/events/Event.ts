/**
 * A Matrix event.
 * @category Matrix events
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

    /**
     * Gets the raw event that this MatrixEvent is using.
     * Note that there's no guarantees on formats here - it is the exact
     * same input to the constructor.
     */
    public get raw(): any {
        return this.event;
    }
}

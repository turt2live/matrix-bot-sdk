import { MatrixEvent } from "./Event";

/**
 * The typical unsigned data found on an event.
 * @category Matrix event info
 * @see RoomEvent
 */
export interface TypicalUnsigned {
    /**
     * The age of this event in seconds.
     */
    age?: number;

    /**
     * Other properties which may be included.
     */
    [prop: string]: any;
}

/**
 * Empty room event content.
 * @category Matrix event contents
 */
export interface RoomEventContent {
    // This is empty so people can avoid using RoomEvent<any>
}

/**
 * A Matrix room event.
 * @category Matrix events
 */
export class RoomEvent<T extends Object> extends MatrixEvent<T> {
    constructor(protected event: any) {
        super(event);
    }

    /**
     * The event ID of this event.
     */
    public get eventId(): string {
        return this.event['event_id'];
    }

    /**
     * The timestamp in milliseconds this event was sent.
     */
    public get timestamp(): number {
        return this.event['origin_server_ts'];
    }

    /**
     * The unsigned content for this event. May have no properties.
     */
    public get unsigned(): TypicalUnsigned {
        return this.event['unsigned'] || {};
    }
}

/**
 * A room state event.
 * @category Matrix events
 */
export class StateEvent<T extends Object> extends RoomEvent<T> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The state key for this event. May be an empty string.
     */
    public get stateKey(): string {
        return this.event['state_key'];
    }

    /**
     * The previous content for this state event. Will be an empty
     * object if there is no previous content.
     */
    public get previousContent(): T {
        return this.unsigned['prev_content'] || this.event['prev_content'] || {}; // v2, v1, fallback
    }
}


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

export interface RoomEventData<T extends (Object | unknown) = unknown> {
    /**
     * The fields in this object will vary depending on the type of event.
     */
    content: T;
    /**
     * The globally unique event identifier.
     */
    event_id: string;
    /**
     * Timestamp in milliseconds on originating homeserver when this event was sent.
     */
    origin_server_ts: number;
    /**
     * The ID of the room associated with this event. Will not be present on events that arrive through /sync, despite being required everywhere else.
     */
    room_id: string;
    /**
     * Contains the fully-qualified ID of the user who sent this event.
     */
    sender: string;
    /**
     * The type of event. This SHOULD be namespaced similar to Java package naming conventions e.g. `com.example.subdomain.event.type`
     */
    type: string;
    /**
     * Contains optional extra information about the event.
     */
    unsinged: TypicalUnsigned;
}

export interface RoomStateEventData<T extends (Object | unknown) = unknown, P = T> extends RoomEventData<T> {
    /**
     * A unique key which defines the overwriting semantics for this piece of room state.
     */
    state_key: string;
    /**
     * The previous content for this event. If there is no previous content, this key will be missing.
     */
    prev_content?: P;
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
export class RoomEvent<T extends (Object | unknown) = unknown> extends MatrixEvent<T> {
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
export class StateEvent<T extends (Object | unknown) = unknown> extends RoomEvent<T> {
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


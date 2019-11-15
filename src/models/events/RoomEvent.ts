import { MembershipEvent } from "./MembershipEvent";

/**
 * The typical unsigned data found on an event.
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
 * A Matrix room event.
 */
export class RoomEvent<T extends Object> {
    constructor(protected event: any) {
    }

    /**
     * The event ID of this event.
     */
    public get eventId(): string {
        return this.event['event_id'];
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

    /**
     * The content for this event. May have no properties.
     */
    public get content(): T {
        return this.event['content'] || {};
    }
}

/**
 * A room state event.
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
        return this.event['prev_content'] || {};
    }
}

/**
 * Wraps a room event into a more suitable container.
 * @param {*} event The event object to wrap.
 * @returns {RoomEvent<*>} An instance of the most suitable container for the event.
 */
export function wrapRoomEvent(event: any): RoomEvent<any> {
    if (!event) return null;

    if (event['state_key'] || event['state_key'] !== '') {
        if (event['type'] === 'm.room.member') {
            return new MembershipEvent(event);
        } else {
            return new StateEvent<any>(event);
        }
    } else {
        return new RoomEvent<any>(event)
    }
}

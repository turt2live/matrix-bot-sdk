import { RoomEvent } from "./RoomEvent";

/**
 * The content definition for m.room.redaction events
 * @category Matrix event contents
 * @see RedactionEvent
 */
export interface RedactionEventContent {
    /**
     * The event ID or IDs this event redacts.
     */
    redacts?: string | string[]; // MSC2174 & MSC2244
}

/**
 * Represents an m.room.redaction room event
 * @category Matrix events
 */
export class RedactionEvent extends RoomEvent<RedactionEventContent> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The event ID this event redacts.
     * @deprecated It is possible for multiple events to be redacted depending on the room version.
     */
    public get redactsEventId(): string {
        return this.redactsEventIds[0];
    }

    /**
     * The event IDs this event redacts.
     */
    public get redactsEventIds(): string[] {
        if (Array.isArray(this.content.redacts)) {
            return this.content.redacts;
        } else if (this.content.redacts) {
            return [this.content.redacts];
        } else {
            return [this.event['redacts']];
        }
    }
}

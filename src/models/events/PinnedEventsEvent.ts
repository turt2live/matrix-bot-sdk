import { StateEvent } from "./RoomEvent";

/**
 * The content definition for m.room.pinned_events events
 * @category Matrix event contents
 * @see PinnedEventsEvent
 */
export interface PinnedEventsEventContent {
    /**
     * The event IDs that are pinned in the room.
     */
    pinned: string[]
}

/**
 * Represents an m.room.pinned_events state event
 * @category Matrix events
 */
export class PinnedEventsEvent extends StateEvent<PinnedEventsEventContent> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The event IDs that are pinned in the room.
     */
    public get pinnedEventIds(): string[] {
        return this.content.pinned || [];
    }
}

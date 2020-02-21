import { RoomEvent, RoomEventContent, StateEvent } from "./events/RoomEvent";

export interface EventContext {
    /**
     * The event that was used to build this context.
     */
    event: RoomEvent<RoomEventContent>;

    /**
     * The events that happened before the contextual event.
     */
    before: RoomEvent<RoomEventContent>[];

    /**
     * The events that happened after the contextual event.
     */
    after: RoomEvent<RoomEventContent>[];

    /**
     * The state of the room at the point of the last event returned.
     */
    state: StateEvent<RoomEventContent>[];
}

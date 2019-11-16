import { StateEvent } from "./RoomEvent";

/**
 * The content definition for m.room.topic events
 */
export interface RoomTopicEventContent {
    topic: string;
}

/**
 * Represents an m.room.topic state event
 */
export class RoomTopicEvent extends StateEvent<RoomTopicEventContent> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The topic of the room.
     */
    public get topic(): string {
        return this.content.topic;
    }
}

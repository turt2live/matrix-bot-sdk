import { StateEvent } from "./RoomEvent";

/**
 * Information about the previous room.
 * @category Matrix event info
 * @see CreateEventContent
 */
export interface PreviousRoomInfo {
    /**
     * The old room ID.
     */
    room_id: string;

    /**
     * The last known event ID in the old room.
     */
    event_id: string;
}

/**
 * The content definition for m.room.create events
 * @category Matrix event contents
 * @see CreateEvent
 */
export interface CreateEventContent {
    /**
     * The user ID who created the room.
     */
    creator: string;

    /**
     * Whether or not this room is federated. Default true.
     */
    "m.federate"?: boolean;

    /**
     * The version of the room. Default "1".
     */
    room_version?: string;

    /**
     * Information about the old room.
     */
    predecessor?: PreviousRoomInfo;
}

/**
 * Represents an m.room.create state event
 * @category Matrix events
 */
export class CreateEvent extends StateEvent<CreateEventContent> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The user ID who created the room.
     */
    public get creator(): string {
        return this.content.creator || this.sender;
    }

    /**
     * The version of the room. Defaults to "1".
     */
    public get version(): string {
        return this.content.room_version || "1";
    }

    /**
     * Whether or not the room is federated. Default true (federated).
     */
    public get federated(): boolean {
        return this.content['m.federate'] !== false;
    }
}

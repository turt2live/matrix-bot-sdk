import { StateEvent } from "./RoomEvent";
import { DimensionalFileInfo } from "./MessageEvent";

/**
 * The content definition for m.room.avatar events
 * @category Matrix event contents
 * @see RoomAvatarEvent
 */
export interface RoomAvatarEventContent {
    /**
     * The URL to the image for the avatar of the room.
     */
    url: string;

    /**
     * Optional information about the avatar.
     */
    info?: DimensionalFileInfo;
}

/**
 * Represents an m.room.avatar state event
 * @category Matrix events
 */
export class RoomAvatarEvent extends StateEvent<RoomAvatarEventContent> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The URL for the avatar of the room.
     */
    public get avatarUrl(): string {
        return this.content.url;
    }
}

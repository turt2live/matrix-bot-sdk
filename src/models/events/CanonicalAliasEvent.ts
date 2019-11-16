import { StateEvent } from "./RoomEvent";

/**
 * The content definition for m.room.canonical_alias events
 */
export interface CanonicalAliasEventContent {
    /**
     * The canonical alias for the room.
     */
    alias: string;
}

/**
 * Represents an m.room.canonical_alias state event
 */
export class CanonicalAliasEvent extends StateEvent<CanonicalAliasEventContent> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The alias the room is considering canonical
     */
    public get aliases(): string {
        return this.content.alias;
    }
}

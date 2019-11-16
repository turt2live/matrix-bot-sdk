import { StateEvent } from "./RoomEvent";

/**
 * The content definition for m.room.aliases events
 * @category Matrix event contents
 * @see AliasesEvent
 */
export interface AliasesEventContent {
    /**
     * The aliases this domain has published to the room.
     */
    aliases: string[];
}

/**
 * Represents an m.room.aliases state event
 * @category Matrix events
 */
export class AliasesEvent extends StateEvent<AliasesEventContent> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The domain the aliases belong to.
     */
    public get forDomain(): string {
        return this.stateKey;
    }

    /**
     * The aliases the domain has published to the room.
     */
    public get aliases(): string[] {
        return this.content.aliases || [];
    }
}

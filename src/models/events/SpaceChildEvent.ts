import { StateEvent } from "./RoomEvent";

/**
 * The content definition for m.space.child events
 * @category Matrix event contents
 * @see SpaceChildEvent
 */
export interface SpaceChildEventContent {
    /**
     * The servers the client should provide to the server when trying to join the room.
     * When not provided or empty, the child is considered not part of the space.
     */
    via: string[];

    /**
     * A short string to differentiate the rendering order of entities.
     * @see validateSpaceOrderString
     */
    order?: string;

    /**
     * Whether or not the entity is intended to be a suggested entity.
     */
    suggested?: boolean;
}

/**
 * Represents an m.space.child state event
 * @category Matrix events
 */
export class SpaceChildEvent extends StateEvent<SpaceChildEventContent> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The room ID of the space or room this child represents.
     */
    public get entityRoomId(): string {
        return this.stateKey;
    }

    /**
     * Whether or not this child is "active" or valid. Inactive children are
     * not considered part of a space.
     */
    public get isActiveChild(): boolean {
        return !!this.viaServers?.length;
    }

    /**
     * The servers the client should provide to the homeserver when trying to
     * join the entity (room). May be empty or falsey to denote the child is
     * inactive.
     */
    public get viaServers(): string[] {
        return this.content.via;
    }

    /**
     * An optional short string to differentiate the rendering order of entities.
     * @see validateSpaceOrderString
     */
    public get order(): string {
        return this.content.order;
    }

    /**
     * Whether or not the child is a suggested entity for users to join.
     */
    public get suggested(): boolean {
        return this.content.suggested ?? false;
    }

}

import { MatrixClient } from "../MatrixClient";
import { UserID } from "../helpers/MatrixEntity";

/**
 * Creation options for a space
 */
export interface SpaceCreateOptions {
    name: string;
    topic?: string;
    avatarUrl?: string;
    isPublic: boolean; // maps to world_readable on true, otherwise private.
    localpart: string;
    invites?: string[];
}

interface SpaceChildEventContent {
    via: string[];
    order?: string;
    suggested?: boolean;
}

interface SpaceParentEventContent {
    via: string[];
    canonical?: boolean;
}

interface AddChildSpaceOpts {
    suggested?: boolean;
    canonical?: boolean;
    via?: string[];
    order?: string;
}


/**
 * An instance representing a Matrix Space.
 * A space is tied to a room.
 */
export class Space {

    public constructor(public readonly roomId: string, public readonly client: MatrixClient) { }

    /**
     * Validate the 'order' parameter of a child space entry. It must be a
     * string between the range of \x20 - \x7F and contain no more than 50
     * characters.
     * @param order The 'order' parameter of a m.space.child
     * @throws If the string is not valid
     * @returns True if the string is valid
     */
    public static validateOrderString(order: string) {
        if (typeof order !== 'string') {
            // Just in case, even though TS should catch this.
            throw Error('order is not a string');
        }
        if (order.length === 0) {
            throw Error('order is an empty string');
        }
        if (order.length > 50) {
            throw Error('order is more than 50 characters and is disallowed');
        }
        if (!order.match(/^[\x20-\x7F]+$/)) {
            // String must be between this range
            throw Error('order contained characters outside the range of the spec.');
        }
        return true;
    }

    /**
     * Creates a new child space.
     * @param opts The options for the new space.
     * @returns Resolves to the created space.
     */
    public async createChildSpace(opts: SpaceCreateOptions, childOpts: AddChildSpaceOpts = {}): Promise<Space> {
        const space = await this.client.createSpace(opts);
        await this.addChildSpace(space, childOpts);
        return space;
    }

    /**
     * Adds a child space to the space. Must be joined to both spaces.
     * @param {Space} space The space to add.
     * @returns {Promise<Space>} Resolves when complete.
     */
    public async addChildSpace(space: Space, childOpts: AddChildSpaceOpts = {}): Promise<void> {
        await this.addChildRoom(space.roomId, childOpts);
    }

    /**
     * Removes a child space from the space. Must be joined to the current space (not needed for child space).
     * @param space The space to remove.
     * @returns Resolves when complete.
     */
    public async removeChildSpace(space: Space): Promise<void> {
        await this.removeChildRoom(space.roomId);
    }

    /**
     * Adds a child room to the space. Must be joined to both the room and the space.
     * @param roomId The room ID to add.
     * @param childOpts Additional options for the child space.
     * @returns Resolves when complete.
     */
    public async addChildRoom(roomId: string, childOpts: AddChildSpaceOpts = {}): Promise<void> {
        const via = childOpts.via ?? [new UserID(await this.client.getUserId()).domain];
        const childContent: SpaceChildEventContent = {via};
        const parentContent: SpaceParentEventContent = {via};

        if (childOpts.canonical)
            parentContent.canonical = childOpts.canonical;

        if (childOpts.suggested)
            childContent.suggested = childOpts.suggested;

        if (childOpts.order) {
            Space.validateOrderString(childOpts.order);
            childContent.order = childOpts.order;
        }

        await this.client.sendStateEvent(roomId, "m.space.parent", this.roomId, parentContent);
        await this.client.sendStateEvent(this.roomId, "m.space.child", roomId, childContent);
    }

    /**
     * Removes a child room from the space. Must be joined to the current space (not needed for child room).
     * @param roomId The room ID to remove.
     * @returns Resolves when complete.
     */
    public async removeChildRoom(roomId: string): Promise<void> {
        await this.client.sendStateEvent(this.roomId, "m.space.child", roomId, { });
    }

    /**
     * Gets all the child rooms on the space. These may be spaces or other rooms.
     * @returns Resolves to the room IDs of the children.
     */
    public async getChildEntities(): Promise<{[roomId: string]: SpaceChildEventContent}> {
        const roomState = await this.client.getRoomState(this.roomId);
        let mapping: {[roomId: string]: SpaceChildEventContent};
        roomState
            .filter(s => s.type === "m.space.child")
            .filter(s => s.content?.via)
            .forEach(s => mapping[s.state_key] = s.content);
        return mapping;
    }

    /**
     * Helper method to invite a user to a space.
     * @param userId The MXID to invite.
     * @returns Resolves when completed.
     */
    public async inviteUserToSpace(userId: string) {
        return this.client.inviteUser(userId, this.roomId);
    }
}

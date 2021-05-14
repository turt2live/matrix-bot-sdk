import { MatrixClient } from "../MatrixClient";
import { UserID } from "../helpers/MatrixEntity";
import { validateSpaceOrderString } from "../simple-validation";
import { SpaceChildEvent, SpaceChildEventContent } from "./events/SpaceChildEvent";

/**
 * Options to be specified when creating a Space.
 * @category Models
 */
export interface SpaceCreateOptions {
    /**
     * The name of the space.
     */
    name: string;

    /**
     * The topic/description for the space.
     */
    topic?: string;

    /**
     * An MXC URI for the space's avatar.
     */
    avatarUrl?: string;

    /**
     * Whether or not the space should be publicly joinable or not.
     */
    isPublic: boolean; // maps to world_readable on true, otherwise private.

    /**
     * Optional localpart for the alias of the space.
     */
    localpart?: string;

    /**
     * User IDs to invite to the space upon creation.
     */
    invites?: string[];
}

/**
 * Options for displaying/handling a child room/space.
 * @category Models
 */
export interface SpaceChildEntityOptions {
    /**
     * Whether or not the entity is intended to be a suggested entity.
     */
    suggested?: boolean;

    /**
     * Servers to try and join through. When not provided, the SDK will try to
     * determine a set.
     */
    via?: string[];

    /**
     * A short string to differentiate the rendering order of entities.
     * @see validateSpaceOrderString
     */
    order?: string;
}

/**
 * Options for creating a new child space or room.
 * @category Models
 */
export type NewChildOpts = SpaceCreateOptions & SpaceChildEntityOptions;

/**
 * A mapping of room ID to space child information.
 * @category Models
 */
export interface SpaceEntityMap {
    [roomId: string]: SpaceChildEvent;
}

/**
 * An instance representing a Matrix Space. A space is tied to a room.
 * @category Models
 */
export class Space {
    public constructor(public readonly roomId: string, public readonly client: MatrixClient) { }

    /**
     * Creates a new child space under this space.
     * @param {SpaceCreateOptions} opts The options for the new space.
     * @returns {Promise<Space>} Resolves to the created space.
     */
    public async createChildSpace(opts: NewChildOpts): Promise<Space> {
        const space = await this.client.createSpace(opts);
        await this.addChildSpace(space, opts);
        return space;
    }

    /**
     * Adds a child space to the space. Must be joined to both spaces.
     * @param {Space} space The space to add.
     * @param {SpaceChildEntityOptions} childOpts Related options for the child's representation.
     * @returns {Promise<Space>} Resolves when complete.
     */
    public async addChildSpace(space: Space, childOpts: SpaceChildEntityOptions = {}): Promise<void> {
        await this.addChildRoom(space.roomId, childOpts);
    }

    /**
     * Removes a child space from the space. Must be joined to the current space (not needed for child space).
     * @param {Space} space The space to remove.
     * @returns {Promise<void>} Resolves when complete.
     */
    public async removeChildSpace(space: Space): Promise<void> {
        await this.removeChildRoom(space.roomId);
    }

    /**
     * Adds a child room to the space. Must be joined to both the room and the space.
     * @param {string} roomId The room ID to add.
     * @param {SpaceChildEntityOptions} childOpts Additional options for the child space.
     * @returns {Promise<void>} Resolves when complete.
     */
    public async addChildRoom(roomId: string, childOpts: SpaceChildEntityOptions = {}): Promise<void> {
        const via = childOpts.via ?? [new UserID(await this.client.getUserId()).domain];
        const childContent: SpaceChildEventContent = {via};

        if (childOpts.suggested) childContent.suggested = childOpts.suggested;
        if (childOpts.order) {
            validateSpaceOrderString(childOpts.order);
            childContent.order = childOpts.order;
        }

        await this.client.sendStateEvent(this.roomId, "m.space.child", roomId, childContent);
    }

    /**
     * Removes a child room from the space. Must be joined to the current space (not needed for child room).
     * @param {string} roomId The room ID to remove.
     * @returns {Promise<void>} Resolves when complete.
     */
    public async removeChildRoom(roomId: string): Promise<void> {
        await this.client.sendStateEvent(this.roomId, "m.space.child", roomId, { });
    }

    /**
     * Gets all the child rooms on the space. These may be spaces or other rooms.
     * @returns {Promise<SpaceEntityMap>} Resolves to a map of children for this space.
     */
    public async getChildEntities(): Promise<SpaceEntityMap> {
        const roomState = await this.client.getRoomState(this.roomId);
        let mapping: SpaceEntityMap = {};
        roomState
            .filter(s => s.type === "m.space.child")
            .filter(s => s.content?.via)
            .forEach(s => mapping[s.state_key] = new SpaceChildEvent(s));
        return mapping;
    }

    /**
     * Invite a user to the current space.
     * @param {string} userId The user ID to invite.
     * @returns {Promise<void>} Resolves when completed.
     */
    public async inviteUser(userId: string) {
        return this.client.inviteUser(userId, this.roomId);
    }
}

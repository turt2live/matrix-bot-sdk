import { MatrixClient } from "../MatrixClient";
import { UserID } from "../helpers/MatrixEntity";

/**
 * Unstable creation options for an MSC1772 Space.
 *
 * Caution: implementation of this class may change without notice or warning, including
 * removal of the class.
 *
 * @deprecated Not intended for use until MSC1772 is ready, at which point the class is replaced.
 * @category Unstable APIs
 */
export interface MSC1772SpaceCreateOptions {
    name: string;
    topic?: string;
    isPublic: boolean; // maps to world_readable on true, otherwise private.
    localpart: string;
}

/**
 * Unstable implementation of MSC1772 Spaces.
 *
 * Caution: implementation of this class may change without notice or warning, including
 * removal of the class.
 *
 * @deprecated Not intended for use until MSC1772 is ready, at which point the class is replaced.
 * @category Unstable APIs
 */
export class MSC1772Space {
    public constructor(public readonly roomId: string, public readonly client: MatrixClient) {
    }

    /**
     * Creates a new child space.
     * @param {MSC1772SpaceCreateOptions} opts The options for the new space.
     * @returns {Promise<MSC1772Space>} Resolves to the created space.
     */
    public async createChildSpace(opts: MSC1772SpaceCreateOptions): Promise<MSC1772Space> {
        const space = await this.client.unstableApis.createSpace(opts);
        await this.addChildSpace(space);
        return space;
    }

    /**
     * Adds a child space to the space. Must be joined to both spaces.
     * @param {MSC1772Space} space The space to add.
     * @returns {Promise<MSC1772Space>} Resolves when complete.
     */
    public async addChildSpace(space: MSC1772Space): Promise<void> {
        await this.addChildRoom(space.roomId);
    }

    /**
     * Removes a child space from the space. Must be joined to the current space (not needed for child space).
     * @param {MSC1772Space} space The space to remove.
     * @returns {Promise<MSC1772Space>} Resolves when complete.
     */
    public async removeChildSpace(space: MSC1772Space): Promise<void> {
        await this.removeChildRoom(space.roomId);
    }

    /**
     * Adds a child room to the space. Must be joined to both the room and the space.
     * @param {string} roomId The room ID to add.
     * @returns {Promise<void>} Resolves when complete.
     */
    public async addChildRoom(roomId: string): Promise<void> {
        await this.client.sendStateEvent(roomId, "org.matrix.msc1772.room.parent", "", {
            room_id: roomId,
            via: [new UserID(await this.client.getUserId()).domain],
        });
        await this.client.sendStateEvent(this.roomId, "org.matrix.msc1772.space.child", roomId, {
            present: true,
            via: [new UserID(await this.client.getUserId()).domain],
        });
    }

    /**
     * Removes a child room from the space. Must be joined to the current space (not needed for child room).
     * @param {string} roomId The room ID to remove.
     * @returns {Promise<MSC1772Space>} Resolves when complete.
     */
    public async removeChildRoom(roomId: string): Promise<void> {
        await this.client.sendStateEvent(this.roomId, "org.matrix.msc1772.space.child", roomId, {
            present: false,
            via: [new UserID(await this.client.getUserId()).domain],
        });
    }

    /**
     * Gets all the child rooms on the space. These may be spaces or other rooms.
     * @returns {Promise<MSC1772Space>} Resolves to the room IDs of the children.
     */
    public async getChildEntities(): Promise<string[]> {
        const roomState = await this.client.getRoomState(this.roomId);
        return roomState
            .filter(s => s.type === "org.matrix.msc1772.space.child")
            .filter(s => s.content?.present === true)
            .map(s => s.state_key);
    }
}

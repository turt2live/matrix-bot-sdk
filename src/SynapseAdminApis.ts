import { MatrixClient } from "./MatrixClient";

/**
 * Information about a user on Synapse.
 * @category Admin APIs
 */
export interface SynapseUser {
    /***
     * The display name of the user, if set.
     */
    displayname?: string;

    /**
     * A set of 3PIDs for the user.
     */
    threepids?: [{
        medium: string;
        address: string;
    }];

    /**
     * The avatar URL (usually MXC URI) for the user, if set.
     */
    avatar_url?: string;

    /**
     * Whether or not the user is a Synapse administrator.
     */
    admin?: boolean;

    /**
     * Whether or not the user is deactivated.
     */
    deactivated?: boolean;
}

/**
 * Added information to include when updating/creating a user.
 * @category Admin APIs
 */
export interface SynapseUserProperties extends SynapseUser {
    /**
     * The password for the user. Leave undefined to leave unchanged.
     */
    password?: string;
}

/**
 * Information about a user on Synapse.
 * @category Admin APIs
 */
export interface SynapseUserListing {
    /**
     * User ID.
     */
    name: string;

    /**
     * Whether or not the user is a guest. 1 is true, 0 is false.
     */
    is_guest: number;

    /**
     * Whether or not the user is an admin. 1 is true, 0 is false.
     */
    admin: number;

    /**
     * Whether or not the user is deactivated. 1 is true, 0 is false.
     */
    deactivated: number;

    /**
     * The type of user, if relevant.
     */
    user_type: string | null;

    /**
     * The hash of the user's password, if relevant.
     */
    password_hash: string | null;

    /**
     * The display name of the user, if set.
     */
    displayname: string | null;

    /**
     * The avatar for the user, if set.
     */
    avatar_url: string | null;
}

/**
 * A resulting list of users on Synapse.
 * @category Admin APIs
 */
export interface SynapseUserList {
    /**
     * A set of users matching the criteria.
     */
    users: SynapseUserListing[];

    /**
     * The token to use to get the next set of users.
     */
    next_token: string;

    /**
     * The total number of users on the Synapse instance.
     */
    total: number;
}

/**
 * Information about a room on Synapse.
 * @category Admin APIs
 */
export interface SynapseRoomListing {
    room_id: string;
    name: string;
    canonical_alias: string;
    joined_members: number;
    joined_local_members: number;
    version: string;
    creator: string;
    encryption: string; // algorithm
    federatable: boolean;
    public: boolean;
    join_rules: string;
    guest_access: string;
    history_visibility: string;
    state_events: number;
}

/**
 * A resulting list of rooms on Synapse.
 * @category Admin APIs
 */
export interface SynapseRoomList {
    rooms: SynapseRoomListing[];

    offset: string;
    total_rooms: number;
    next_batch: string;
    prev_batch: string;
}

/**
 * Available properties on a Synapse room listing to order by.
 * @category Admin APIs
 */
export enum SynapseRoomProperty {
    Name = "name",
    CanonicalAlias = "canonical_alias",
    JoinedMembers = "joined_members",
    JoinedLocalMembers = "joined_local_members",
    Version = "version",
    Creator = "creator",
    Encryption = "encryption",
    CanFederate = "federatable",
    IsPublic = "public",
    JoinRules = "join_rules",
    GuestAccess = "guest_access",
    HistoryVisibility = "history_visibility",
    NumStateEvents = "state_events",
}

/**
 * Access to various administrative APIs specifically available in Synapse.
 * @category Admin APIs
 */
export class SynapseAdminApis {
    constructor(private client: MatrixClient) {
    }

    /**
     * Get information about a user. The client making the request must be an admin user.
     * @param {string} userId The user ID to check.
     * @returns {Promise<SynapseUser>} The resulting Synapse user record
     */
    public async getUser(userId: string): Promise<SynapseUser> {
        return this.client.doRequest(
            "GET", "/_synapse/admin/v2/users/" + encodeURIComponent(userId),
        );
    }

    /**
     * Create or update a given user on a Synapse server. The
     * client making the request must be an admin user.
     * @param {string} userId The user ID to check.
     * @param {SynapseUserProperties} opts Options to set when creating or updating the user.
     * @returns {Promise<SynapseUser>} The resulting Synapse user record
     */
    public async upsertUser(userId: string, opts: SynapseUserProperties = {}): Promise<SynapseUser> {
        return this.client.doRequest(
            "PUT", "/_synapse/admin/v2/users/" + encodeURIComponent(userId), undefined, opts,
        );
    }

    /**
     * Get a list of users registered with Synapse, optionally filtered by some criteria. The
     * client making the request must be an admin user.
     * @param {string} from The token to continue listing users from.
     * @param {number} limit The maximum number of users to request.
     * @param {string} name Optional localpart or display name filter for results.
     * @param {boolean} guests Whether or not to include guest accounts. Default true.
     * @param {boolean} deactivated Whether or not to include deactivated accounts. Default false.
     * @returns {Promise<SynapseUserList>} A batch of user results.
     */
    public async listUsers(from?: string, limit?: number, name?: string, guests = true, deactivated = false): Promise<SynapseUserList> {
        const qs = {guests, deactivated};
        if (from) qs['from'] = from;
        if (limit) qs['limit'] = limit;
        if (name) qs['name'] = name;
        return this.client.doRequest("GET", "/_synapse/admin/v2/users", qs);
    }

    /**
     * Determines if the given user is a Synapse server administrator for this homeserver. The
     * client making the request must be an admin user themselves (check with `isSelfAdmin`)
     * @param {string} userId The user ID to check.
     * @returns {Promise<boolean>} Resolves to true if the user is an admin, false otherwise.
     * Throws if there's an error.
     */
    public async isAdmin(userId: string): Promise<boolean> {
        const response = await this.client.doRequest("GET", `/_synapse/admin/v1/users/${encodeURIComponent(userId)}/admin`);
        return response['admin'] || false;
    }

    /**
     * Determines if the current user is an admin for the Synapse homeserver.
     * @returns {Promise<boolean>} Resolve to true if the user is an admin, false otherwise.
     * Throws if there's an error.
     */
    public async isSelfAdmin(): Promise<boolean> {
        try {
            return await this.isAdmin(await this.client.getUserId());
        } catch (e) {
            if (e?.body?.errcode === 'M_FORBIDDEN') {
                return false;
            }
            throw e;
        }
    }

    /**
     * Lists the rooms on the server.
     * @param {string} searchTerm A term to search for in the room names
     * @param {string} from A previous batch token to search from
     * @param {number} limit The maximum number of rooms to return
     * @param {SynapseRoomProperty} orderBy A property of rooms to order by
     * @param {boolean} reverseOrder True to reverse the orderBy direction.
     * @returns {Promise<SynapseRoomList>} Resolves to the server's rooms, ordered and filtered.
     */
    public async listRooms(searchTerm?: string, from?: string, limit?: number, orderBy?: SynapseRoomProperty, reverseOrder = false): Promise<SynapseRoomList> {
        const params = {};
        if (from) params['from'] = from;
        if (limit) params['limit'] = limit;
        if (searchTerm) params['search_term'] = searchTerm;
        if (orderBy) params['order_by'] = orderBy;
        if (reverseOrder) {
            params['dir'] = 'b';
        } else {
            params['dir'] = 'f';
        }
        return this.client.doRequest("GET", "/_synapse/admin/v1/rooms", params);
    }

    /**
     * Gets a list of state events in a room.
     * @param {string} roomId The room ID to get state for.
     * @returns {Promise<*[]>} Resolves to the room's state events.
     */
    public async getRoomState(roomId: string): Promise<any[]> {
        const r = await this.client.doRequest("GET", `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`);
        return r?.['state'] || [];
    }

    /**
     * Deletes a room from the server, purging all record of it.
     * @param {string} roomId The room to delete.
     * @returns {Promise} Resolves when complete.
     */
    public async deleteRoom(roomId: string): Promise<void> {
        return this.client.doRequest("POST", `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/delete`, {}, {purge: true});
    }
}

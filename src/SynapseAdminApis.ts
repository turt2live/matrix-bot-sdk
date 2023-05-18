import { MatrixClient } from "./MatrixClient";
import { MatrixError } from "./models/MatrixError";

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
     * External IDs for the user.
     */
    external_ids?: {
        auth_provider: string;
        external_id: string;
    }[];

    /**
     * A set of 3PIDs for the user.
     */
    threepids?: {
        medium: string;
        address: string;
    }[];

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
 * A registration token on Synapse
 * @category Admin APIs
 */
export interface SynapseRegistrationToken {
    token: string;
    uses_allowed: null | number;
    pending: number;
    completed: number;
    expiry_time: null | number;
}

export interface SynapseRegistrationTokenUpdateOptions {
    /**
     * The integer number of times the token can be used to complete a registration before it becomes invalid.
     * If null the token will have an unlimited number of uses.
     * Default: unlimited uses.
     */
    uses_allowed?: number | null;

    /**
     * The latest time the token is valid. Given as the number of milliseconds since 1970-01-01 00:00:00 UTC (the start of the Unix epoch).
     * If null the token will not expire.
     * Default: token does not expire.
     */
    expiry_time?: number | null;

}

export interface SynapseRegistrationTokenOptions extends SynapseRegistrationTokenUpdateOptions {
    /**
     * The registration token. A string of no more than 64 characters that consists only of characters matched by the regex [A-Za-z0-9._~-].
     * Default: randomly generated.
     */
    token?: string;

    /**
     * The length of the token randomly generated if token is not specified. Must be between 1 and 64 inclusive.
     * Default: 16.
     */
    length?: number;
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

export interface SynapseListUserOptions {
    /**
     * Filters to only return users with user IDs that contain this value. This parameter is ignored when using the name parameter.
     */
    user_id?: string;

    /**
     * Filters to only return users with user ID localparts or displaynames that contain this value.
     */
    name?: string;

    /**
     * If false will exclude guest users. Defaults to true to include guest users.
     */
    guests?: boolean;

    /**
     * If true will include deactivated users. Defaults to false to exclude deactivated users.
     */
    deactivated?: boolean;

    /**
     * The method by which to sort the returned list of users. If the ordered field has duplicates, the
     * second order is always by ascending name, which guarantees a stable ordering.
     * **Caution**: The database only has indexes on the columns `name` and `creation_ts`. This means
     * that if a different sort order is used, it can cause a large load on the database.
     */
    order_by?: "name" | "is_guest" | "admin" | "user_type" | "deactivated" | "shadow_banned" | "displayname" | "avatar_url" | "creation_ts";

    /**
     * The number of results to return at a time.
     */
    limit?: number;
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
        const qs = { guests, deactivated };
        if (from) qs['from'] = from;
        if (limit) qs['limit'] = limit;
        if (name) qs['name'] = name;
        return this.client.doRequest("GET", "/_synapse/admin/v2/users", qs);
    }

    /**
     * Get a list of all users registered with Synapse, optionally filtered by some criteria. The
     * client making the request must be an admin user.
     *
     * This method returns an async generator that can be used to filter results.
     * @param options Options to pass to the user listing function
     * @example
     * for await (const user of synapseAdminApis.listAllUsers()) {
     *    if (user.name === '@alice:example.com') {
     *       return user;
     *    }
     * }
     */
    public async* listAllUsers(options: SynapseListUserOptions = {}): AsyncGenerator<SynapseUserListing> {
        let from: string | undefined = undefined;
        let response: SynapseUserList;
        do {
            const qs = {
                ...options,
                ...(from && { from }),
            };
            response = await this.client.doRequest("GET", "/_synapse/admin/v2/users", qs);
            for (const user of response.users) {
                yield user;
            }
            from = response.next_token;
        } while (from);
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
        } catch (err) {
            if (err instanceof MatrixError && err.errcode === 'M_FORBIDDEN') {
                return false;
            }
            throw err;
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
     * @returns {Promise<any[]>} Resolves to the room's state events.
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
        return this.client.doRequest("DELETE", `/_synapse/admin/v2/rooms/${encodeURIComponent(roomId)}`, {}, { purge: true });
    }

    /**
     * Gets the status of all active deletion tasks, and all those completed in the last 24h, for the given room_id.
     * @param {string} roomId The room ID to get deletion state for.
     * @returns {Promise<any[]>} Resolves to the room's deletion status results.
     */
    public async getDeleteRoomState(roomId: string): Promise<any[]> {
        const r = await this.client.doRequest("GET", `/_synapse/admin/v2/rooms/${encodeURIComponent(roomId)}/delete_status`);
        return r?.['results'] || [];
    }

    /**
     * List all registration tokens on the homeserver.
     * @param valid If true, only valid tokens are returned.
     * If false, only tokens that have expired or have had all uses exhausted are returned.
     * If omitted, all tokens are returned regardless of validity.

     * @returns An array of registration tokens.
     */
    public async listRegistrationTokens(valid?: boolean): Promise<SynapseRegistrationToken[]> {
        const res = await this.client.doRequest("GET", `/_synapse/admin/v1/registration_tokens`, { valid });
        return res.registration_tokens;
    }

    /**
     * Get details about a single token.
     * @param token The token to fetch.
     * @returns A registration tokens, or null if not found.
     */
    public async getRegistrationToken(token: string): Promise<SynapseRegistrationToken | null> {
        try {
            return await this.client.doRequest("GET", `/_synapse/admin/v1/registration_tokens/${encodeURIComponent(token)}`);
        } catch (e) {
            if (e?.statusCode === 404) {
                return null;
            }
            throw e;
        }
    }

    /**
     * Create a new registration token.
     * @param options Options to pass to the request.
     * @returns The newly created token.
     */
    public async createRegistrationToken(options: SynapseRegistrationTokenOptions = {}): Promise<SynapseRegistrationToken> {
        return this.client.doRequest("POST", `/_synapse/admin/v1/registration_tokens/new`, undefined, options);
    }

    /**
     * Update an existing registration token.
     * @param token The token to update.
     * @param options Options to pass to the request.
     * @returns The newly created token.
     */
    public async updateRegistrationToken(token: string, options: SynapseRegistrationTokenUpdateOptions): Promise<SynapseRegistrationToken> {
        return this.client.doRequest("PUT", `/_synapse/admin/v1/registration_tokens/${encodeURIComponent(token)}`, undefined, options);
    }

    /**
     * Delete a registration token
     * @param token The token to update.
     * @returns A promise that resolves upon success.
     */
    public async deleteRegistrationToken(token: string): Promise<void> {
        return this.client.doRequest("DELETE", `/_synapse/admin/v1/registration_tokens/${encodeURIComponent(token)}`, undefined, {});
    }

    /**
     * Grants another user the highest power available to a local user who is in the room.
     * If the user is not in the room, and it is not publicly joinable, then invite the user.
     * @param roomId The room to make the user admin in.
     * @param userId The user to make admin in the room. If undefined, it uses the authenticated user.
     * @returns Resolves when complete.
     */
    public async makeRoomAdmin(roomId: string, userId?: string): Promise<void> {
        return this.client.doRequest("POST", `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/make_room_admin`, {}, { user_id: userId });
    }
}

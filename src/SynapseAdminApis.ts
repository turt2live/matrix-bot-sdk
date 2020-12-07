import { MatrixClient } from "./MatrixClient";

export interface SynapseUserRecord {
    /***
     * 
     */
    displayname?: string;
    /**
     * A set of 3pids to automatically bind to the user.
     */
    threepids?: [{
        medium: string;
        address: string;
    }];
    /**
     * The MXC URL of an image file to set as the avatar for the user.
     */
    avatar_url?: string;
    /**
     * Should the user be a Synpase administrator. Defaults to false.
     */
    admin?: boolean;
    /**
     * If unspecified, deactivation state will be left unchanged on existing accounts and set to false for new accounts.
     */
    deactivated?: boolean;
}

export interface SynapseUpsertUserBody extends SynapseUserRecord {
    /**
     * The password for the user. Leave undefined to leave unchanged.
     */
    password?: string;
}

export interface SynapseUserListEntry {
    name: string;
    is_guest: number;
    admin: number;
    deactivated: number;
    user_type: string|null;
    password_hash: string|null;
    displayname: string|null;
    avatar_url: string|null;
}

export interface SynapseUserListResponse {
    /**
     * A set of users matching the criteria.
     */
    users: SynapseUserListEntry[];
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
 * Access to various administrative APIs specifically available in Synapse.
 * @category Admin APIs
 */
export class SynapseAdminApis {
    constructor(private client: MatrixClient) {
    }

    /**
     * Get information about a user. The client making the request must be an admin user.
     * @param {string} userId The user ID to check.
     * @returns {Promise<SynapseUserRecord>} The resulting Synapse user record
     */
    public async getUser(userId: string): Promise<SynapseUserRecord> {
        return this.client.doRequest(
            "GET", "/_synapse/admin/v2/users/" + encodeURIComponent(userId),
        );
    }

    /**
     * Create or update a given user on a Synapse server. The
     * client making the request must be an admin user.
     * @param {string} userId The user ID to check.
     * @param {SynapseUpsertUserBody} opts Options to set when creating or updating the user.
     * @returns {Promise<Record<string, unknown>>} The resulting Synapse user record
     */
    public async upsertUser(userId: string, opts: SynapseUpsertUserBody = {}): Promise<SynapseUserRecord> {
        return this.client.doRequest(
            "PUT", "/_synapse/admin/v2/users/" + encodeURIComponent(userId), undefined, opts,
        );
    }

    /**
     * Get a list of users registered with Synapse, optionally filtered by some criteria. The
     * client making the request must be an admin user.
     * @param {string} userId The user ID to check.
     * @param {SynapseUpsertUserBody} opts Options to set when creating or updating the user.
     * @returns {Promise<Record<string, unknown>>} The resulting Synapse user record
     */
    public async listUsers(from: string, limit: number, name?: string, guests = true, deactivated = false): Promise<SynapseUserListResponse> {
        return this.client.doRequest(
            "GET", "/_synapse/admin/v2/users", {from, limit, name, guests, deactivated},
        );
    }

    /**
     * Determines if the given user is a Synapse server administrator for this homeserver. The
     * client making the request must be an admin user themselves (check with `isSelfAdmin`)
     * @param {string} userId The user ID to check.
     * @returns {Promise<boolean>} Resolves to true if the user is an admin, false otherwise.
     * Throws if there's an error.
     */
    public async isAdmin(userId: string): Promise<boolean> {
        const response = await this.client.doRequest("GET", `/_synapse/admin/v2/users/${encodeURIComponent(userId)}/admin`);
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
}

import { MatrixClient } from "./MatrixClient";

/**
 * Access to various administrative APIs specifically available in Synapse.
 * @category Admin APIs
 */
export class SynapseAdminApis {
    constructor(private client: MatrixClient) {
    }

    /**
     * Determines if the given user is a Synapse server administrator for this homeserver. The
     * client making the request must be an admin user themselves (check with `isSelfAdmin`)
     * @param {string} userId The user ID to check.
     * @returns {Promise<boolean>} Resolves to true if the user is an admin, false otherwise.
     * Throws if there's an error.
     */
    public async isAdmin(userId: string): Promise<boolean> {
        const response = await this.client.doRequest("GET", "/_synapse/admin/v2/users/" + encodeURIComponent(userId));
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

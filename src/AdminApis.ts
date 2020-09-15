import { MatrixClient } from "./MatrixClient";
import { SynapseAdminApis } from "./SynapseAdminApis";

/**
 * Whois information about a user.
 * See https://matrix.org/docs/spec/client_server/r0.5.0#get-matrix-client-r0-admin-whois-userid for more information.
 * @category Admin APIs
 */
export interface WhoisInfo {
    user_id: string;
    devices: {
        [device_id: string]: {
            sessions: [{
                connections: WhoisConnectionInfo[]
            }];
        }
    }
}

interface WhoisConnectionInfo {
    /**
     * Most recently seen IP address of the session.
     */
    ip: string;

    /**
     * Unix timestamp that the session was last active.
     */
    last_seen: number;

    /**
     * User agent string last seen in the session.
     */
    user_agent: string;
}

/**
 * Access to various administrative APIs.
 * @category Admin APIs
 */
export class AdminApis {
    constructor(private client: MatrixClient) {
    }

    /**
     * Gets access to the Synapse administrative APIs object.
     */
    public get synapse(): SynapseAdminApis {
        return new SynapseAdminApis(this.client);
    }

    /**
     * Gets information about a particular user.
     * @param {string} userId the user ID to lookup
     * @returns {Promise<WhoisInfo>} resolves to the whois information
     */
    public whoisUser(userId: string): Promise<WhoisInfo> {
        return this.client.doRequest("GET", "/_matrix/client/r0/admin/whois/" + encodeURIComponent(userId));
    }
}

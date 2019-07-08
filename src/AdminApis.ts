import { MatrixClient } from "./MatrixClient";

/**
 * From https://matrix.org/docs/spec/client_server/r0.5.0#get-matrix-client-r0-admin-whois-userid
 */
export interface AdminWhois {
    user_id: string;
    devices: {
        [device_id: string]: {
            sessions: [{
                connections: IAdminWhoisConnection[]
            }];
        }
    }
}

interface IAdminWhoisConnection {
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
 * Unstable APIs that shouldn't be used in most circumstances.
 */
export class AdminApis {
    constructor(private client: MatrixClient) {
    }

    /**
     * Gets information about a particular user.
     * @param {string} userId the user ID to lookup
     * @returns {Promise<AdminWhois>} resolves to the whois information
     */
    public getUserWhois(userId: string): Promise<AdminWhois> {
        return this.client.doRequest("GET", "/_matrix/client/r0/admin/whois/" + encodeURIComponent(userId));
    }
}
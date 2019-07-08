/**
 * From https://matrix.org/docs/spec/client_server/r0.5.0#get-matrix-client-r0-admin-whois-userid
 */
export interface IAdminWhois {
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
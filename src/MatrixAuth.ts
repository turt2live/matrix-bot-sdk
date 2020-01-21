import { MatrixClient } from "./MatrixClient";

/**
 * Functions for interacting with Matrix prior to having an access token. Intended
 * to be used for logging in/registering to get a MatrixClient instance.
 *
 * By design, this limits the options used to create the MatrixClient. To specify
 * custom elements to the client, get the access token from the returned client
 * and create a new MatrixClient instance. Due to the nature of Matrix, it is
 * also recommended to use the homeserverUrl from the generated MatrixClient as
 * it may be different from that given to the MatrixAuth class.
 */
export class MatrixAuth {
    /**
     * Creates a new MatrixAuth class for creating a MatrixClient
     * @param {string} homeserverUrl The homeserver URL to authenticate against.
     */
    public constructor(private homeserverUrl: string) {
        // nothing to do
    }

    /**
     * Generate a client with no access token so we can reuse the doRequest
     * logic already written.
     */
    private createTemplateClient(): MatrixClient {
        return new MatrixClient(this.homeserverUrl, "");
    }

    /**
     * Performs simple registration using a password for the account. This will
     * assume the server supports the m.login.password flow for registration, and
     * will attempt to complete only that stage. The caller is expected to determine
     * if the homeserver supports registration prior to invocation.
     * @param {string} localpart The localpart (username) to register
     * @param {string} password The password to register with
     * @param {string} deviceName The name of the newly created device. Optional.
     * @returns {Promise<MatrixClient>} Resolves to a logged-in MatrixClient
     */
    public async passwordRegister(localpart: string, password: string, deviceName?: string): Promise<MatrixClient> {
        // First try and complete the stage without UIA in hopes the server is kind to us:
        const body = {
            username: localpart,
            password: password,
            initial_device_display_name: deviceName,
        };

        let response;

        try {
            response = await this.createTemplateClient().doRequest("POST", "/_matrix/client/r0/register", null, body);
        } catch (e) {
            if (e.statusCode === 401) {
                if (typeof (e.body) === "string") e.body = JSON.parse(e.body);
                if (!e.body) throw new Error(JSON.stringify(Object.keys(e)));

                // 401 means we need to do UIA, so try and complete a stage
                const sessionId = e.body['session'];
                const expectedFlow = ["m.login.dummy"];

                let hasFlow = false;
                for (const flow of e.body['flows']) {
                    const stages = flow['stages'];
                    if (stages.length !== expectedFlow.length) continue;

                    let stagesMatch = true;
                    for (let i = 0; i < stages.length; i++) {
                        if (stages[i] !== expectedFlow[i]) {
                            stagesMatch = false;
                            break;
                        }
                    }

                    if (stagesMatch) {
                        hasFlow = true;
                        break;
                    }
                }

                if (!hasFlow) throw new Error("Failed to find appropriate login flow in User-Interactive Authentication");

                body['auth'] = {
                    type: expectedFlow[0], // HACK: We assume we only have one entry here
                    session: sessionId,
                };
                response = await this.createTemplateClient().doRequest("POST", "/_matrix/client/r0/register", null, body);
            }
        }

        if (!response) throw new Error("Failed to register");

        const accessToken = response['access_token'];
        if (!accessToken) throw new Error("No access token returned");

        return new MatrixClient(this.homeserverUrl, accessToken);
    }

    /**
     * Performs simple password login with the homeserver. The caller is
     * expected to confirm if the homeserver supports this login flow prior
     * to invocation.
     * @param {string} username The username (localpart or user ID) to log in with
     * @param {string} password The password for the account
     * @param {string} deviceName The name of the newly created device. Optional.
     * @returns {Promise<MatrixClient>} Resolves to a logged-in MatrixClient
     */
    public async passwordLogin(username: string, password: string, deviceName?: string): Promise<MatrixClient> {
        const body = {
            type: "m.login.password",
            identifier: {
                type: "m.id.user",
                user: username,
            },
            password: password,
            initial_device_display_name: deviceName,
        };

        const response = await this.createTemplateClient().doRequest("POST", "/_matrix/client/r0/login", null, body);
        const accessToken = response["access_token"];
        if (!accessToken) throw new Error("Expected access token in response - got nothing");

        let homeserverUrl = this.homeserverUrl;
        if (response['well_known'] && response['well_known']['m.homeserver'] && response['well_known']['m.homeserver']['base_url']) {
            homeserverUrl = response['well_known']['m.homeserver']['base_url'];
        }

        return new MatrixClient(homeserverUrl, accessToken);
    }
}

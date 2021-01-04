import { OpenIDConnectToken } from "../models/OpenIDConnect";
import { doHttpRequest } from "../http";
import { timedIdentityClientFunctionCall } from "../metrics/decorators";
import { Policies } from "../models/Policies";
import { Metrics } from "../metrics/Metrics";
import { Threepid } from "../models/Threepid";
import * as crypto from "crypto";
import { UnpaddedBase64 } from "../helpers/UnpaddedBase64";

/**
 * A way to access an Identity Server using the Identity Service API from a MatrixClient.
 * @category Identity Servers
 */
export class IdentityClient {

    /**
     * The metrics instance for this client. Note that metrics for the underlying MatrixClient will
     * not be available here.
     */
    public readonly metrics: Metrics;

    private constructor(public readonly accessToken: string, public readonly serverUrl: string) {
        this.metrics = new Metrics();
    }

    /**
     * Gets the terms of service for which the identity server has.
     * @returns {Promise<Policies>} Resolves to the policies of the server.
     */
    @timedIdentityClientFunctionCall()
    public getTermsOfService(): Promise<Policies> {
        return this.doRequest("GET", "/_matrix/identity/v2/terms");
    }

    /**
     * Accepts a given set of URLs from Policy objects returned by the server. This implies acceptance of
     * the terms. Note that this will not update the user's account data to consider these terms accepted
     * in the future - that is an exercise left to the caller.
     * @param {string[]} termsUrls The URLs to count as accepted.
     * @returns {Promise<void>} Resolves when complete.
     */
    @timedIdentityClientFunctionCall()
    public acceptTerms(termsUrls: string[]): Promise<void> {
        return this.doRequest("POST", "/_matrix/identity/v2/terms", null, {
            user_accepts: termsUrls,
        });
    }

    /**
     * Accepts all the terms of service offered by the identity server. Note that this is only meant to be
     * used by automated bots where terms acceptance is implicit - the terms of service need to be presented
     * to the user in most cases.
     * @returns {Promise<void>} Resolves when complete.
     */
    @timedIdentityClientFunctionCall()
    public async acceptAllTerms(): Promise<void> {
        const terms = await this.getTermsOfService();
        const urls = new Set<string>();
        for (const policy of Object.values(terms.policies)) {
            let chosenLang = policy["en"];
            if (!chosenLang) {
                chosenLang = policy[Object.keys(policy).find(k => k !== "version")];
            }
            if (!chosenLang) continue; // skip - invalid
            urls.add(chosenLang.url);
        }
        return await this.acceptTerms(Array.from(urls));
    }

    /**
     * Looks up a series of third party identifiers (email addresses or phone numbers) to see if they have
     * associated mappings. The returned array will be ordered the same as the input, and have falsey values
     * in place of any failed/missing lookups (eg: no mapping).
     * @param {Threepid[]} identifiers The identifiers to look up.
     * @param {boolean} allowPlaintext If true, the function will accept the server's offer to use plaintext
     * lookups when no other methods are available. The function will always prefer hashed methods.
     * @returns {Promise<string[]>} Resolves to the user IDs (or falsey values) in the same order as the input.
     */
    public async lookup(identifiers: Threepid[], allowPlaintext = false): Promise<string[]> {
        const hashInfo = await this.doRequest("GET", "/_matrix/identity/v2/hash_details");
        if (!hashInfo?.["algorithms"]) throw new Error("Server not supported: invalid response");

        const algorithms = hashInfo?.["algorithms"];
        let algorithm = algorithms.find(a => a === "sha256");
        if (!algorithm && allowPlaintext) algorithm = algorithms.find(a => a === "none");
        if (!algorithm) throw new Error("No supported hashing algorithm found");

        const body = {
            algorithm,
            pepper: hashInfo["lookup_pepper"],
            addresses: [],
        };

        for (const pid of identifiers) {
            let transformed = null;
            switch (algorithm) {
                case "none":
                    transformed = `${pid.address.toLowerCase()} ${pid.kind}`;
                    break;
                case "sha256":
                    transformed = UnpaddedBase64.encodeBufferUrlSafe(crypto.createHash("sha256")
                        .update(`${pid.address.toLowerCase()} ${pid.kind} ${body.pepper}`).digest());
                    break;
                default:
                    throw new Error("Unsupported hashing algorithm (programming error)");
            }
            body.addresses.push(transformed);
        }

        const resp = await this.doRequest("POST", "/_matrix/identity/v2/lookup", null, body);
        const mappings = resp?.["mappings"] || {};
        const mxids: string[] = [];
        for (const addr of body.addresses) {
            mxids.push(mappings[addr]);
        }
        return mxids;
    }

    /**
     * Performs a web request to the server, applying appropriate authorization headers for
     * this client.
     * @param {"GET"|"POST"|"PUT"|"DELETE"} method The HTTP method to use in the request
     * @param {string} endpoint The endpoint to call. For example: "/_matrix/identity/v2/account"
     * @param {any} qs The query string to send. Optional.
     * @param {any} body The request body to send. Optional. Will be converted to JSON unless the type is a Buffer.
     * @param {number} timeout The number of milliseconds to wait before timing out.
     * @param {boolean} raw If true, the raw response will be returned instead of the response body.
     * @param {string} contentType The content type to send. Only used if the `body` is a Buffer.
     * @param {string} noEncoding Set to true to disable encoding, and return a Buffer. Defaults to false
     * @returns {Promise<any>} Resolves to the response (body), rejected if a non-2xx status code was returned.
     */
    @timedIdentityClientFunctionCall()
    public doRequest(method, endpoint, qs = null, body = null, timeout = 60000, raw = false, contentType = "application/json", noEncoding = false): Promise<any> {
        const headers = {};
        if (this.accessToken) {
            headers["Authorization"] = `Bearer ${this.accessToken}`;
        }
        return doHttpRequest(this.serverUrl, method, endpoint, qs, body, headers, timeout, raw, contentType, noEncoding);
    }

    /**
     * Gets an instance of an identity client.
     * @param {OpenIDConnectToken} oidc The OpenID Connect token to register to the identity server with.
     * @param {string} serverUrl The full URL where the identity server can be reached at.
     */
    public static async acquire(oidc: OpenIDConnectToken, serverUrl: string): Promise<IdentityClient> {
        const account = await doHttpRequest(serverUrl, "POST", "/_matrix/identity/v2/account/register", null, oidc);
        return new IdentityClient(account['token'], serverUrl);
    }
}

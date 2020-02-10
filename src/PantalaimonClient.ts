/**
 * A client specifically designed to interact with Pantalaimon instead of
 * a Matrix homeserver. The key part of this is managing the access token
 * and username/password for interacting with Pantalaimon.
 *
 * If the storage provider given claims to have an access token for
 * this client, it will be used even if Pantalaimon considers it invalid.
 *
 * Expected usage:
 * <code>
 *     const storage = new SimpleFsStorageProvider("storage/bot.json");
 *     const pantalaimon = new PantalaimonClient("http://localhost:8008", storage);
 *
 *     // Note that the credentials will only be used if there is no available access token.
 *     const client = await pantalaimon.createClientWithCredentials("username", "password");
 * </code>
 */
import { IStorageProvider } from "./storage/IStorageProvider";
import { MatrixClient } from "./MatrixClient";
import { MatrixAuth } from "./MatrixAuth";

const ACCESS_TOKEN_STORAGE_KEY = "pantalaimon_access_token";

// TODO: Write a test for this (it's hard because of the many interactions with different parts)

/**
 * Supporting functions for interacting with a Pantalaimon instance.
 * @category Encryption
 */
export class PantalaimonClient {
    /**
     * Creates a new PantalaimonClient class for interacting with Pantalaimon. The storage
     * provider given will also be used in the client.
     * @param {string} homeserverUrl The homeserver (Pantalaimon) URL to interact with.
     * @param {IStorageProvider} storageProvider The storage provider to back the client with.
     */
    public constructor(private homeserverUrl: string, private storageProvider: IStorageProvider) {
        // nothing to do
    }

    /**
     * Authenticates and creates the Pantalaimon-capable client. The username and password given
     * are only used if the storage provider does not reveal an access token.
     * @param {string} username The username to log in with, if needed.
     * @param {string} password The password to log in with, if needed.
     * @returns {Promise<MatrixClient>} Resolves to a MatrixClient ready for interacting with Pantalaimon.
     */
    public async createClientWithCredentials(username: string, password: string): Promise<MatrixClient> {
        const accessToken = await Promise.resolve(this.storageProvider.readValue(ACCESS_TOKEN_STORAGE_KEY));
        if (accessToken) {
            return new MatrixClient(this.homeserverUrl, accessToken, this.storageProvider);
        }

        const auth = new MatrixAuth(this.homeserverUrl);
        const authedClient = await auth.passwordLogin(username, password);

        await Promise.resolve(this.storageProvider.storeValue(ACCESS_TOKEN_STORAGE_KEY, authedClient.accessToken));

        // We recreate the client to ensure we set it up with the right storage provider.
        return new MatrixClient(this.homeserverUrl, authedClient.accessToken, this.storageProvider);
    }
}

/**
 * A storage provider for secure information relating to crypto.
 * @category Storage providers
 */
export interface ICryptoSecureStorageProvider {
    /**
     * Sets the pickle key for the client.
     * @param {string} pickleKey The pickle key to store.
     * @returns {Promise<void>} Resolves when complete.
     */
    setPickleKey(pickleKey: string): Promise<void>;

    /**
     * Gets the pickle key for the client. If no pickle key is set, this resolves
     * to falsy.
     * @returns {Promise<string>} Resolves to the pickle key, or falsy if not set.
     */
    getPickleKey(): Promise<string>;
}

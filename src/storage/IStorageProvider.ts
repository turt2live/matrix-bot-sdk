import { IFilterInfo } from "../IFilter";

/**
 * Represents a storage provider for the matrix client
 * @category Storage providers
 */
export interface IStorageProvider {
    /**
     * Sets the sync token, saving it for later retrieval
     * @param {string} token The token to save
     * @returns {Promise<any>|void} Resolves when complete.
     */
    setSyncToken(token: string | null): Promise<any> | void;

    /**
     * Gets the last saved sync token, or null if none has been persisted.
     * @returns {String|Promise<String>} The last sync token, or null. This can
     * also be a promise for the value.
     */
    getSyncToken(): string | Promise<string | null> | null;

    /**
     * Sets the filter to be used by future clients
     * @param {IFilterInfo} filter The filter to store
     * @returns {Promise<any>|void} Resolves when complete.
     */
    setFilter(filter: IFilterInfo): Promise<any> | void;

    /**
     * Gets the last preferred filter for this client
     * @returns {IFilterInfo|Promise<IFilterInfo>} The last saved filter, or null.
     * This can also be a promise for the filter.
     */
    getFilter(): IFilterInfo | Promise<IFilterInfo>;

    /**
     * Store a simple string value into the provided key.
     * @param {string} key The key to store the value under.
     * @param {string} value The value to store.
     * @returns {Promise<any> | void} Resolves when complete.
     */
    storeValue(key: string, value: string): Promise<any> | void;

    /**
     * Reads a previously stored value under the given key. If the
     * key does not exist, null or undefined is returned.
     * @param {string} key The key to read.
     * @returns {string|Promise<string|null|undefined>|null|undefined} The
     * value, or null/undefined if not found. This may also return a promise
     * of those same values.
     */
    readValue(key: string): string | Promise<string | null | undefined> | null | undefined;
}

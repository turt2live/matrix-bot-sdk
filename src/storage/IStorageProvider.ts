/**
 * Represents a storage provider for the matrix client
 */
import { IFilterInfo } from "../IFilter";

export interface IStorageProvider {
    /**
     * Sets the sync token, saving it for later retrieval
     * @param {string} token The token to save
     */
    setSyncToken(token: string|null): void;

    /**
     * Gets the last saved sync token, or null if none has been persisted.
     * @returns {String} The last sync token, or null
     */
    getSyncToken(): string|null;

    /**
     * Sets the filter to be used by future clients
     * @param {IFilterInfo} filter The filter to store
     */
    setFilter(filter: IFilterInfo): void;

    /**
     * Gets the last preferred filter for this client
     * @returns {IFilterInfo} The last saved filter, or null
     */
    getFilter(): IFilterInfo;

    /**
     * Store a simple string value into the provided key.
     * @param {string} key The key to store the value under.
     * @param {string} value The value to store.
     */
    storeValue(key: string, value: string): void;

    /**
     * Reads a previously stored value under the given key. If the
     * key does not exist, null or undefined is returned.
     * @param {string} key The key to read.
     * @returns {string|null|undefined} The value, or null/undefined if
     * not found.
     */
    readValue(key: string): string|null|undefined;
}

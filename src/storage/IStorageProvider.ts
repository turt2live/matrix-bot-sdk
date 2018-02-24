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
}
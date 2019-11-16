/**
 * A storage provider definition for appservices to use.
 * @category Storage providers
 */
export interface IAppserviceStorageProvider {
    /**
     * Tracks a user ID as "registered".
     */
    addRegisteredUser(userId: string);

    /**
     * Determines if a user ID is registered or not.
     * @returns {boolean} True if registered.
     */
    isUserRegistered(userId: string): boolean;

    /**
     * Flags a transaction as completed.
     * @param {string} transactionId The transaction ID.
     */
    setTransactionCompleted(transactionId: string);

    /**
     * Determines if a transaction has been flagged as completed.
     * @param {string} transactionId The transaction ID to check.
     * @returns {boolean} True if the transaction has been completed.
     */
    isTransactionCompleted(transactionId: string): boolean;
}

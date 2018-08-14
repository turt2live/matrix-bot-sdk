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
}
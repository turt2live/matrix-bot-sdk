import { IStorageProvider } from "./IStorageProvider";
import { IFilterInfo } from "../IFilter";
import { IAppserviceStorageProvider } from "./IAppserviceStorageProvider";

export class MemoryStorageProvider implements IStorageProvider, IAppserviceStorageProvider {

    private syncToken: string;
    private appserviceUsers: { [userId: string]: { registered: boolean } } = {};
    private appserviceTransactions: { [txnId: string]: boolean } = {};

    setSyncToken(token: string | null): void {
        this.syncToken = token;
    }

    getSyncToken(): string | null {
        return this.syncToken;
    }

    setFilter(filter: IFilterInfo): void {
        // Do nothing
    }

    getFilter(): IFilterInfo {
        return null;
    }

    addRegisteredUser(userId: string) {
        this.appserviceUsers[userId] = {
            registered: true,
        };
    }

    isUserRegistered(userId: string): boolean {
        return this.appserviceUsers[userId] && this.appserviceUsers[userId].registered;
    }

    isTransactionCompleted(transactionId: string): boolean {
        return !!this.appserviceTransactions[transactionId];
    }

    setTransactionCompleted(transactionId: string) {
        this.appserviceTransactions[transactionId] = true;
    }
}
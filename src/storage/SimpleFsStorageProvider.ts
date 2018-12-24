import { IStorageProvider } from "./IStorageProvider";
import { IFilterInfo } from "../IFilter";
import * as lowdb from "lowdb";
import * as FileSync from "lowdb/adapters/FileSync";
import { IAppserviceStorageProvider } from "./IAppserviceStorageProvider";
import * as sha512 from "hash.js/lib/hash/sha/512";

export class SimpleFsStorageProvider implements IStorageProvider, IAppserviceStorageProvider {

    private db: any;

    constructor(filename: string) {
        const adapter = new FileSync(filename);
        this.db = lowdb(adapter);

        this.db.defaults({
            syncToken: null,
            filter: null,
            appserviceUsers: {}, // userIdHash => { data }
            appserviceTransactions: {}, // txnIdHash => { data }
        }).write();
    }

    setSyncToken(token: string | null): void {
        this.db.set('syncToken', token).write();
    }

    getSyncToken(): string | null {
        return this.db.get('syncToken').value();
    }

    setFilter(filter: IFilterInfo): void {
        this.db.set('filter', filter);
    }

    getFilter(): IFilterInfo {
        return this.db.get('filter').value();
    }

    addRegisteredUser(userId: string) {
        const key = sha512().update(userId).digest('hex');
        this.db
            .set(`appserviceUsers.${key}.userId`, userId)
            .set(`appserviceUsers.${key}.registered`, true)
            .write();
    }

    isUserRegistered(userId: string): boolean {
        const key = sha512().update(userId).digest('hex');
        return this.db.get(`appserviceUsers.${key}.registered`).value();
    }

    isTransactionCompleted(transactionId: string): boolean {
        const key = sha512().update(transactionId).digest('hex');
        return this.db.get(`appserviceTransactions.${key}.completed`).value();
    }

    setTransactionCompleted(transactionId: string) {
        const key = sha512().update(transactionId).digest('hex');
        this.db
            .set(`appserviceTransactions.${key}.txnId`, transactionId)
            .set(`appserviceTransactions.${key}.completed`, true)
            .write();
    }
}

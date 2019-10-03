import { IStorageProvider } from "./IStorageProvider";
import { IFilterInfo } from "../IFilter";
import * as lowdb from "lowdb";
import * as FileSync from "lowdb/adapters/FileSync";
import { IAppserviceStorageProvider } from "./IAppserviceStorageProvider";
import * as sha512 from "hash.js/lib/hash/sha/512";
import * as mkdirp from "mkdirp";
import * as path from "path";

export class SimpleFsStorageProvider implements IStorageProvider, IAppserviceStorageProvider {

    private db: any;
    private completedTransactions = [];

    constructor(filename: string, private trackTransactionsInMemory = true, private maxInMemoryTransactions = 20) {
        mkdirp.sync(path.dirname(filename));

        const adapter = new FileSync(filename);
        this.db = lowdb(adapter);

        this.db.defaults({
            syncToken: null,
            filter: null,
            appserviceUsers: {}, // userIdHash => { data }
            appserviceTransactions: {}, // txnIdHash => { data }
            kvStore: {}, // key => value (str)
        }).write();
    }

    setSyncToken(token: string | null): void {
        this.db.set('syncToken', token).write();
    }

    getSyncToken(): string | null {
        return this.db.get('syncToken').value();
    }

    setFilter(filter: IFilterInfo): void {
        this.db.set('filter', filter).write();
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
        if (this.trackTransactionsInMemory) {
            return this.completedTransactions.indexOf(transactionId) !== -1;
        }

        const key = sha512().update(transactionId).digest('hex');
        return this.db.get(`appserviceTransactions.${key}.completed`).value();
    }

    setTransactionCompleted(transactionId: string) {
        if (this.trackTransactionsInMemory) {
            if (this.completedTransactions.indexOf(transactionId) === -1) {
                this.completedTransactions.push(transactionId);
            }
            if (this.completedTransactions.length > this.maxInMemoryTransactions) {
                this.completedTransactions = this.completedTransactions.reverse().slice(0, this.maxInMemoryTransactions).reverse();
            }
            return;
        }

        const key = sha512().update(transactionId).digest('hex');
        this.db
            .set(`appserviceTransactions.${key}.txnId`, transactionId)
            .set(`appserviceTransactions.${key}.completed`, true)
            .write();
    }

    readValue(key: string): string | null | undefined {
        return this.db.get("kvStore").value()[key];
    }

    storeValue(key: string, value: string): void {
        const kvStore = this.db.get("kvStore").value();
        kvStore[key] = value;
        this.db.set("kvStore", kvStore).write();
    }
}

import * as lowdb from "lowdb";
import * as FileSync from "lowdb/adapters/FileSync";
import * as sha512 from "hash.js/lib/hash/sha/512";
import * as mkdirp from "mkdirp";
import * as path from "path";

import { IAppserviceStorageProvider } from "./IAppserviceStorageProvider";
import { IFilterInfo } from "../IFilter";
import { IStorageProvider } from "./IStorageProvider";

/**
 * A storage provider that uses the disk to store information.
 * @category Storage providers
 */
export class SimpleFsStorageProvider implements IStorageProvider, IAppserviceStorageProvider {
    private db: any;
    private completedTransactions = [];

    /**
     * Creates a new simple file system storage provider.
     * @param {string} filename The file name (typically 'storage.json') to store data within.
     * @param {boolean} trackTransactionsInMemory True (default) to track all received appservice transactions rather than on disk.
     * @param {int} maxInMemoryTransactions The maximum number of transactions to hold in memory before rotating the oldest out. Defaults to 20.
     */
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

    storageForUser(userId: string): IStorageProvider {
        return new NamespacedFsProvider(userId, this);
    }
}

/**
 * A namespaced storage provider that uses the disk to store information.
 * @category Storage providers
 */
class NamespacedFsProvider implements IStorageProvider {
    constructor(private prefix: string, private parent: SimpleFsStorageProvider) {
    }

    setFilter(filter: IFilterInfo): Promise<any> | void {
        return this.parent.storeValue(`${this.prefix}_int_filter`, JSON.stringify(filter));
    }

    getFilter(): IFilterInfo | Promise<IFilterInfo> {
        return Promise.resolve(this.parent.readValue(`${this.prefix}_int_filter`)).then(r => r ? JSON.parse(r) : r);
    }

    setSyncToken(token: string | null): Promise<any> | void {
        return this.parent.storeValue(`${this.prefix}_int_syncToken`, token);
    }

    getSyncToken(): string | Promise<string | null> | null {
        return Promise.resolve(this.parent.readValue(`${this.prefix}_int_syncToken`)).then(r => r ?? null);
    }

    readValue(key: string): string | Promise<string | null | undefined> | null | undefined {
        return this.parent.readValue(`${this.prefix}_kv_${key}`);
    }

    storeValue(key: string, value: string): Promise<any> | void {
        return this.parent.storeValue(`${this.prefix}_kv_${key}`, value);
    }
}

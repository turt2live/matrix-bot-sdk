import * as postgres from "postgres";

import { IStorageProvider } from "./IStorageProvider";
import { IAppserviceStorageProvider } from "./IAppserviceStorageProvider";
import { IFilterInfo } from "../IFilter";

/**
 * A barebones postgresql storage provider. It is not efficient, but it does work.
 * @category Storage providers
 */
export class SimplePostgresStorageProvider implements IStorageProvider, IAppserviceStorageProvider {
    private readonly db: postgres.Sql;
    private readonly waitPromise: Promise<void>;
    private completedTransactions = [];

    /**
     * Creates a new simple postgresql storage provider.
     * @param connectionString The `postgres://` connection string to use.
     * @param trackTransactionsInMemory True (default) to track all received appservice transactions rather than on disk.
     * @param maxInMemoryTransactions The maximum number of transactions to hold in memory before rotating the oldest out. Defaults to 20.
     */
    constructor(connectionString: string, private trackTransactionsInMemory = true, private maxInMemoryTransactions = 20) {
        this.db = postgres(connectionString);

        this.waitPromise = Promise.all([
            this.db`
                CREATE TABLE IF NOT EXISTS bot_metadata (key TEXT NOT NULL PRIMARY KEY, value TEXT);
            `,
            this.db`
                CREATE TABLE IF NOT EXISTS bot_kv (key TEXT NOT NULL PRIMARY KEY, value TEXT);
            `,
            this.db`
                CREATE TABLE IF NOT EXISTS appservice_users (user_id TEXT NOT NULL PRIMARY KEY, registered BOOLEAN NOT NULL);
            `,
            this.db`
                CREATE TABLE IF NOT EXISTS appservice_transactions (txn_id TEXT NOT NULL PRIMARY KEY, completed BOOLEAN NOT NULL);
            `,
        ]).then();
    }

    public async setSyncToken(token: string | null): Promise<any> {
        await this.waitPromise;
        return this.db`
            INSERT INTO bot_metadata (key, value) VALUES ('syncToken', ${token}) 
            ON CONFLICT (key) DO UPDATE SET value = ${token};
        `;
    }

    public async getSyncToken(): Promise<string | null> {
        await this.waitPromise;
        return (await this.db`
            SELECT value FROM bot_metadata WHERE key = 'syncToken';
        `)[0]?.value;
    }

    public async setFilter(filter: IFilterInfo): Promise<any> {
        await this.waitPromise;
        const filterStr = filter ? JSON.stringify(filter) : null;
        return this.db`
            INSERT INTO bot_metadata (key, value) VALUES ('filter', ${filterStr}) 
            ON CONFLICT (key) DO UPDATE SET value = ${filterStr};
        `;
    }

    public async getFilter(): Promise<IFilterInfo> {
        await this.waitPromise;
        const value = (await this.db`
            SELECT value FROM bot_metadata WHERE key = 'filter';
        `)[0]?.value;
        return typeof value === "string" ? JSON.parse(value) : value;
    }

    public async addRegisteredUser(userId: string): Promise<any> {
        await this.waitPromise;
        return this.db`
            INSERT INTO appservice_users (user_id, registered) VALUES (${userId}, TRUE) 
            ON CONFLICT (user_id) DO UPDATE SET registered = TRUE;
        `;
    }

    public async isUserRegistered(userId: string): Promise<boolean> {
        await this.waitPromise;
        return !!(await this.db`
            SELECT registered FROM appservice_users WHERE user_id = ${userId};
        `)[0]?.registered;
    }

    public async setTransactionCompleted(transactionId: string): Promise<any> {
        await this.waitPromise;
        if (this.trackTransactionsInMemory) {
            if (this.completedTransactions.indexOf(transactionId) === -1) {
                this.completedTransactions.push(transactionId);
            }
            if (this.completedTransactions.length > this.maxInMemoryTransactions) {
                this.completedTransactions = this.completedTransactions.reverse().slice(0, this.maxInMemoryTransactions).reverse();
            }
            return;
        }

        return this.db`
            INSERT INTO appservice_transactions (txn_id, completed) VALUES (${transactionId}, TRUE) 
            ON CONFLICT (txn_id) DO UPDATE SET completed = TRUE;
        `;
    }

    public async isTransactionCompleted(transactionId: string): Promise<boolean> {
        await this.waitPromise;
        if (this.trackTransactionsInMemory) {
            return this.completedTransactions.includes(transactionId);
        }

        return (await this.db`
            SELECT completed FROM appservice_transactions WHERE txn_id = ${transactionId};
        `)[0]?.completed;
    }

    public async readValue(key: string): Promise<string | null | undefined> {
        await this.waitPromise;
        return (await this.db`
            SELECT value FROM bot_kv WHERE key = ${key};
        `)[0]?.value;
    }

    public async storeValue(key: string, value: string): Promise<void> {
        await this.waitPromise;
        return this.db`
            INSERT INTO bot_kv (key, value) VALUES (${key}, ${value}) 
            ON CONFLICT (key) DO UPDATE SET value = ${value};            
        `.then();
    }

    public storageForUser(userId: string): IStorageProvider {
        return new NamespacedPostgresProvider(userId, this);
    }
}

/**
 * A namespaced storage provider that uses postgres to store information.
 * @category Storage providers
 */
class NamespacedPostgresProvider implements IStorageProvider {
    constructor(private prefix: string, private parent: SimplePostgresStorageProvider) {
    }

    public setFilter(filter: IFilterInfo): Promise<any> | void {
        return this.parent.storeValue(`${this.prefix}_internal_filter`, JSON.stringify(filter));
    }

    public async getFilter(): Promise<IFilterInfo> {
        return this.parent.readValue(`${this.prefix}_internal_filter`).then(r => r ? JSON.parse(r) : r);
    }

    public setSyncToken(token: string | null): Promise<any> | void {
        return this.parent.storeValue(`${this.prefix}_internal_syncToken`, token ?? "");
    }

    public async getSyncToken(): Promise<string> {
        return this.parent.readValue(`${this.prefix}_internal_syncToken`).then(r => r === "" ? null : r);
    }

    public storeValue(key: string, value: string): Promise<any> | void {
        return this.parent.storeValue(`${this.prefix}_internal_kv_${key}`, value);
    }

    public readValue(key: string): string | Promise<string | null | undefined> | null | undefined {
        return this.parent.readValue(`${this.prefix}_internal_kv_${key}`);
    }
}

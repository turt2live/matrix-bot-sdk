import { ICryptoStorageProvider } from "./ICryptoStorageProvider";
import { EncryptionEventContent } from "../models/events/EncryptionEvent";
import * as Database from "better-sqlite3";

/**
 * Sqlite crypto storage provider. Requires `better-sqlite3` package to be installed.
 * @category Storage providers
 */
export class SqliteCryptoStorageProvider implements ICryptoStorageProvider {
    private readyPromise: Promise<void>;
    private db: Database.Database;

    private kvUpsert: Database.Statement;
    private kvSelect: Database.Statement;
    private roomUpsert: Database.Statement;
    private roomOneSelect: Database.Statement;

    /**
     * Creates a new Sqlite storage provider.
     * @param {string} path The file path to store the database at. Use ":memory:" to
     * store the database entirely in memory, or an empty string to do the equivalent
     * on the disk.
     */
    public constructor(path: string) {
        this.db = new Database(path);
        this.readyPromise = new Promise<void>(async resolve => {
            await this.db.exec("CREATE TABLE IF NOT EXISTS kv (name TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
            await this.db.exec("CREATE TABLE IF NOT EXISTS rooms (room_id TEXT PRIMARY KEY NOT NULL, config TEXT NOT NULL)");

            this.kvUpsert = this.db.prepare("INSERT INTO kv (name, value) VALUES (@name, @value) ON CONFLICT (name) DO UPDATE SET value = @value");
            this.kvSelect = this.db.prepare("SELECT name, value FROM kv WHERE name = @name");

            this.roomUpsert = this.db.prepare("INSERT INTO rooms (room_id, config) VALUES (@roomId, @config) ON CONFLICT (room_id) DO UPDATE SET config = @config");
            this.roomOneSelect = this.db.prepare("SELECT room_id, config FROM rooms WHERE room_id = @roomId");

            resolve();
        });
    }

    public async setDeviceId(deviceId: string): Promise<void> {
        await this.readyPromise;
        await this.kvUpsert.run({
            name: 'deviceId',
            value: deviceId,
        });
    }

    public async getDeviceId(): Promise<string> {
        await this.readyPromise;
        const row = await this.kvSelect.get({name: 'deviceId'});
        return row?.value;
    }

    public async setPickleKey(pickleKey: string): Promise<void> {
        await this.readyPromise;
        await this.kvUpsert.run({
            name: 'pickleKey',
            value: pickleKey,
        });
    }

    public async getPickleKey(): Promise<string> {
        await this.readyPromise;
        const row = await this.kvSelect.get({name: 'pickleKey'});
        return row?.value;
    }

    public async setPickledAccount(pickled: string): Promise<void> {
        await this.readyPromise;
        await this.kvUpsert.run({
            name: 'pickled',
            value: pickled,
        });
    }

    public async getPickledAccount(): Promise<string> {
        await this.readyPromise;
        const row = await this.kvSelect.get({name: 'pickled'});
        return row?.value;
    }

    public async storeRoom(roomId: string, config: Partial<EncryptionEventContent>): Promise<void> {
        await this.readyPromise;
        await this.roomUpsert.run({
            roomId: roomId,
            config: JSON.stringify(config),
        });
    }

    public async getRoom(roomId: string): Promise<Partial<EncryptionEventContent>> {
        await this.readyPromise;
        const row = await this.roomOneSelect.get({roomId: roomId});
        const val = row?.config;
        return val ? JSON.parse(val) : null;
    }

    /**
     * Closes the crypto store. Primarily for testing purposes.
     */
    public async close() {
        this.db.close();
        this.readyPromise = new Promise(() => {});
    }
}

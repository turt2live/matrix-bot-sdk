import { ICryptoStorageProvider } from "./ICryptoStorageProvider";
import { EncryptionEventContent } from "../models/events/EncryptionEvent";
import * as Database from "better-sqlite3";
import { UserDevice } from "../models/Crypto";

/**
 * Sqlite crypto storage provider. Requires `better-sqlite3` package to be installed.
 * @category Storage providers
 */
export class SqliteCryptoStorageProvider implements ICryptoStorageProvider {
    private db: Database.Database;

    private kvUpsert: Database.Statement;
    private kvSelect: Database.Statement;
    private roomUpsert: Database.Statement;
    private roomSelect: Database.Statement;
    private userUpsert: Database.Statement;
    private userSelect: Database.Statement;
    private userDeviceUpsert: Database.Statement;
    private userDevicesDelete: Database.Statement;
    private userDevicesSelect: Database.Statement;

    /**
     * Creates a new Sqlite storage provider.
     * @param {string} path The file path to store the database at. Use ":memory:" to
     * store the database entirely in memory, or an empty string to do the equivalent
     * on the disk.
     */
    public constructor(path: string) {
        this.db = new Database(path);
        this.db.exec("CREATE TABLE IF NOT EXISTS kv (name TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
        this.db.exec("CREATE TABLE IF NOT EXISTS rooms (room_id TEXT PRIMARY KEY NOT NULL, config TEXT NOT NULL)");
        this.db.exec("CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY NOT NULL, outdated TINYINT NOT NULL)");
        this.db.exec("CREATE TABLE IF NOT EXISTS user_devices (user_id TEXT NOT NULL, device_id TEXT NOT NULL, device TEXT NOT NULL, PRIMARY KEY (user_id, device_id))");

        this.kvUpsert = this.db.prepare("INSERT INTO kv (name, value) VALUES (@name, @value) ON CONFLICT (name) DO UPDATE SET value = @value");
        this.kvSelect = this.db.prepare("SELECT name, value FROM kv WHERE name = @name");

        this.roomUpsert = this.db.prepare("INSERT INTO rooms (room_id, config) VALUES (@roomId, @config) ON CONFLICT (room_id) DO UPDATE SET config = @config");
        this.roomSelect = this.db.prepare("SELECT room_id, config FROM rooms WHERE room_id = @roomId");

        this.userUpsert = this.db.prepare("INSERT INTO users (user_id, outdated) VALUES (@userId, @outdated) ON CONFLICT (user_id) DO UPDATE SET outdated = @outdated");
        this.userSelect = this.db.prepare("SELECT user_id, outdated FROM users WHERE user_id = @userId");

        this.userDeviceUpsert = this.db.prepare("INSERT INTO user_devices (user_id, device_id, device) VALUES (@userId, @deviceId, @device) ON CONFLICT (user_id, device_id) DO UPDATE SET device = @device");
        this.userDevicesDelete = this.db.prepare("DELETE FROM user_devices WHERE user_id = @userId");
        this.userDevicesSelect = this.db.prepare("SELECT user_id, device_id, device FROM user_devices WHERE user_id = @userId");
    }

    public async setDeviceId(deviceId: string): Promise<void> {
        this.kvUpsert.run({
            name: 'deviceId',
            value: deviceId,
        });
    }

    public async getDeviceId(): Promise<string> {
        const row = this.kvSelect.get({name: 'deviceId'});
        return row?.value;
    }

    public async setPickleKey(pickleKey: string): Promise<void> {
        this.kvUpsert.run({
            name: 'pickleKey',
            value: pickleKey,
        });
    }

    public async getPickleKey(): Promise<string> {
        const row = this.kvSelect.get({name: 'pickleKey'});
        return row?.value;
    }

    public async setPickledAccount(pickled: string): Promise<void> {
        this.kvUpsert.run({
            name: 'pickled',
            value: pickled,
        });
    }

    public async getPickledAccount(): Promise<string> {
        const row = this.kvSelect.get({name: 'pickled'});
        return row?.value;
    }

    public async storeRoom(roomId: string, config: Partial<EncryptionEventContent>): Promise<void> {
        this.roomUpsert.run({
            roomId: roomId,
            config: JSON.stringify(config),
        });
    }

    public async getRoom(roomId: string): Promise<Partial<EncryptionEventContent>> {
        const row = this.roomSelect.get({roomId: roomId});
        const val = row?.config;
        return val ? JSON.parse(val) : null;
    }

    public async setUserDevices(userId: string, devices: UserDevice[]): Promise<void> {
        this.db.transaction(() => {
            this.userUpsert.run({userId: userId, outdated: 0});
            this.userDevicesDelete.run({userId: userId});
            for (const device of devices) {
                this.userDeviceUpsert.run({userId: userId, deviceId: device.device_id, device: JSON.stringify(device)});
            }
        })();
    }

    public async getUserDevices(userId: string): Promise<UserDevice[]> {
        const results = this.userDevicesSelect.all({userId: userId})
        if (!results) return [];
        return results.map(d => JSON.parse(d.device));
    }

    public async flagUsersOutdated(userIds: string[]): Promise<void> {
        this.db.transaction(() => {
            for (const userId of userIds) {
                this.userUpsert.run({userId: userId, outdated: 1});
            }
        })();
    }

    public async isUserOutdated(userId: string): Promise<boolean> {
        const user = this.userSelect.get({userId: userId});
        return user ? Boolean(user.outdated) : true;
    }

    /**
     * Closes the crypto store. Primarily for testing purposes.
     */
    public async close() {
        this.db.close();
    }
}

import { ICryptoStorageProvider } from "./ICryptoStorageProvider";
import { EncryptionEventContent } from "../models/events/EncryptionEvent";
import {
    IInboundGroupSession,
    IOlmSession,
    IOutboundGroupSession,
    StoredUserDevice,
    UserDevice,
} from "../models/Crypto";
import { IAppserviceCryptoStorageProvider } from "./IAppserviceStorageProvider";
import * as pgPromise from "pg-promise";
import { IDatabase } from "pg-promise";
import { IClient } from "pg-promise/typescript/pg-subset";
import { ICryptoSecureStorageProvider } from "./ICryptoSecureStorageProvider";

const DEFAULT_NAMESPACE = "default";

// Init library
const psql = pgPromise();

/**
 * PostgreSQL crypto storage provider for appservices and clients. Requires `pg-promise` package to be installed.
 * @category Storage providers
 */
export class NamespacingPostgresCryptoStorageProvider implements IAppserviceCryptoStorageProvider, ICryptoStorageProvider {
    private db: IDatabase<{}, IClient>;
    private namespace = DEFAULT_NAMESPACE;
    private setup: Promise<void>;
    private secureStorage: ICryptoSecureStorageProvider;

    private kvUpsert = "INSERT INTO kv (ns, name, value) VALUES ($[ns], $[name], $[value]) ON CONFLICT (ns, name) DO UPDATE SET value = $[value]";
    private kvSelect = "SELECT ns, name, value FROM kv WHERE name = $[name] AND ns = $[ns]";
    private roomUpsert = "INSERT INTO rooms (room_id, config) VALUES ($[roomId], $[config]) ON CONFLICT (room_id) DO UPDATE SET config = $[config]";
    private roomSelect = "SELECT room_id, config FROM rooms WHERE room_id = $[roomId]";
    private userUpsert = "INSERT INTO users (user_id, outdated) VALUES ($[userId], $[outdated]) ON CONFLICT (user_id) DO UPDATE SET outdated = $[outdated]";
    private userSelect = "SELECT user_id, outdated FROM users WHERE user_id = $[userId]";
    private userDeviceUpsert = "INSERT INTO user_devices (user_id, device_id, device, active) VALUES ($[userId], $[deviceId], $[device], $[active]) ON CONFLICT (user_id, device_id) DO UPDATE SET device = $[device], active = $[active]";
    private userDevicesDelete = "UPDATE user_devices SET active = false WHERE user_id = $[userId]";
    private userDevicesSelect = "SELECT user_id, device_id, device, active FROM user_devices WHERE user_id = $[userId]";
    private userActiveDevicesSelect = "SELECT user_id, device_id, device, active FROM user_devices WHERE user_id = $[userId] AND active = true";
    private userActiveDeviceSelect = "SELECT user_id, device_id, device, active FROM user_devices WHERE user_id = $[userId] AND device_id = $[deviceId] AND active = true";
    private obGroupSessionUpsert = "INSERT INTO outbound_group_sessions (ns, session_id, room_id, current, pickled, uses_left, expires_ts) VALUES ($[ns], $[sessionId], $[roomId], $[current], $[pickled], $[usesLeft], $[expiresTs]) ON CONFLICT (ns, session_id, room_id) DO UPDATE SET pickled = $[pickled], current = $[current], uses_left = $[usesLeft], expires_ts = $[expiresTs]";
    private obGroupSessionSelect = "SELECT ns, session_id, room_id, current, pickled, uses_left, expires_ts FROM outbound_group_sessions WHERE session_id = $[sessionId] AND room_id = $[roomId] AND ns = $[ns]";
    private obGroupCurrentSessionSelect = "SELECT ns, session_id, room_id, current, pickled, uses_left, expires_ts FROM outbound_group_sessions WHERE room_id = $[roomId] AND current = true AND ns = $[ns]";
    private obGroupSessionMarkAllInactive = "UPDATE outbound_group_sessions SET current = false WHERE room_id = $[roomId] AND ns = $[ns]";
    private obSentGroupSessionUpsert = "INSERT INTO sent_outbound_group_sessions (ns, session_id, room_id, session_index, user_id, device_id) VALUES ($[ns], $[sessionId], $[roomId], $[sessionIndex], $[userId], $[deviceId]) ON CONFLICT (ns, session_id, room_id, user_id, device_id, session_index) DO NOTHING";
    private obSentSelectLastSent = "SELECT ns, session_id, room_id, session_index, user_id, device_id FROM sent_outbound_group_sessions WHERE user_id = $[userId] AND device_id = $[deviceId] AND room_id = $[roomId] AND ns = $[ns]";
    private olmSessionUpsert = "INSERT INTO olm_sessions (ns, user_id, device_id, session_id, last_decryption_ts, pickled) VALUES ($[ns], $[userId], $[deviceId], $[sessionId], $[lastDecryptionTs], $[pickled]) ON CONFLICT (ns, user_id, device_id, session_id) DO UPDATE SET last_decryption_ts = $[lastDecryptionTs], pickled = $[pickled]";
    private olmSessionCurrentSelect = "SELECT ns, user_id, device_id, session_id, last_decryption_ts, pickled FROM olm_sessions WHERE user_id = $[userId] AND device_id = $[deviceId] AND ns = $[ns] ORDER BY last_decryption_ts DESC LIMIT 1";
    private olmSessionSelect = "SELECT ns, user_id, device_id, session_id, last_decryption_ts, pickled FROM olm_sessions WHERE user_id = $[userId] AND device_id = $[deviceId] AND ns = $[ns]";
    private ibGroupSessionUpsert = "INSERT INTO inbound_group_sessions (ns, session_id, room_id, user_id, device_id, pickled) VALUES ($[ns], $[sessionId], $[roomId], $[userId], $[deviceId], $[pickled]) ON CONFLICT (ns, session_id, room_id, user_id, device_id) DO UPDATE SET pickled = $[pickled]";
    private ibGroupSessionSelect = "SELECT ns, session_id, room_id, user_id, device_id, pickled FROM inbound_group_sessions WHERE session_id = $[sessionId] AND room_id = $[roomId] AND user_id = $[userId] AND device_id = $[deviceId] AND ns = $[ns]";
    private deMetadataUpsert = "INSERT INTO decrypted_event_metadata (ns, room_id, event_id, session_id, message_index) VALUES ($[ns], $[roomId], $[eventId], $[sessionId], $[messageIndex]) ON CONFLICT (ns, room_id, event_id) DO UPDATE SET message_index = $[messageIndex], session_id = $[sessionId]";
    private deMetadataSelect = "SELECT ns, room_id, event_id, session_id, message_index FROM decrypted_event_metadata WHERE room_id = $[roomId] AND session_id = $[sessionId] AND message_index = $[messageIndex] AND ns = $[ns] LIMIT 1";

    /**
     * Creates a new PostgreSQL storage provider.
     * @param {string} connectionString A postgresql connection string to the database.
     * @param {ICryptoSecureStorageProvider} secureStorage Secure storage for pickle information.
     * @see https://github.com/vitaly-t/pg-promise/wiki/Connection-Syntax
     */
    public constructor(connectionString: string, secureStorage: ICryptoSecureStorageProvider);

    /**
     * Creates a new namespaced storage provider.
     * @param {string} namespace The namespace.
     * @param {NamespacingPostgresCryptoStorageProvider} parent The parent provider.
     */
    public constructor(namespace: string, parent: NamespacingPostgresCryptoStorageProvider);

    /**
     * Combined constructor implementation.
     */
    constructor(cnOrNamespace: string, parentOrSecureStorage?: NamespacingPostgresCryptoStorageProvider | ICryptoSecureStorageProvider) {
        if (parentOrSecureStorage instanceof NamespacingPostgresCryptoStorageProvider) {
            this.namespace = cnOrNamespace;

            this.setup = parentOrSecureStorage.setup;
            this.db = parentOrSecureStorage.db;
            this.secureStorage = parentOrSecureStorage.secureStorage;

            return;
        }

        this.secureStorage = parentOrSecureStorage;

        this.db = psql(cnOrNamespace);
        this.setup = new Promise<void>(async (resolve, reject) => {
            try {
                await this.db.none("CREATE TABLE IF NOT EXISTS kv (ns TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (ns, name))");
                await this.db.none("CREATE TABLE IF NOT EXISTS rooms (room_id TEXT PRIMARY KEY NOT NULL, config TEXT NOT NULL)");
                await this.db.none("CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY NOT NULL, outdated BOOL NOT NULL)");
                await this.db.none("CREATE TABLE IF NOT EXISTS user_devices (user_id TEXT NOT NULL, device_id TEXT NOT NULL, device TEXT NOT NULL, active BOOL NOT NULL, PRIMARY KEY (user_id, device_id))");
                await this.db.none("CREATE TABLE IF NOT EXISTS outbound_group_sessions (ns TEXT NOT NULL, session_id TEXT NOT NULL, room_id TEXT NOT NULL, current BOOL NOT NULL, pickled TEXT NOT NULL, uses_left INT NOT NULL, expires_ts BIGINT NOT NULL, PRIMARY KEY (ns, session_id, room_id))");
                await this.db.none("CREATE TABLE IF NOT EXISTS sent_outbound_group_sessions (ns TEXT NOT NULL, session_id TEXT NOT NULL, room_id TEXT NOT NULL, session_index INT NOT NULL, user_id TEXT NOT NULL, device_id TEXT NOT NULL, PRIMARY KEY (ns, session_id, room_id, user_id, device_id, session_index))");
                await this.db.none("CREATE TABLE IF NOT EXISTS olm_sessions (ns TEXT NOT NULL, user_id TEXT NOT NULL, device_id TEXT NOT NULL, session_id TEXT NOT NULL, last_decryption_ts BIGINT NOT NULL, pickled TEXT NOT NULL, PRIMARY KEY (ns, user_id, device_id, session_id))");
                await this.db.none("CREATE TABLE IF NOT EXISTS inbound_group_sessions (ns TEXT NOT NULL, session_id TEXT NOT NULL, room_id TEXT NOT NULL, user_id TEXT NOT NULL, device_id TEXT NOT NULL, pickled TEXT NOT NULL, PRIMARY KEY (ns, session_id, room_id, user_id, device_id))");
                await this.db.none("CREATE TABLE IF NOT EXISTS decrypted_event_metadata (ns TEXT NOT NULL, room_id TEXT NOT NULL, event_id TEXT NOT NULL, session_id TEXT NOT NULL, message_index INT NOT NULL, PRIMARY KEY (ns, room_id, event_id))");
                await this.db.none("CREATE INDEX IF NOT EXISTS idx_decrypted_event_metadata_by_message_index ON decrypted_event_metadata (ns, room_id, session_id, message_index)");

                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    public async setDeviceId(deviceId: string): Promise<void> {
        await this.setup;
        return this.db.none(this.kvUpsert, {
            ns: this.namespace,
            name: 'deviceId',
            value: deviceId,
        });
    }

    public async getDeviceId(): Promise<string> {
        await this.setup;
        const row = await this.db.oneOrNone(this.kvSelect, {
            ns: this.namespace,
            name: 'deviceId',
        });
        return row?.value;
    }

    public async setPickleKey(pickleKey: string): Promise<void> {
        await this.setup;
        return this.secureStorage.setPickleKey(pickleKey);
    }

    public async getPickleKey(): Promise<string> {
        await this.setup;
        return this.secureStorage.getPickleKey();
    }

    public async setPickledAccount(pickled: string): Promise<void> {
        await this.setup;
        // TODO: Use secure storage
        return this.db.none(this.kvUpsert, {
            ns: this.namespace,
            name: 'pickled',
            value: pickled,
        });
    }

    public async getPickledAccount(): Promise<string> {
        await this.setup;
        const row = await this.db.oneOrNone(this.kvSelect, {
            ns: this.namespace,
            name: 'pickled',
        });
        return row?.value;
    }

    public async storeRoom(roomId: string, config: Partial<EncryptionEventContent>): Promise<void> {
        await this.setup;
        return this.db.none(this.roomUpsert, {
            roomId: roomId,
            config: JSON.stringify(config),
        });
    }

    public async getRoom(roomId: string): Promise<Partial<EncryptionEventContent>> {
        await this.setup;
        const row = await this.db.oneOrNone(this.roomSelect, {
            roomId: roomId,
        });
        const val = row?.config;
        return val ? JSON.parse(val) : null;
    }

    public async setActiveUserDevices(userId: string, devices: UserDevice[]): Promise<void> {
        await this.setup;
        return this.db.tx(async t => {
            await t.none(this.userUpsert, {
                userId: userId,
                outdated: false,
            });
            await t.none(this.userDevicesDelete, {
                userId: userId,
            });
            for (const device of devices) {
                await t.none(this.userDeviceUpsert, {
                    userId: userId,
                    deviceId: device.device_id,
                    device: JSON.stringify(device),
                    active: true,
                });
            }
        });
    }

    public async getActiveUserDevices(userId: string): Promise<UserDevice[]> {
        await this.setup;
        const results = await this.db.manyOrNone(this.userActiveDevicesSelect, {
            userId: userId,
        });
        if (!results) return [];
        return results.map(d => JSON.parse(d.device));
    }

    public async getActiveUserDevice(userId: string, deviceId: string): Promise<UserDevice> {
        await this.setup;
        const result = await this.db.oneOrNone(this.userActiveDeviceSelect, {
            userId: userId,
            deviceId: deviceId,
        });
        return result ? JSON.parse(result.device) : null;
    }

    public async getAllUserDevices(userId: string): Promise<StoredUserDevice[]> {
        await this.setup;
        const results = await this.db.manyOrNone(this.userDevicesSelect, {
            userId: userId,
        });
        if (!results) return [];
        return results.map(d => Object.assign({}, JSON.parse(d.device), {unsigned: {bsdkIsActive: d.active}}));
    }

    public async flagUsersOutdated(userIds: string[]): Promise<void> {
        await this.setup;
        return this.db.tx(async t => {
            for (const userId of userIds) {
                await t.none(this.userUpsert, {
                    userId: userId,
                    outdated: true,
                });
            }
        });
    }

    public async isUserOutdated(userId: string): Promise<boolean> {
        await this.setup;
        const user = await this.db.oneOrNone(this.userSelect, {
            userId: userId,
        });
        return user ? user.outdated : true;
    }

    public async storeOutboundGroupSession(session: IOutboundGroupSession): Promise<void> {
        await this.setup;
        return this.db.tx(async t => {
            if (session.isCurrent) {
                await t.none(this.obGroupSessionMarkAllInactive, {
                    ns: this.namespace,
                    roomId: session.roomId,
                });
            }
            await t.none(this.obGroupSessionUpsert, {
                ns: this.namespace,
                sessionId: session.sessionId,
                roomId: session.roomId,
                pickled: session.pickled,
                current: session.isCurrent,
                usesLeft: session.usesLeft,
                expiresTs: session.expiresTs,
            });
        });
    }

    public async getOutboundGroupSession(sessionId: string, roomId: string): Promise<IOutboundGroupSession> {
        await this.setup;
        const result = await this.db.oneOrNone(this.obGroupSessionSelect, {
            ns: this.namespace,
            sessionId: sessionId,
            roomId: roomId,
        });
        if (result) {
            return {
                sessionId: result.session_id,
                roomId: result.room_id,
                pickled: result.pickled,
                isCurrent: result.current,
                usesLeft: result.uses_left,
                expiresTs: result.expires_ts,
            };
        }
        return null;
    }

    public async getCurrentOutboundGroupSession(roomId: string): Promise<IOutboundGroupSession> {
        await this.setup;
        const result = await this.db.oneOrNone(this.obGroupCurrentSessionSelect, {
            ns: this.namespace,
            roomId: roomId,
        });
        if (result) {
            return {
                sessionId: result.session_id,
                roomId: result.room_id,
                pickled: result.pickled,
                isCurrent: result.current,
                usesLeft: result.uses_left,
                expiresTs: result.expires_ts,
            };
        }
        return null;
    }

    public async storeSentOutboundGroupSession(session: IOutboundGroupSession, index: number, device: UserDevice): Promise<void> {
        await this.setup;
        return this.db.none(this.obSentGroupSessionUpsert, {
            ns: this.namespace,
            sessionId: session.sessionId,
            roomId: session.roomId,
            sessionIndex: index,
            userId: device.user_id,
            deviceId: device.device_id,
        });
    }

    public async getLastSentOutboundGroupSession(userId: string, deviceId: string, roomId: string): Promise<{sessionId: string, index: number}> {
        await this.setup;
        const result = await this.db.oneOrNone(this.obSentSelectLastSent, {
            ns: this.namespace,
            userId: userId,
            deviceId: deviceId,
            roomId: roomId,
        });
        if (result) {
            return {sessionId: result.session_id, index: result.session_index};
        }
        return null;
    }

    public async storeOlmSession(userId: string, deviceId: string, session: IOlmSession): Promise<void> {
        await this.setup;
        return this.db.none(this.olmSessionUpsert, {
            ns: this.namespace,
            userId: userId,
            deviceId: deviceId,
            sessionId: session.sessionId,
            lastDecryptionTs: session.lastDecryptionTs,
            pickled: session.pickled,
        });
    }

    public async getCurrentOlmSession(userId: string, deviceId: string): Promise<IOlmSession> {
        await this.setup;
        const result = await this.db.oneOrNone(this.olmSessionCurrentSelect, {
            ns: this.namespace,
            userId: userId,
            deviceId: deviceId,
        });
        if (!result) return null;
        return {
            sessionId: result.session_id,
            pickled: result.pickled,
            lastDecryptionTs: result.last_decryption_ts,
        };
    }

    public async getOlmSessions(userId: string, deviceId: string): Promise<IOlmSession[]> {
        await this.setup;
        const result = await this.db.manyOrNone(this.olmSessionSelect, {
            ns: this.namespace,
            userId: userId,
            deviceId: deviceId,
        });
        return (result || []).map(r => ({
            sessionId: r.session_id,
            pickled: r.pickled,
            lastDecryptionTs: r.last_decryption_ts,
        }));
    }

    public async storeInboundGroupSession(session: IInboundGroupSession): Promise<void> {
        await this.setup;
        return this.db.none(this.ibGroupSessionUpsert, {
            ns: this.namespace,
            sessionId: session.sessionId,
            roomId: session.roomId,
            userId: session.senderUserId,
            deviceId: session.senderDeviceId,
            pickled: session.pickled,
        });
    }

    public async getInboundGroupSession(senderUserId: string, senderDeviceId: string, roomId: string, sessionId: string): Promise<IInboundGroupSession> {
        await this.setup;
        const result = await this.db.oneOrNone(this.ibGroupSessionSelect, {
            ns: this.namespace,
            sessionId: sessionId,
            roomId: roomId,
            userId: senderUserId,
            deviceId: senderDeviceId,
        });
        if (result) {
            return {
                sessionId: result.session_id,
                roomId: result.room_id,
                senderUserId: result.user_id,
                senderDeviceId: result.device_id,
                pickled: result.pickled,
            };
        }
        return null;
    }

    public async setMessageIndexForEvent(roomId: string, eventId: string, sessionId: string, messageIndex: number): Promise<void> {
        await this.setup;
        return this.db.none(this.deMetadataUpsert, {
            ns: this.namespace,
            roomId: roomId,
            eventId: eventId,
            sessionId: sessionId,
            messageIndex: messageIndex,
        });
    }

    public async getEventForMessageIndex(roomId: string, sessionId: string, messageIndex: number): Promise<string> {
        await this.setup;
        const result = await this.db.oneOrNone(this.deMetadataSelect, {
            ns: this.namespace,
            roomId: roomId,
            sessionId: sessionId,
            messageIndex: messageIndex,
        });
        return result?.event_id;
    }

    public storageForUser(userId: string): ICryptoStorageProvider {
        return new NamespacingPostgresCryptoStorageProvider(userId, this);
    }
}

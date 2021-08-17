import { ICryptoStorageProvider } from "./ICryptoStorageProvider";
import { EncryptionEventContent } from "../models/events/EncryptionEvent";
import * as Database from "better-sqlite3";
import {
    IInboundGroupSession,
    IOlmSession,
    IOutboundGroupSession,
    StoredUserDevice,
    UserDevice,
} from "../models/Crypto";

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
    private userActiveDevicesSelect: Database.Statement;
    private userActiveDeviceSelect: Database.Statement;
    private obGroupSessionUpsert: Database.Statement;
    private obGroupSessionSelect: Database.Statement;
    private obGroupCurrentSessionSelect: Database.Statement;
    private obGroupSessionMarkAllInactive: Database.Statement;
    private obSentGroupSessionUpsert: Database.Statement;
    private obSentSelectLastSent: Database.Statement;
    private olmSessionUpsert: Database.Statement;
    private olmSessionCurrentSelect: Database.Statement;
    private olmSessionSelect: Database.Statement;
    private ibGroupSessionUpsert: Database.Statement;
    private ibGroupSessionSelect: Database.Statement;
    private deMetadataUpsert: Database.Statement;
    private deMetadataSelect: Database.Statement;

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
        this.db.exec("CREATE TABLE IF NOT EXISTS user_devices (user_id TEXT NOT NULL, device_id TEXT NOT NULL, device TEXT NOT NULL, active TINYINT NOT NULL, PRIMARY KEY (user_id, device_id))");
        this.db.exec("CREATE TABLE IF NOT EXISTS outbound_group_sessions (session_id TEXT NOT NULL, room_id TEXT NOT NULL, current TINYINT NOT NULL, pickled TEXT NOT NULL, uses_left NUMBER NOT NULL, expires_ts NUMBER NOT NULL, PRIMARY KEY (session_id, room_id))");
        this.db.exec("CREATE TABLE IF NOT EXISTS sent_outbound_group_sessions (session_id TEXT NOT NULL, room_id TEXT NOT NULL, session_index INT NOT NULL, user_id TEXT NOT NULL, device_id TEXT NOT NULL, PRIMARY KEY (session_id, room_id, user_id, device_id, session_index))");
        this.db.exec("CREATE TABLE IF NOT EXISTS olm_sessions (user_id TEXT NOT NULL, device_id TEXT NOT NULL, session_id TEXT NOT NULL, last_decryption_ts NUMBER NOT NULL, pickled TEXT NOT NULL, PRIMARY KEY (user_id, device_id, session_id))");
        this.db.exec("CREATE TABLE IF NOT EXISTS inbound_group_sessions (session_id TEXT NOT NULL, room_id TEXT NOT NULL, user_id TEXT NOT NULL, device_id TEXT NOT NULL, pickled TEXT NOT NULL, PRIMARY KEY (session_id, room_id, user_id, device_id))");
        this.db.exec("CREATE TABLE IF NOT EXISTS decrypted_event_metadata (room_id TEXT NOT NULL, event_id TEXT NOT NULL, session_id TEXT NOT NULL, message_index INT NOT NULL, PRIMARY KEY (room_id, event_id))");
        this.db.exec("CREATE INDEX IF NOT EXISTS idx_decrypted_event_metadata_by_message_index ON decrypted_event_metadata (room_id, session_id, message_index)");

        this.kvUpsert = this.db.prepare("INSERT INTO kv (name, value) VALUES (@name, @value) ON CONFLICT (name) DO UPDATE SET value = @value");
        this.kvSelect = this.db.prepare("SELECT name, value FROM kv WHERE name = @name");

        this.roomUpsert = this.db.prepare("INSERT INTO rooms (room_id, config) VALUES (@roomId, @config) ON CONFLICT (room_id) DO UPDATE SET config = @config");
        this.roomSelect = this.db.prepare("SELECT room_id, config FROM rooms WHERE room_id = @roomId");

        this.userUpsert = this.db.prepare("INSERT INTO users (user_id, outdated) VALUES (@userId, @outdated) ON CONFLICT (user_id) DO UPDATE SET outdated = @outdated");
        this.userSelect = this.db.prepare("SELECT user_id, outdated FROM users WHERE user_id = @userId");

        this.userDeviceUpsert = this.db.prepare("INSERT INTO user_devices (user_id, device_id, device, active) VALUES (@userId, @deviceId, @device, @active) ON CONFLICT (user_id, device_id) DO UPDATE SET device = @device, active = @active");
        this.userDevicesDelete = this.db.prepare("UPDATE user_devices SET active = 0 WHERE user_id = @userId");
        this.userDevicesSelect = this.db.prepare("SELECT user_id, device_id, device, active FROM user_devices WHERE user_id = @userId");
        this.userActiveDevicesSelect = this.db.prepare("SELECT user_id, device_id, device, active FROM user_devices WHERE user_id = @userId AND active = 1");
        this.userActiveDeviceSelect = this.db.prepare("SELECT user_id, device_id, device, active FROM user_devices WHERE user_id = @userId AND device_id = @deviceId AND active = 1");

        this.obGroupSessionUpsert = this.db.prepare("INSERT INTO outbound_group_sessions (session_id, room_id, current, pickled, uses_left, expires_ts) VALUES (@sessionId, @roomId, @current, @pickled, @usesLeft, @expiresTs) ON CONFLICT (session_id, room_id) DO UPDATE SET pickled = @pickled, current = @current, uses_left = @usesLeft, expires_ts = @expiresTs");
        this.obGroupSessionSelect = this.db.prepare("SELECT session_id, room_id, current, pickled, uses_left, expires_ts FROM outbound_group_sessions WHERE session_id = @sessionId AND room_id = @roomId");
        this.obGroupCurrentSessionSelect = this.db.prepare("SELECT session_id, room_id, current, pickled, uses_left, expires_ts FROM outbound_group_sessions WHERE room_id = @roomId AND current = 1");
        this.obGroupSessionMarkAllInactive = this.db.prepare("UPDATE outbound_group_sessions SET current = 0 WHERE room_id = @roomId");

        this.obSentGroupSessionUpsert = this.db.prepare("INSERT INTO sent_outbound_group_sessions (session_id, room_id, session_index, user_id, device_id) VALUES (@sessionId, @roomId, @sessionIndex, @userId, @deviceId) ON CONFLICT (session_id, room_id, user_id, device_id, session_index) DO NOTHING");
        this.obSentSelectLastSent = this.db.prepare("SELECT session_id, room_id, session_index, user_id, device_id FROM sent_outbound_group_sessions WHERE user_id = @userId AND device_id = @deviceId AND room_id = @roomId");

        this.olmSessionUpsert = this.db.prepare("INSERT INTO olm_sessions (user_id, device_id, session_id, last_decryption_ts, pickled) VALUES (@userId, @deviceId, @sessionId, @lastDecryptionTs, @pickled) ON CONFLICT (user_id, device_id, session_id) DO UPDATE SET last_decryption_ts = @lastDecryptionTs, pickled = @pickled");
        this.olmSessionCurrentSelect = this.db.prepare("SELECT user_id, device_id, session_id, last_decryption_ts, pickled FROM olm_sessions WHERE user_id = @userId AND device_id = @deviceId ORDER BY last_decryption_ts DESC LIMIT 1");
        this.olmSessionSelect = this.db.prepare("SELECT user_id, device_id, session_id, last_decryption_ts, pickled FROM olm_sessions WHERE user_id = @userId AND device_id = @deviceId");

        this.ibGroupSessionUpsert = this.db.prepare("INSERT INTO inbound_group_sessions (session_id, room_id, user_id, device_id, pickled) VALUES (@sessionId, @roomId, @userId, @deviceId, @pickled) ON CONFLICT (session_id, room_id, user_id, device_id) DO UPDATE SET pickled = @pickled");
        this.ibGroupSessionSelect = this.db.prepare("SELECT session_id, room_id, user_id, device_id, pickled FROM inbound_group_sessions WHERE session_id = @sessionId AND room_id = @roomId AND user_id = @userId AND device_id = @deviceId");

        this.deMetadataUpsert = this.db.prepare("INSERT INTO decrypted_event_metadata (room_id, event_id, session_id, message_index) VALUES (@roomId, @eventId, @sessionId, @messageIndex) ON CONFLICT (room_id, event_id) DO UPDATE SET message_index = @messageIndex, session_id = @sessionId");
        this.deMetadataSelect = this.db.prepare("SELECT room_id, event_id, session_id, message_index FROM decrypted_event_metadata WHERE room_id = @roomId AND session_id = @sessionId AND message_index = @messageIndex LIMIT 1");
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

    public async setActiveUserDevices(userId: string, devices: UserDevice[]): Promise<void> {
        this.db.transaction(() => {
            this.userUpsert.run({userId: userId, outdated: 0});
            this.userDevicesDelete.run({userId: userId});
            for (const device of devices) {
                this.userDeviceUpsert.run({userId: userId, deviceId: device.device_id, device: JSON.stringify(device), active: 1});
            }
        })();
    }

    public async getActiveUserDevices(userId: string): Promise<UserDevice[]> {
        const results = this.userActiveDevicesSelect.all({userId: userId})
        if (!results) return [];
        return results.map(d => JSON.parse(d.device));
    }

    public async getActiveUserDevice(userId: string, deviceId: string): Promise<UserDevice> {
        const result = this.userActiveDeviceSelect.get({userId: userId, deviceId: deviceId});
        if (!result) return null;
        return JSON.parse(result.device);
    }

    public async getAllUserDevices(userId: string): Promise<StoredUserDevice[]> {
        const results = this.userDevicesSelect.all({userId: userId})
        if (!results) return [];
        return results.map(d => Object.assign({}, JSON.parse(d.device), {unsigned: {bsdkIsActive: d.active === 1}}));
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

    public async storeOutboundGroupSession(session: IOutboundGroupSession): Promise<void> {
        this.db.transaction(() => {
            if (session.isCurrent) {
                this.obGroupSessionMarkAllInactive.run({
                    roomId: session.roomId,
                });
            }
            this.obGroupSessionUpsert.run({
                sessionId: session.sessionId,
                roomId: session.roomId,
                pickled: session.pickled,
                current: session.isCurrent ? 1 : 0,
                usesLeft: session.usesLeft,
                expiresTs: session.expiresTs,
            });
        })();
    }

    public async getOutboundGroupSession(sessionId: string, roomId: string): Promise<IOutboundGroupSession> {
        const result = this.obGroupSessionSelect.get({sessionId: sessionId, roomId: roomId});
        if (result) {
            return {
                sessionId: result.session_id,
                roomId: result.room_id,
                pickled: result.pickled,
                isCurrent: result.current === 1,
                usesLeft: result.uses_left,
                expiresTs: result.expires_ts,
            };
        }
        return null;
    }

    public async getCurrentOutboundGroupSession(roomId: string): Promise<IOutboundGroupSession> {
        const result = this.obGroupCurrentSessionSelect.get({roomId: roomId});
        if (result) {
            return {
                sessionId: result.session_id,
                roomId: result.room_id,
                pickled: result.pickled,
                isCurrent: result.current === 1,
                usesLeft: result.uses_left,
                expiresTs: result.expires_ts,
            };
        }
        return null;
    }

    public async storeSentOutboundGroupSession(session: IOutboundGroupSession, index: number, device: UserDevice): Promise<void> {
        this.obSentGroupSessionUpsert.run({
            sessionId: session.sessionId,
            roomId: session.roomId,
            sessionIndex: index,
            userId: device.user_id,
            deviceId: device.device_id,
        });
    }

    public async getLastSentOutboundGroupSession(userId: string, deviceId: string, roomId: string): Promise<{sessionId: string, index: number}> {
        const result = this.obSentSelectLastSent.get({userId: userId, deviceId: deviceId, roomId: roomId});
        if (result) {
            return {sessionId: result.session_id, index: result.session_index};
        }
        return null;
    }

    public async storeOlmSession(userId: string, deviceId: string, session: IOlmSession): Promise<void> {
        this.olmSessionUpsert.run({
            userId: userId,
            deviceId: deviceId,
            sessionId: session.sessionId,
            lastDecryptionTs: session.lastDecryptionTs,
            pickled: session.pickled,
        });
    }

    public async getCurrentOlmSession(userId: string, deviceId: string): Promise<IOlmSession> {
        const result = this.olmSessionCurrentSelect.get({userId: userId, deviceId: deviceId});
        if (!result) return null;
        return {
            sessionId: result.session_id,
            pickled: result.pickled,
            lastDecryptionTs: result.last_decryption_ts,
        };
    }

    public async getOlmSessions(userId: string, deviceId: string): Promise<IOlmSession[]> {
        const result = this.olmSessionSelect.all({
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
        this.ibGroupSessionUpsert.run({
            sessionId: session.sessionId,
            roomId: session.roomId,
            userId: session.senderUserId,
            deviceId: session.senderDeviceId,
            pickled: session.pickled,
        });
    }

    public async getInboundGroupSession(senderUserId: string, senderDeviceId: string, roomId: string, sessionId: string): Promise<IInboundGroupSession> {
        const result = this.ibGroupSessionSelect.get({
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
        this.deMetadataUpsert.run({
            roomId: roomId,
            eventId: eventId,
            sessionId: sessionId,
            messageIndex: messageIndex,
        });
    }

    public async getEventForMessageIndex(roomId: string, sessionId: string, messageIndex: number): Promise<string> {
        const result = this.deMetadataSelect.get({roomId: roomId, sessionId: sessionId, messageIndex: messageIndex});
        return result?.event_id;
    }

    /**
     * Closes the crypto store. Primarily for testing purposes.
     */
    public async close() {
        this.db.close();
    }
}

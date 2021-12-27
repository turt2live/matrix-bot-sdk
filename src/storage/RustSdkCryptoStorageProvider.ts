import { ICryptoStorageProvider } from "./ICryptoStorageProvider";
import { EncryptionEventContent } from "../models/events/EncryptionEvent";
import * as lowdb from "lowdb";
import * as FileSync from "lowdb/adapters/FileSync";
import * as mkdirp from "mkdirp";
import * as path from "path";
import * as sha512 from "hash.js/lib/hash/sha/512";

export class RustSdkCryptoStorageProvider implements ICryptoStorageProvider {
    private db: any;

    public constructor(public readonly storagePath: string) {
        mkdirp.sync(storagePath);

        const adapter = new FileSync(path.join(storagePath, "bot-sdk.json"));
        this.db = lowdb(adapter);

        this.db.defaults({
            deviceId: null,
            rooms: {},
        });
    }

    public async getDeviceId(): Promise<string> {
        return this.db.get('deviceId').value();
    }

    public async setDeviceId(deviceId: string): Promise<void> {
        this.db.set('deviceId', deviceId).write();
    }

    public async getRoom(roomId: string): Promise<Partial<EncryptionEventContent>> {
        const key = sha512().update(roomId).digest('hex');
        return this.db.get(`rooms.${key}`).value();
    }

    public async storeRoom(roomId: string, config: Partial<EncryptionEventContent>): Promise<void> {
        const key = sha512().update(roomId).digest('hex');
        this.db.set(`rooms.${key}`, config).write();
    }

}

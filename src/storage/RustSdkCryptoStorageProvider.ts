import { ICryptoStorageProvider } from "./ICryptoStorageProvider";
import { EncryptionEventContent } from "../models/events/EncryptionEvent";
import * as lowdb from "lowdb";
import * as FileSync from "lowdb/adapters/FileSync";
import * as mkdirp from "mkdirp";
import * as path from "path";
import * as sha512 from "hash.js/lib/hash/sha/512";
import * as sha256 from "hash.js/lib/hash/sha/256"
import { IAppserviceCryptoStorageProvider } from "./IAppserviceStorageProvider";

/**
 * A crypto storage provider for the default rust-sdk store (sled, file-based).
 * @category Storage providers
 */
export class RustSdkCryptoStorageProvider implements ICryptoStorageProvider {
    private db: any;

    /**
     * Creates a new rust-sdk storage provider.
     * @param {string} storagePath The *directory* to persist database details to.
     */
    public constructor(public readonly storagePath: string) {
        this.storagePath = path.resolve(this.storagePath);
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

/**
 * An appservice crypto storage provider for the default rust-sdk store (sled, file-based).
 * @category Storage providers
 */
export class RustSdkAppserviceCryptoStorageProvider extends RustSdkCryptoStorageProvider implements IAppserviceCryptoStorageProvider {
    /**
     * Creates a new rust-sdk storage provider.
     * @param {string} baseStoragePath The *directory* to persist database details to.
     */
    public constructor(private baseStoragePath: string) {
        super(path.join(baseStoragePath, "_default"));
    }

    public storageForUser(userId: string): ICryptoStorageProvider {
        // sha256 because sha512 is a bit big for some operating systems
        const key = sha256().update(userId).digest('hex');
        return new RustSdkCryptoStorageProvider(path.join(this.baseStoragePath, key));
    }
}

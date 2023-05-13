import * as lowdb from "lowdb";
import * as FileSync from "lowdb/adapters/FileSync";
import * as mkdirp from "mkdirp";
import * as path from "path";
import * as sha512 from "hash.js/lib/hash/sha/512";
import * as sha256 from "hash.js/lib/hash/sha/256";
import { StoreType as RustSdkCryptoStoreType } from "@matrix-org/matrix-sdk-crypto-nodejs";

import { ICryptoStorageProvider } from "./ICryptoStorageProvider";
import { IAppserviceCryptoStorageProvider } from "./IAppserviceStorageProvider";
import { ICryptoRoomInformation } from "../e2ee/ICryptoRoomInformation";

export { RustSdkCryptoStoreType };

/**
 * A crypto storage provider for the file-based rust-sdk store.
 * @category Storage providers
 */
export class RustSdkCryptoStorageProvider implements ICryptoStorageProvider {
    private db: lowdb.LowdbSync<any>;

    /**
     * Creates a new rust-sdk storage provider.
     * @param storagePath The *directory* to persist database details to.
     * @param storageType The storage type to use. Must be supported by the rust-sdk.
     */
    public constructor(
        public readonly storagePath: string,
        public readonly storageType: RustSdkCryptoStoreType = RustSdkCryptoStoreType.Sled,
    ) {
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

    public async getRoom(roomId: string): Promise<ICryptoRoomInformation> {
        const key = sha512().update(roomId).digest('hex');
        return this.db.get(`rooms.${key}`).value();
    }

    public async storeRoom(roomId: string, config: ICryptoRoomInformation): Promise<void> {
        const key = sha512().update(roomId).digest('hex');
        this.db.set(`rooms.${key}`, config).write();
    }
}

/**
 * An appservice crypto storage provider for the file-based rust-sdk store.
 * @category Storage providers
 */
export class RustSdkAppserviceCryptoStorageProvider extends RustSdkCryptoStorageProvider implements IAppserviceCryptoStorageProvider {
    /**
     * Creates a new rust-sdk storage provider.
     * @param baseStoragePath The *directory* to persist database details to.
     * @param storageType The storage type to use. Must be supported by the rust-sdk.
     */
    public constructor(private baseStoragePath: string, storageType: RustSdkCryptoStoreType = RustSdkCryptoStoreType.Sled) {
        super(path.join(baseStoragePath, "_default"), storageType);
    }

    public storageForUser(userId: string): ICryptoStorageProvider {
        // sha256 because sha512 is a bit big for some operating systems
        const key = sha256().update(userId).digest('hex');
        return new RustSdkCryptoStorageProvider(path.join(this.baseStoragePath, key), this.storageType);
    }
}

import * as lowdb from "lowdb";
import * as FileSync from "lowdb/adapters/FileSync";
import * as mkdirp from "mkdirp";
import * as path from "path";
import { stat, rename, mkdir } from "fs/promises";
import { PathLike } from "fs";
import * as sha512 from "hash.js/lib/hash/sha/512";
import * as sha256 from "hash.js/lib/hash/sha/256";
import { StoreType as RustSdkCryptoStoreType } from "@matrix-org/matrix-sdk-crypto-nodejs";

import { ICryptoStorageProvider } from "./ICryptoStorageProvider";
import { IAppserviceCryptoStorageProvider } from "./IAppserviceStorageProvider";
import { ICryptoRoomInformation } from "../e2ee/ICryptoRoomInformation";
import { LogService } from "../logging/LogService";

export { RustSdkCryptoStoreType };

async function doesFileExist(path: PathLike) {
    return stat(path).then(() => true).catch(() => false);
}

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
        public readonly storageType: RustSdkCryptoStoreType,
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

    public async getMachineStoragePath(deviceId: string): Promise<string> {
        const newPath = path.join(this.storagePath, sha256().update(deviceId).digest('hex'));
        if (await doesFileExist(newPath)) {
            // Already exists, short circuit.
            return newPath;
        } // else: If the path does NOT exist we might need to perform a migration.

        const legacyFilePath = path.join(this.storagePath, 'matrix-sdk-crypto.sqlite3');
        // XXX: Slightly gross cross-dependency file name expectations.
        if (await doesFileExist(legacyFilePath) === false) {
            // No machine files at all, we can skip.
            return newPath;
        }
        const legacyDeviceId = await this.getDeviceId();
        // We need to move the file.
        const previousDevicePath = path.join(this.storagePath, sha256().update(legacyDeviceId).digest('hex'));
        LogService.warn("RustSdkCryptoStorageProvider", `Migrating path for SDK database for legacy device ${legacyDeviceId}`);
        await mkdir(previousDevicePath);
        await rename(legacyFilePath, path.join(previousDevicePath, 'matrix-sdk-crypto.sqlite3')).catch((ex) =>
            LogService.warn("RustSdkCryptoStorageProvider", `Could not migrate matrix-sdk-crypto.sqlite3`, ex),
        );
        await rename(legacyFilePath, path.join(previousDevicePath, 'matrix-sdk-crypto.sqlite3-shm')).catch((ex) =>
            LogService.warn("RustSdkCryptoStorageProvider", `Could not migrate matrix-sdk-crypto.sqlite3-shm`, ex),
        );
        await rename(legacyFilePath, path.join(previousDevicePath, 'matrix-sdk-crypto.sqlite3-wal')).catch((ex) =>
            LogService.warn("RustSdkCryptoStorageProvider", `Could not migrate matrix-sdk-crypto.sqlite3-wal`, ex),
        );

        return newPath;
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
    public constructor(private baseStoragePath: string, storageType: RustSdkCryptoStoreType) {
        super(path.join(baseStoragePath, "_default"), storageType);
    }

    public storageForUser(userId: string): ICryptoStorageProvider {
        // sha256 because sha512 is a bit big for some operating systems
        const storagePath = path.join(this.baseStoragePath, sha256().update(userId).digest('hex'));
        return new RustSdkCryptoStorageProvider(storagePath, this.storageType);
    }
}

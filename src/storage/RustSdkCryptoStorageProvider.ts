import { ICryptoStorageProvider } from "./ICryptoStorageProvider";
import { EncryptionEventContent } from "../models/events/EncryptionEvent";
import { EncryptionAlgorithm } from "../models/Crypto";

export class RustSdkCryptoStorageProvider implements ICryptoStorageProvider {
    public constructor(public readonly sledPath: string) {
    }

    public async getDeviceId(): Promise<string> {
        return Promise.resolve("");
    }

    public async setDeviceId(deviceId: string): Promise<void> {
        return Promise.resolve(undefined);
    }

    public async getRoom(roomId: string): Promise<Partial<EncryptionEventContent>> {
        return Promise.resolve({algorithm: EncryptionAlgorithm.MegolmV1AesSha2});
        // return Promise.resolve(undefined);
    }

    public async storeRoom(roomId: string, config: Partial<EncryptionEventContent>): Promise<void> {
        return Promise.resolve(undefined);
    }

}

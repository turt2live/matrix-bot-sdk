import { MatrixClient } from "../MatrixClient";
import { LogService } from "../logging/LogService";
import * as Olm from "@matrix-org/olm";
import * as crypto from "crypto";
import * as anotherJson from "another-json";
import {
    DeviceKeyAlgorithm,
    EncryptionAlgorithm,
    OTKAlgorithm,
    OTKCounts, OTKs,
    Signatures,
    SignedCurve25519OTK
} from "../models/Crypto";
import { requiresReady } from "./decorators";
import { RoomTracker } from "./RoomTracker";

const DEVICE_ID_STORAGE_KEY = "device_id";
const E25519_STORAGE_KEY = "device_ed25519";
const C25519_STORAGE_KEY = "device_Curve25519";
const PICKLE_STORAGE_KEY = "device_pickle_key";
const OLM_ACCOUNT_STORAGE_KEY = "device_olm_account";

// noinspection ES6RedundantAwait
/**
 * Manages encryption for a MatrixClient. Get an instance from a MatrixClient directly
 * rather than creating one manually.
 * @category Encryption
 */
export class CryptoClient {
    private ready = false;
    private deviceId: string;
    private pickleKey: string;
    private pickledAccount: string;
    private deviceEd25519: string;
    private deviceCurve25519: string;
    private maxOTKs: number;
    private roomTracker: RoomTracker;

    public constructor(private client: MatrixClient) {
        this.roomTracker = new RoomTracker(this.client);
    }

    public get clientDeviceId(): string {
        return this.deviceId;
    }

    public get isReady(): boolean {
        return this.ready;
    }

    private async getOlmAccount(): Promise<Olm.Account> {
        const account = new Olm.Account();
        account.unpickle(this.pickleKey, this.pickledAccount);
        return account;
    }

    private async storeAndFreeOlmAccount(account: Olm.Account) {
        const pickled = account.pickle(this.pickleKey);
        await Promise.resolve(this.client.storageProvider.storeValue(OLM_ACCOUNT_STORAGE_KEY, pickled));
        account.free();
    }

    public async prepare() {
        const storedDeviceId = await Promise.resolve(this.client.storageProvider.readValue(DEVICE_ID_STORAGE_KEY));
        if (storedDeviceId) {
            this.deviceId = storedDeviceId;
        } else {
            const deviceId = (await this.client.getWhoAmI())['device_id'];
            if (!deviceId) {
                throw new Error("Encryption not possible: server not revealing device ID");
            }
            this.deviceId = deviceId;
            await Promise.resolve(this.client.storageProvider.storeValue(DEVICE_ID_STORAGE_KEY, this.deviceId));
        }

        LogService.debug("CryptoClient", "Starting with device ID:", this.deviceId);

        // We should be in a ready enough shape to kick off Olm
        await Olm.init();

        let pickled = await (Promise.resolve(this.client.storageProvider.readValue(OLM_ACCOUNT_STORAGE_KEY)));
        let deviceC25519 = await (Promise.resolve(this.client.storageProvider.readValue(C25519_STORAGE_KEY)));
        let deviceE25519 = await (Promise.resolve(this.client.storageProvider.readValue(E25519_STORAGE_KEY)));
        let pickleKey = await (Promise.resolve(this.client.storageProvider.readValue(PICKLE_STORAGE_KEY)));

        const account = new Olm.Account();
        try {
            if (!pickled || !deviceC25519 || !deviceE25519 || !pickleKey) {
                LogService.debug("CryptoClient", "Creating new Olm account: previous session lost or not set up");

                account.create();
                pickleKey = crypto.randomBytes(64).toString('hex');
                pickled = account.pickle(pickleKey);
                await Promise.resolve(this.client.storageProvider.storeValue(PICKLE_STORAGE_KEY, pickleKey));
                await Promise.resolve(this.client.storageProvider.storeValue(OLM_ACCOUNT_STORAGE_KEY, pickled));

                this.pickleKey = pickleKey;
                this.pickledAccount = pickled;

                const keys = JSON.parse(account.identity_keys());
                this.deviceCurve25519 = keys['curve25519'];
                this.deviceEd25519 = keys['ed25519'];

                await Promise.resolve(this.client.storageProvider.storeValue(E25519_STORAGE_KEY, this.deviceEd25519));
                await Promise.resolve(this.client.storageProvider.storeValue(C25519_STORAGE_KEY, this.deviceCurve25519));

                this.maxOTKs = account.max_number_of_one_time_keys();
                this.ready = true;

                const counts = await this.client.uploadDeviceKeys([
                    EncryptionAlgorithm.MegolmV1AesSha2,
                    EncryptionAlgorithm.OlmV1Curve25519AesSha2,
                ], {
                    [`${DeviceKeyAlgorithm.Ed25119}:${this.deviceId}`]: this.deviceEd25519,
                    [`${DeviceKeyAlgorithm.Curve25519}:${this.deviceId}`]: this.deviceCurve25519,
                });
                await this.tryOtkUpload(counts);
            } else {
                account.unpickle(pickleKey, pickled);
                this.pickleKey = pickleKey;
                this.pickledAccount = pickled;
                this.deviceEd25519 = deviceE25519;
                this.deviceCurve25519 = deviceC25519;
                this.maxOTKs = account.max_number_of_one_time_keys();
                this.ready = true;
                await this.tryOtkUpload(await this.client.checkOneTimeKeyCounts());
            }
        } finally {
            account.free();
        }
    }

    /**
     * Updates the One Time Key counts, potentially triggering an async upload of more
     * one time keys.
     * @param {OTKCounts} counts The current counts to work within.
     */
    public updateCounts(counts: OTKCounts) {
        // noinspection JSIgnoredPromiseFromCall
        this.tryOtkUpload(counts);
    }

    /**
     * Checks if a room is encrypted.
     * @param {string} roomId The room ID to check.
     * @returns {Promise<boolean>} Resolves to true if encrypted, false otherwise.
     */
    public async isRoomEncrypted(roomId: string): Promise<boolean> {
        const config = await this.roomTracker.getRoomCryptoConfig(roomId);
        return !!config?.algorithm;
    }

    @requiresReady()
    private async tryOtkUpload(counts: OTKCounts) {
        const have = counts[OTKAlgorithm.Signed] || 0;
        const need = Math.floor(this.maxOTKs / 2) - have;
        if (need <= 0) return;

        LogService.debug("CryptoClient", `Creating ${need} more OTKs`);

        const account = await this.getOlmAccount();
        try {
            account.generate_one_time_keys(need);
            const { curve25519: keys } = JSON.parse(account.one_time_keys());
            const signed: OTKs = {};
            for (const keyId in keys) {
                if (!keys.hasOwnProperty(keyId)) continue;
                const obj = {key: keys[keyId]};
                obj['signatures'] = await this.sign(obj);
                signed[`${OTKAlgorithm.Signed}:${keyId}`] = obj;
            }
            await this.client.uploadDeviceOneTimeKeys(signed);
            account.mark_keys_as_published();
        } finally {
            await this.storeAndFreeOlmAccount(account);
        }
    }

    /**
     * Signs an object using the device keys.
     * @param {object} obj The object to sign.
     * @returns {Promise<Signatures>} The signatures for the object.
     */
    @requiresReady()
    public async sign(obj: object): Promise<Signatures> {
        const existingSignatures = obj['signatures'] || {};

        delete obj['signatures'];
        delete obj['unsigned'];

        const account = await this.getOlmAccount();
        try {
            const sig = account.sign(anotherJson.stringify(obj));
            return {
                ...existingSignatures,
                [await this.client.getUserId()]: {
                    [`${DeviceKeyAlgorithm.Ed25119}:${this.deviceId}`]: sig,
                },
            };
        } finally {
            account.free();
        }
    }
}

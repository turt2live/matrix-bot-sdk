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
} from "../models/Crypto";
import { requiresReady } from "./decorators";
import { RoomTracker } from "./RoomTracker";
import { DeviceTracker } from "./DeviceTracker";

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
    private deviceTracker: DeviceTracker;

    public constructor(private client: MatrixClient) {
        this.roomTracker = new RoomTracker(this.client);
        this.deviceTracker = new DeviceTracker(this.client);
    }

    /**
     * The device ID for the MatrixClient.
     */
    public get clientDeviceId(): string {
        return this.deviceId;
    }

    /**
     * Whether or not the crypto client is ready to be used. If not ready, prepare() should be called.
     * @see prepare
     */
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
        await this.client.cryptoStore.setPickledAccount(pickled);
        account.free();
    }

    /**
     * Prepares the crypto client for usage.
     * @param {string[]} roomIds The room IDs the MatrixClient is joined to.
     */
    public async prepare(roomIds: string[]) {
        await this.roomTracker.prepare(roomIds);

        const storedDeviceId = await this.client.cryptoStore.getDeviceId();
        if (storedDeviceId) {
            this.deviceId = storedDeviceId;
        } else {
            const deviceId = (await this.client.getWhoAmI())['device_id'];
            if (!deviceId) {
                throw new Error("Encryption not possible: server not revealing device ID");
            }
            this.deviceId = deviceId;
            await this.client.cryptoStore.setDeviceId(this.deviceId);
        }

        LogService.debug("CryptoClient", "Starting with device ID:", this.deviceId);

        // We should be in a ready enough shape to kick off Olm
        await Olm.init();

        let pickled = await this.client.cryptoStore.getPickledAccount();
        let pickleKey = await this.client.cryptoStore.getPickleKey();

        const account = new Olm.Account();
        try {
            if (!pickled || !pickleKey) {
                LogService.debug("CryptoClient", "Creating new Olm account: previous session lost or not set up");

                account.create();
                pickleKey = crypto.randomBytes(64).toString('hex');
                pickled = account.pickle(pickleKey);
                await this.client.cryptoStore.setPickleKey(pickleKey);
                await this.client.cryptoStore.setPickledAccount(pickled);

                this.pickleKey = pickleKey;
                this.pickledAccount = pickled;

                this.maxOTKs = account.max_number_of_one_time_keys();
                this.ready = true;

                const counts = await this.client.uploadDeviceKeys([
                    EncryptionAlgorithm.MegolmV1AesSha2,
                    EncryptionAlgorithm.OlmV1Curve25519AesSha2,
                ], {
                    [`${DeviceKeyAlgorithm.Ed25119}:${this.deviceId}`]: this.deviceEd25519,
                    [`${DeviceKeyAlgorithm.Curve25519}:${this.deviceId}`]: this.deviceCurve25519,
                });
                await this.updateCounts(counts);
            } else {
                account.unpickle(pickleKey, pickled);
                this.pickleKey = pickleKey;
                this.pickledAccount = pickled;
                this.maxOTKs = account.max_number_of_one_time_keys();
                this.ready = true;
                await this.updateCounts(await this.client.checkOneTimeKeyCounts());
            }

            const keys = JSON.parse(account.identity_keys());
            this.deviceCurve25519 = keys['curve25519'];
            this.deviceEd25519 = keys['ed25519'];
        } finally {
            account.free();
        }
    }

    /**
     * Checks if a room is encrypted.
     * @param {string} roomId The room ID to check.
     * @returns {Promise<boolean>} Resolves to true if encrypted, false otherwise.
     */
    @requiresReady()
    public async isRoomEncrypted(roomId: string): Promise<boolean> {
        const config = await this.roomTracker.getRoomCryptoConfig(roomId);
        return !!config?.algorithm;
    }

    /**
     * Updates the One Time Key counts, potentially triggering an async upload of more
     * one time keys.
     * @param {OTKCounts} counts The current counts to work within.
     * @returns {Promise<void>} Resolves when complete.
     */
    @requiresReady()
    public async updateCounts(counts: OTKCounts) {
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
        obj = JSON.parse(JSON.stringify(obj));
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

    public async verifySignature(obj: object, key: string, signature: string): Promise<boolean> {
        obj = JSON.parse(JSON.stringify(obj));

        delete obj['signatures'];
        delete obj['unsigned'];

        const util = new Olm.Utility();
        try {
            const message = anotherJson.stringify(obj);
            util.ed25519_verify(message, key, signature);
        } catch (e) {
            // Assume it's a verification failure
            return false;
        } finally {
            util.free();
        }

        return true;
    }

    /**
     * Flags multiple user's device lists as outdated, optionally queuing an immediate update.
     * @param {string} userIds The user IDs to flag the device lists of.
     * @param {boolean} resync True (default) to queue an immediate update, false otherwise.
     */
    public flagUsersDeviceListsOutdated(userIds: string[], resync = true) {
        this.deviceTracker.flagUsersOutdated(userIds, resync);
    }
}

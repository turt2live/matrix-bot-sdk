import { MatrixClient } from "../MatrixClient";
import { LogService } from "../logging/LogService";
import { DeviceKeyAlgorithm, UserDevice } from "../models/Crypto";

/**
 * Tracks user devices for encryption operations.
 * @category Encryption
 */
export class DeviceTracker {
    private deviceListUpdates: Record<string, Promise<void>> = {};

    public constructor(private client: MatrixClient) {
    }

    /**
     * Gets the device lists for the given user IDs. Outdated device lists will be updated before
     * returning.
     * @param {string[]} userIds The user IDs to get the device lists of.
     * @returns {Promise<Record<string, UserDevice[]>>} Resolves to a map of user ID to device list.
     * If a user has no devices, they may be excluded from the result or appear as an empty array.
     */
    public async getDevicesFor(userIds: string[]): Promise<Record<string, UserDevice[]>> {
        const outdatedUserIds: string[] = [];
        for (const userId of userIds) {
            const isOutdated = await this.client.cryptoStore.isUserOutdated(userId);
            if (isOutdated) outdatedUserIds.push(userId);
        }

        await this.updateUsersDeviceLists(outdatedUserIds);

        const userDeviceMap: Record<string, UserDevice[]> = {};
        for (const userId of userIds) {
            userDeviceMap[userId] = await this.client.cryptoStore.getActiveUserDevices(userId);
        }
        return userDeviceMap;
    }

    /**
     * Flags multiple user's device lists as outdated, optionally queuing an immediate update.
     * @param {string} userIds The user IDs to flag the device lists of.
     * @param {boolean} resync True (default) to queue an immediate update, false otherwise.
     * @returns {Promise<void>} Resolves when the flagging has completed. Will wait for the resync
     * if requested too.
     */
    public async flagUsersOutdated(userIds: string[], resync = true): Promise<void> {
        await this.client.cryptoStore.flagUsersOutdated(userIds);
        if (resync) {
            await this.updateUsersDeviceLists(userIds);
        }
    }

    /**
     * Updates multiple user's device lists regardless of outdated flag.
     * @param {string[]} userIds The user IDs to update.
     * @returns {Promise<void>} Resolves when complete.
     */
    public async updateUsersDeviceLists(userIds: string[]): Promise<void> {
        // We wait for the lock, but still run through with our update just in case we are lagged.
        // This can happen if the server is slow to reply to device list queries, but a user is
        // changing information about their device a lot.
        const existingPromises = userIds.map(u => this.deviceListUpdates[u]).filter(p => !!p);
        if (existingPromises.length > 0) {
            await Promise.all(existingPromises);
        }

        const promise = new Promise<void>(async (resolve, reject) => {
            try {
                const resp = await this.client.getUserDevices(userIds);
                for (const userId of Object.keys(resp.device_keys)) {
                    if (!userIds.includes(userId)) {
                        LogService.warn("DeviceTracker", `Server returned unexpected user ID: ${userId} - ignoring user`);
                        continue;
                    }

                    const validated: UserDevice[] = [];
                    for (const deviceId of Object.keys(resp.device_keys[userId])) {
                        const device = resp.device_keys[userId][deviceId];
                        if (device.user_id !== userId || device.device_id !== deviceId) {
                            LogService.warn("DeviceTracker", `Server appears to be lying about device lists: ${userId} ${deviceId} has unexpected device ${device.user_id} ${device.device_id} listed - ignoring device`);
                            continue;
                        }

                        const ed25519 = device.keys[`${DeviceKeyAlgorithm.Ed25519}:${deviceId}`];
                        const curve25519 = device.keys[`${DeviceKeyAlgorithm.Curve25519}:${deviceId}`];

                        if (!ed25519 || !curve25519) {
                            LogService.warn("DeviceTracker", `Device ${userId} ${deviceId} is missing either an Ed25519 or Curve25519 key - ignoring device`);
                            continue;
                        }

                        const currentDevices = await this.client.cryptoStore.getAllUserDevices(userId);
                        const existingDevice = currentDevices.find(d => d.device_id === deviceId);

                        if (existingDevice) {
                            const existingEd25519 = existingDevice.keys[`${DeviceKeyAlgorithm.Ed25519}:${deviceId}`];
                            if (existingEd25519 !== ed25519) {
                                LogService.warn("DeviceTracker", `Device ${userId} ${deviceId} appears compromised: Ed25519 key changed - ignoring device`);
                                continue;
                            }
                        }

                        const signature = device.signatures?.[userId]?.[`${DeviceKeyAlgorithm.Ed25519}:${deviceId}`];
                        if (!signature) {
                            LogService.warn("DeviceTracker", `Device ${userId} ${deviceId} is missing a signature - ignoring device`);
                            continue;
                        }

                        const validSignature = await this.client.crypto.verifySignature(device, ed25519, signature);
                        if (!validSignature) {
                            LogService.warn("DeviceTracker", `Device ${userId} ${deviceId} has an invalid signature - ignoring device`);
                            continue;
                        }

                        validated.push(device);
                    }

                    await this.client.cryptoStore.setActiveUserDevices(userId, validated);
                }
            } catch (e) {
                LogService.error("DeviceTracker", "Error updating device lists:", e);
                // return reject(e);
            }
            resolve();
        });
        userIds.forEach(u => this.deviceListUpdates[u] = promise);
        await promise;
    }
}

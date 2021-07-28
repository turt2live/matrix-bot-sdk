import { MatrixClient } from "../MatrixClient";
import { EncryptionEventContent } from "../models/events/EncryptionEvent";

const ROOM_STORAGE_PREFIX = "tracked_room.";

// noinspection ES6RedundantAwait
/**
 * Tracks room encryption status for a MatrixClient.
 * @category Encryption
 */
export class RoomTracker {
    public constructor(private client: MatrixClient) {
        this.client.on("room.join", (roomId: string) => {
            // noinspection JSIgnoredPromiseFromCall
            this.queueRoomCheck(roomId);
        });

        this.client.on("room.event", (roomId: string, event: any) => {
            if (event['type'] === 'm.room.encryption' && event['state_key'] === '') {
                // noinspection JSIgnoredPromiseFromCall
                this.queueRoomCheck(roomId);
            }
        });
    }

    /**
     * Prepares the room tracker to track the given rooms.
     * @param {string[]} roomIds The room IDs to track. This should be the joined rooms set.
     */
    public async prepare(roomIds: string[]) {
        for (const roomId of roomIds) {
            await this.queueRoomCheck(roomId);
        }
    }

    /**
     * Queues a room check for the tracker. If the room needs an update to the store, an
     * update will be made.
     * @param {string} roomId The room ID to check.
     */
    public async queueRoomCheck(roomId: string) {
        const key = `${ROOM_STORAGE_PREFIX}${roomId}`;
        const config = await Promise.resolve(this.client.storageProvider.readValue(key));
        if (config) {
            const parsed: EncryptionEventContent = JSON.parse(config);
            if (parsed.algorithm !== undefined) {
                return; // assume no change to encryption config
            }
        }

        let encEvent: Partial<EncryptionEventContent>;
        try {
            encEvent = await this.client.getRoomStateEvent(roomId, "m.room.encryption", "");
            encEvent.algorithm = encEvent.algorithm ?? 'UNKNOWN';
        } catch (e) {
            return; // failure == no encryption
        }
        await Promise.resolve(this.client.storageProvider.storeValue(key, JSON.stringify(encEvent)));
    }

    /**
     * Gets the room's crypto configuration, as known by the underlying store. If the room is
     * not encrypted then this will return an empty object.
     * @param {string} roomId The room ID to get the config for.
     * @returns {Promise<Partial<EncryptionEventContent>>} Resolves to the encryption config.
     */
    public async getRoomCryptoConfig(roomId: string): Promise<Partial<EncryptionEventContent>> {
        const key = `${ROOM_STORAGE_PREFIX}${roomId}`;
        let config = await Promise.resolve(this.client.storageProvider.readValue(key));
        if (!config) {
            await this.queueRoomCheck(roomId);
            config = await Promise.resolve(this.client.storageProvider.readValue(key));
        }
        if (!config) {
            return {};
        }
        return JSON.parse(config);
    }
}

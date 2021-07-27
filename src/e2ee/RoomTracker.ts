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
        this.client.getJoinedRooms().then(roomIds => {
            for (const roomId of roomIds) {
                // noinspection JSIgnoredPromiseFromCall
                this.queueRoomCheck(roomId);
            }
        });

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

    public async queueRoomCheck(roomId: string) {
        const key = `${ROOM_STORAGE_PREFIX}${roomId}`;
        const config = await Promise.resolve(this.client.storageProvider.readValue(key));
        if (config) {
            const parsed: EncryptionEventContent = JSON.parse(config);
            if (parsed.algorithm !== undefined) {
                return; // assume no change to encryption config
            }
        }

        const encEvent = await this.client.getRoomStateEvent(roomId, "m.room.encryption", "");
        await Promise.resolve(this.client.storageProvider.storeValue(key, JSON.stringify(encEvent)));
    }

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

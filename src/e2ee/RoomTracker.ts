import { MatrixClient } from "../MatrixClient";
import { EncryptionEventContent } from "../models/events/EncryptionEvent";
import { ICryptoRoomInformation } from "./ICryptoRoomInformation";

// noinspection ES6RedundantAwait
/**
 * Tracks room encryption status for a MatrixClient.
 * @category Encryption
 */
export class RoomTracker {
    public constructor(private client: MatrixClient) {
    }

    /**
     * Handles a room join
     * @internal
     * @param roomId The room ID.
     */
    public async onRoomJoin(roomId: string) {
        await this.queueRoomCheck(roomId);
    }

    /**
     * Handles a room event.
     * @internal
     * @param roomId The room ID.
     * @param event The event.
     */
    public async onRoomEvent(roomId: string, event: any) {
        if (event['state_key'] !== '') return; // we don't care about anything else
        if (event['type'] === 'm.room.encryption' || event['type'] === 'm.room.history_visibility') {
            await this.queueRoomCheck(roomId);
        }
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
        const config = await this.client.cryptoStore.getRoom(roomId);
        if (config) {
            if (config.algorithm !== undefined) {
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

        // Pick out the history visibility setting too
        let historyVisibility: string;
        try {
            const ev = await this.client.getRoomStateEvent(roomId, "m.room.history_visibility", "");
            historyVisibility = ev.history_visibility;
        } catch (e) {
            // ignore - we'll just treat history visibility as normal
        }

        await this.client.cryptoStore.storeRoom(roomId, {
            ...encEvent,
            historyVisibility,
        });
    }

    /**
     * Gets the room's crypto configuration, as known by the underlying store. If the room is
     * not encrypted then this will return an empty object.
     * @param {string} roomId The room ID to get the config for.
     * @returns {Promise<ICryptoRoomInformation>} Resolves to the encryption config.
     */
    public async getRoomCryptoConfig(roomId: string): Promise<ICryptoRoomInformation> {
        let config = await this.client.cryptoStore.getRoom(roomId);
        if (!config) {
            await this.queueRoomCheck(roomId);
            config = await this.client.cryptoStore.getRoom(roomId);
        }
        if (!config) {
            return {};
        }
        return config;
    }
}

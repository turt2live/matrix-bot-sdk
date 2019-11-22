import { MatrixClient } from "../MatrixClient";
import { Appservice } from "../appservice/Appservice";

/**
 * Automatically tries to join upgraded rooms
 * @category Mixins
 */
export class AutojoinUpgradedRoomsMixin {
    public static setupOnClient(client: MatrixClient): void {
        client.on("room.archived", (roomId: string, tombstoneEvent: any) => {
            if (!tombstoneEvent['content']) return;
            if (!tombstoneEvent['sender']) return;
            if (!tombstoneEvent['content']['replacement_room']) return;

            const serverName = tombstoneEvent['sender'].split(':').splice(1).join(':');
            return client.joinRoom(tombstoneEvent['content']['replacement_room'], [serverName]);
        });
    }

    public static setupOnAppservice(appservice: Appservice): void {
        appservice.on("room.archived", async (roomId: string, tombstoneEvent: any) => {
            if (!tombstoneEvent['content']) return;
            if (!tombstoneEvent['sender']) return;
            if (!tombstoneEvent['content']['replacement_room']) return;

            const newRoomId = tombstoneEvent['content']['replacement_room'];
            const serverName = tombstoneEvent['sender'].split(':').splice(1).join(':');
            const botClient = appservice.botIntent.underlyingClient;

            await botClient.joinRoom(newRoomId, [serverName]);
            const userIds = await botClient.getJoinedRoomMembers(roomId);
            const joinUserIds = userIds.filter(u => u !== appservice.botUserId && appservice.isNamespacedUser(u));

            return await Promise.all(joinUserIds.map(u => appservice.getIntentForUserId(u).joinRoom(newRoomId)));
        });
    }
}

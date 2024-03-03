import { MatrixClient } from "../MatrixClient";

/**
 * Automatically leaves empty rooms
 * @category Mixins
 */
export class AutoleaveRoomsMixin {
    public static setupOnClient(client: MatrixClient): void {
        client.on("room.event", async (roomId: string, event: any) => {
            if (
                event.type === "m.room.member" &&
                event.content?.membership === "leave" &&
                (await client.getJoinedRoomMembers(roomId)).length === 1
            ) {
                await client.leaveRoom(roomId);
                await client.forgetRoom(roomId);
            }
        });
    }
}

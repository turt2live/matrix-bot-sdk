import { MatrixClient } from "../MatrixClient";

/**
 * Automatically accepts invites for rooms
 */
export class AutojoinRoomsMixin {
    public static setupOnClient(client: MatrixClient): void {
        client.on("room.invite", (roomId: string, inviteEvent: any) => {
            return client.joinRoom(roomId);
        });
    }
}
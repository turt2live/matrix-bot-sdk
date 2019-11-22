import { MatrixClient } from "../MatrixClient";
import { Appservice } from "../appservice/Appservice";

/**
 * Automatically accepts invites for rooms
 * @category Mixins
 */
export class AutojoinRoomsMixin {
    public static setupOnClient(client: MatrixClient): void {
        client.on("room.invite", (roomId: string, inviteEvent: any) => {
            return client.joinRoom(roomId);
        });
    }

    public static setupOnAppservice(appservice: Appservice, conditional: (inviteEvent: any) => boolean = null): void {
        appservice.on("room.invite", (roomId: string, inviteEvent: any) => {
            const isFromBot = appservice.botUserId === inviteEvent["sender"];
            if (!isFromBot && conditional && !conditional(inviteEvent)) return;

            const intent = appservice.getIntentForUserId(inviteEvent["state_key"]);
            return intent.joinRoom(roomId);
        });
    }
}

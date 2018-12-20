import { IJoinRoomStrategy } from "./JoinRoomStrategy";
import { Appservice } from "..";

export class AppserviceJoinRoomStrategy implements IJoinRoomStrategy {

    constructor(private underlyingStrategy: IJoinRoomStrategy, private appservice: Appservice) {
    }

    public joinRoom(roomIdOrAlias: string, userId: string, apiCall: (roomIdOrAlias: string) => Promise<string>): Promise<string> {
        return apiCall(roomIdOrAlias).catch(async (err) => {
            console.error(err);
            if (userId !== this.appservice.botUserId) {
                const client = this.appservice.botIntent.underlyingClient;
                const roomId = await client.resolveRoom(roomIdOrAlias);
                return client.inviteUser(userId, roomId);
            }
            return err;
        }).then(() => this.underlyingStrategy ? this.underlyingStrategy.joinRoom(roomIdOrAlias, userId, apiCall) : apiCall(roomIdOrAlias));
    }
}
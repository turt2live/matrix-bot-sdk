import { IJoinRoomStrategy } from "./JoinRoomStrategy";
import { Appservice, LogService } from "..";

export class AppserviceJoinRoomStrategy implements IJoinRoomStrategy {

    constructor(private underlyingStrategy: IJoinRoomStrategy, private appservice: Appservice) {
    }

    public async joinRoom(roomIdOrAlias: string, userId: string, apiCall: (roomIdOrAlias: string) => Promise<string>): Promise<string> {
        try {
            await apiCall(roomIdOrAlias);
        } catch (err) {
            LogService.error("AppserviceJoinRoomStrategy", err);
            if (userId !== this.appservice.botUserId) {
                const client = this.appservice.botIntent.underlyingClient;
                const roomId = await client.resolveRoom(roomIdOrAlias);
                return client.inviteUser(userId, roomId).then(() => {
                    if (this.underlyingStrategy) return this.underlyingStrategy.joinRoom(roomId, userId, apiCall);
                    else return apiCall(roomId);
                });
            } else if (this.underlyingStrategy) {
                return this.underlyingStrategy.joinRoom(roomIdOrAlias, userId, apiCall);
            }
            throw err;
        }
    }
}
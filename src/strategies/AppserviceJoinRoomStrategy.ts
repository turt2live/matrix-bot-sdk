import { IJoinRoomStrategy } from "./JoinRoomStrategy";
import { Appservice, LogService } from "..";

export class AppserviceJoinRoomStrategy implements IJoinRoomStrategy {

    constructor(private underlyingStrategy: IJoinRoomStrategy, private appservice: Appservice) {
    }

    public async joinRoom(roomIdOrAlias: string, userId: string, apiCall: (roomIdOrAlias: string) => Promise<string>): Promise<string> {
        try {
            return await apiCall(roomIdOrAlias);
        } catch (err) {
            LogService.error("AppserviceJoinRoomStrategy", err);
            if (userId !== this.appservice.botUserId) {
                const client = this.appservice.botIntent.underlyingClient;
                const roomId = await client.resolveRoom(roomIdOrAlias);
                try {
                    await client.inviteUser(userId, roomId);
                } catch (err) {
                    if (this.underlyingStrategy) return this.underlyingStrategy.joinRoom(roomId, userId, apiCall);
                    throw err;
                }
                if (this.underlyingStrategy) return this.underlyingStrategy.joinRoom(roomId, userId, apiCall);
                else return apiCall(roomId);
            } else if (this.underlyingStrategy) {
                return this.underlyingStrategy.joinRoom(roomIdOrAlias, userId, apiCall);
            }
            throw err;
        }
    }
}

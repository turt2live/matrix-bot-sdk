import { IJoinRoomStrategy } from "./JoinRoomStrategy";
import { LogService } from "..";
import { Appservice } from "../appservice/Appservice";

/**
 * A join strategy for application services that proxies joins to an underlying join
 * strategy while also trying to use the appservice's bot user to invite the underlying
 * user if needed.
 * @category Join strategies
 */
export class AppserviceJoinRoomStrategy implements IJoinRoomStrategy {

    constructor(private underlyingStrategy: IJoinRoomStrategy, private appservice: Appservice) {
    }

    public async joinRoom(roomIdOrAlias: string, userId: string, apiCall: (roomIdOrAlias: string) => Promise<string>): Promise<string> {
        try {
            // First just try joining via the apiCall
            return await apiCall(roomIdOrAlias);
        } catch (err) {
            // If the user being joined is *not* the bridge bot, try and get the bridge bot to
            // join them to the room.
            if (userId !== this.appservice.botUserId) {
                const client = this.appservice.botIntent.underlyingClient;
                const roomId = await client.resolveRoom(roomIdOrAlias);
                try {
                    // First start with having the bridge bot invite the user to the room
                    await client.inviteUser(userId, roomId);
                } catch (err) {
                    // The invite failed - use the underlying join strategy to join the room, just in case.
                    // If there's no join strategy, we want to fall through to an error.
                    if (this.underlyingStrategy) return this.underlyingStrategy.joinRoom(roomId, userId, apiCall);
                    throw err;
                }

                // The invite succeeded - use the underlying join strategy to join the room or just call use
                // the apiCall if no strategy exists. We are expecting success.
                if (this.underlyingStrategy) return this.underlyingStrategy.joinRoom(roomId, userId, apiCall);
                else return apiCall(roomId);
            } else if (this.underlyingStrategy) {
                // If the user being joined *is* the bridge bot, try and use the join strategy to join.
                return this.underlyingStrategy.joinRoom(roomIdOrAlias, userId, apiCall);
            }

            // Finally, if all else fails, throw.
            throw err;
        }
    }
}

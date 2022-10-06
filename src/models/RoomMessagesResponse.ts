import { RoomEventData, RoomStateEventData } from "./events/RoomEvent";

/**
 * The options available when creating a room.
 * @category Models
 */
export interface RoomMessagesResponse {
    start: string;
    chunk: RoomEventData[];
    end?: string;
    state: RoomStateEventData[];
}

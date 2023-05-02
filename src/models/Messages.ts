import { RoomEventContent } from "./events/RoomEvent";

export interface GetRoomMessagesResponse {
    /**
     * A list of room events. The order depends on the dir parameter passed to the function.
     * For dir=b events will be in reverse-chronological order,
     * For dir=f in chronological order. (The exact definition of chronological is dependent on the server implementation.)
     *
     * Note that an empty array does not necessarily imply that no more events are available. You can continue
     * to paginate until `end` is empty.
     */
    chunk: RoomEventContent[];
    /**
     * A token corresponding to the end of `chunk`. This token can be passed back to getMessages to request further events.
     * If no further events are available (either because we have reached the start of the timeline, or because you do
     * not have permission to see any more events), this property will not be provided.
     */
    end?: string;
    /**
     * A token corresponding to the start of chunk.
     */
    start: string;
    /**
     * A list of state events relevant to showing the `chunk`.
     * For example, if `lazy_load_members` is enabled in the provided filter then this
     * may contain the membership events for the senders of events in the `chunk`.
     */
    state: RoomEventContent[];
}
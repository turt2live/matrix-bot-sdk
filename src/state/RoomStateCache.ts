import { MatrixClient } from "..";
import { LogService } from "../logging/LogService";
import { RoomState } from "./RoomState";

export default class RoomStateCache {
    private rooms = new Map<string /* room id */, RoomState>();

    constructor(client: MatrixClient) {
        client.on('room.leave', (roomId: string) => {
            this.rooms.delete(roomId);
        })
    }

    private getRoom(roomId: string): RoomState {
        const room = this.rooms.get(roomId);
        if (room !== undefined) {
            return room;
        } else {
            const newRoom = new RoomState(roomId);
            this.rooms.set(roomId, newRoom);
            return newRoom;
        }
    }

    /**
     * Mirrors the `MatrixClient` interface for processing sync.
     * Updates the cache by extracting state updates from `state`.
     * @param raw The entire raw sync response.
     */
    public processSync(raw: any): void {
        if (!raw) return; // nothing to process
        let joinedRooms = (raw['rooms'] ?? {})['join'] || {};
        for (let [roomId, room] of Object.entries(joinedRooms)) {
            const events = (room['state'] ?? {})['events'] ?? [];
            if (events.length > 0) {
                const roomState = this.getRoom(roomId);
                events.forEach(roomState.updateForEvent, roomState);
            }
        }
    }

    /**
     * Mirrors the `MatrixClient` interface for getting a room state event from
     * https://spec.matrix.org/latest/client-server-api/#get_matrixclientv3roomsroomidstateeventtypestatekey
     * with the intention that it can be used as a transparent replacement.
     * @param roomId The room to get the room state from.
     * @param type The event type.
     * @param stateKey The state key of the event.
     * @returns The content of the state event.
     */
    public getRoomStateEvent(roomId, type, stateKey): any {
        return this.getRoom(roomId).getStateEvent(type, stateKey).content;
    }

    /**
     * Mirrors the `MatrixClient` interface for getting the room state
     * https://spec.matrix.org/latest/client-server-api/#get_matrixclientv3roomsroomidstate
     * with the intention that it can be used as a transparent replacement.
     * @param roomId The room to get the room state for.
     * @returns All of the room state events in their entirity.
     */
    public getRoomState(roomId: string): any[] {
        return this.getRoom(roomId).getRoomState();
    }
}

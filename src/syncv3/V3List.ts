import { IV3Room, V3Room } from "./V3Room";
import { Operation, OpSync, SyncV3Operation } from "./operations";
import { SyncV3List, SyncV3OperationRoom, SyncV3Room } from "./models";
import { MatrixClient } from "../MatrixClient";

/**
 * @category Unstable: Sync V3
 */
export enum ListBehaviour {
    JoinedOnly,
    InvitedOnly,
    DMsOnly,
}

/**
 * @category Unstable: Sync V3
 */
export enum SortBehaviour {
    NotificationCount = "by_notification_count",
    Recency = "by_recency",
    Name = "by_name",
}

/**
 * @category Unstable: Sync V3
 */
export const CURRENT_USER_STATE_KEY = "@CURRENT";

/**
 * @category Unstable: Sync V3
 */
export type RequiredStateTuple = [string, string];

// Unclear if it's even worth changing this to be smaller/bigger, but let's start here.
const WINDOW_SIZE = 1000;

const TIMELINE_LIMIT = 20; // make configurable?

/**
 * @category Unstable: Sync V3
 */
export interface IV3List {
    totalRoomCount: number;
    orderedKnownRooms: IV3Room[];
    unorderedAllRooms: IV3Room[];
}

/**
 * @category Unstable: Sync V3
 */
export class V3List implements IV3List {
    private roomsByRange = new Map<string, V3Room[]>(); // key is JSON-serialized range
    private roomMap = new Map<string, V3Room>(); // key is room ID
    private totalCount = 0;

    public constructor(
        public readonly behaviour: ListBehaviour,
        public readonly sort: SortBehaviour[],
    ) {
    }

    public get lossySerialized(): Omit<OpSync, "list">[] {
        return Array.from(this.roomsByRange.entries()).map(([serializedRange, rooms]) => ({
            op: Operation.Sync,
            range: JSON.parse(serializedRange),
            rooms: rooms.filter(r => !!r).map(r => r.lossySerialized),
        }));
    }

    public get totalRoomCount(): number {
        return this.totalCount;
    }

    public get orderedKnownRooms(): V3Room[] {
        // "Just because you can chain functions, doesn't mean you should" ~ CS Instructor
        return Array.from(this.roomsByRange.entries())
            .map(([serializedRange, rooms]) => [JSON.parse(serializedRange)[0], rooms] as [number, V3Room[]])
            .sort((a, b) => a[0] - b[0])
            .map(e => e[1])
            .reduce((p, c) => [...p, ...c], []);
    }

    public get unorderedAllRooms(): V3Room[] {
        return Array.from(this.roomMap.values());
    }

    private findRange(index: number): [number, number] {
        return [
            Math.floor(index / WINDOW_SIZE) * WINDOW_SIZE,
            Math.floor((index + WINDOW_SIZE) / WINDOW_SIZE) * WINDOW_SIZE,
        ];
    }

    private findIndexInRange(sourceIndex: number, range: [number, number]): number {
        return sourceIndex - range[0];
    }

    public getDefinitionFor(currentUserId: string): SyncV3List {
        const ranges: [number, number][] = [];
        for (let i = 0; i <= Math.ceil(this.totalCount / WINDOW_SIZE); i++) {
            ranges.push([i * WINDOW_SIZE, (i + 1) * WINDOW_SIZE]);
        }
        return {
            filters: {
                is_dm: this.behaviour === ListBehaviour.DMsOnly,
                is_invite: this.behaviour === ListBehaviour.InvitedOnly,
            },
            sort: this.sort,
            required_state: V3Room.REQUIRED_STATE.map(t => [t[0], t[1] === CURRENT_USER_STATE_KEY ? currentUserId : t[1]]),
            timeline_limit: TIMELINE_LIMIT,
            rooms: ranges,
        };
    }

    private async getOrCreateRoom(client: MatrixClient, room: SyncV3OperationRoom): Promise<V3Room> {
        if (!this.roomMap.get(room.room_id)) {
            this.roomMap.set(room.room_id, new V3Room(room.room_id));
        }
        const mapped = this.roomMap.get(room.room_id);
        if (room.required_state) await mapped.updateState(client, room.required_state);
        if (room.timeline) await mapped.updateTimeline(client, room.timeline);
        return mapped;
    }

    private getOrCreateRangeFromIndex(index: number): {range: [number, number], inRangeIdx: number, rooms: V3Room[]} {
        const range = this.findRange(index);
        const inRangeIdx = this.findIndexInRange(index, range);
        let rooms = this.roomsByRange.get(JSON.stringify(range));
        if (!rooms) {
            rooms = new Array<V3Room>(range[1] - range[0]).fill(null);
            this.roomsByRange.set(JSON.stringify(range), rooms);
        }
        return {range, inRangeIdx, rooms};
    }

    public async processOperations(client: MatrixClient, totalCount: number, ops: SyncV3Operation[]): Promise<void> {
        if (totalCount) this.totalCount = totalCount;
        for (const op of ops) {
            switch(op.op) {
                case Operation.Delete: {
                    const range = this.findRange(op.index);
                    const inRangeIdx = this.findIndexInRange(op.index, range);
                    const rooms = this.roomsByRange.get(JSON.stringify(range));
                    if (rooms) {
                        const [deletedRoom] = rooms.splice(inRangeIdx, 1);
                        this.roomMap.delete(deletedRoom.roomId);
                    }
                    break;
                }
                case Operation.Insert: {
                    const info = this.getOrCreateRangeFromIndex(op.index);
                    info.rooms[info.inRangeIdx] = await this.getOrCreateRoom(client, op.room);
                    break;
                }
                case Operation.Update: {
                    const info = this.getOrCreateRangeFromIndex(op.index);
                    const room = info.rooms[info.inRangeIdx];
                    if (!room) throw new Error("Failed to handle update operation: unknown room at index. Op: " + JSON.stringify(op));
                    if (op.room.required_state) await room.updateState(client, op.room.required_state);
                    if (op.room.timeline) await room.updateTimeline(client, op.room.timeline);
                    break;
                }
                case Operation.Sync: {
                    const rooms = new Array<V3Room>(op.range[1] - op.range[0]).fill(null)
                    for (let i = 0; i < op.rooms.length; i++) {
                        if (!op.rooms[i]) continue;
                        rooms[i] = await this.getOrCreateRoom(client, op.rooms[i]);
                    }
                    this.roomsByRange.set(JSON.stringify(op.range), rooms);
                    break;
                }
                case Operation.Invalidate: {
                    this.roomsByRange.delete(JSON.stringify(op.range));
                    break;
                }
            }
        }
    }
}

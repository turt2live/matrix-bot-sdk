import { SyncV3Operation } from "./operations";
import { RequiredStateTuple, SortBehaviour } from "./V3List";

/**
 * @category Unstable: Sync V3
 */
export interface SyncV3Event {
    // Normal MatrixEvent, but we don't have types for that yet.

    event_id: string;
    type: string;
    sender: string;
    state_key?: string;
    content: Record<string, any>;
    origin_server_ts: number;
    unsigned: Record<string, any>;
}

/**
 * @category Unstable: Sync V3
 */
export interface SyncV3Room {
    name: string;
    required_state: (SyncV3Event & {state_key: string})[];
    timeline: SyncV3Event[];
    notification_count: number;
    highlight_count: number;
}

/**
 * @category Unstable: Sync V3
 */
export interface SyncV3OperationRoom extends Pick<SyncV3Room, "required_state" | "timeline"> {
    room_id: string;
}

/**
 * @category Unstable: Sync V3
 */
export interface SyncV3Response {
    ops: SyncV3Operation[];
    initial?: boolean;
    room_subscriptions: {
        [roomId: string]: SyncV3Room;
    };
    counts: number[]; // number of joined rooms per list
    extensions: {}; // TODO
    pos: string;
}

/**
 * @category Unstable: Sync V3
 */
export interface SyncV3List {
    rooms: [number, number][];
    sort: SortBehaviour[];
    required_state: RequiredStateTuple[];
    timeline_limit: number;
    filters?: SyncV3ListFilter;
}

/**
 * @category Unstable: Sync V3
 */
export interface SyncV3ListFilter {
    is_dm?: boolean;
    spaces?: string[]; // IDs
    is_encrypted?: boolean;
    is_invite?: boolean;
}


import { SyncV3OperationRoom, SyncV3Room } from "./models";

/**
 * @category Unstable: Sync V3
 */
export enum Operation {
    Sync = "SYNC",
    Update = "UPDATE",
    Insert = "INSERT",
    Delete = "DELETE",
    Invalidate = "INVALIDATE",
}

/**
 * @category Unstable: Sync V3
 */
export type OpSync = {
    op: Operation.Sync;
    list: number;
    range: [number, number];
    rooms: (SyncV3Room & {room_id: string})[];
}

/**
 * @category Unstable: Sync V3
 */
export type OpUpdate = {
    op: Operation.Update;
    list: number;
    index: number;
    room: Partial<SyncV3Room>; // changed fields only
}

/**
 * @category Unstable: Sync V3
 */
export type OpDelete = {
    op: Operation.Delete;
    list: number;
    index: number;
}

/**
 * @category Unstable: Sync V3
 */
export type OpInsert = {
    op: Operation.Insert;
    list: number;
    index: number;
    room: SyncV3OperationRoom;
}

/**
 * @category Unstable: Sync V3
 */
export type OpInvalidate = {
    op: Operation.Invalidate;
    list: number;
    range: [number, number];
}

/**
 * @category Unstable: Sync V3
 */
export type SyncV3Operation =
    | OpSync
    | OpInvalidate
    | OpInsert
    | OpUpdate
    | OpDelete;

/**
 * A Sync V3 list.
 * @category Unstable: Sync V3
 */
import { MatrixClient } from "../MatrixClient";
import { OpDelete, OpInsert, OpSync, OpUpdate } from "./operations";
import { SyncV3Event } from "./models";
import { MembershipEvent } from "../models/events/MembershipEvent";
import { raw } from "express";

export enum ListBehaviour {
    General,
    Invites,
}

export class List {
    private roomIds: string[] = [];

    // TODO: Handle range requests
    // TODO: Do `this.processEvent` from MatrixClient

    public constructor(
        public readonly listIndex: number,
        public readonly client: MatrixClient,
        public readonly behaviour: ListBehaviour,
    ) {
        // noinspection JSIgnoredPromiseFromCall
        this.loadList();
    }

    public get orderedRoomIds(): string[] {
        return this.roomIds.map(r => r); // clone to keep immutability
    }

    public async handleSyncOp(op: OpSync): Promise<void> {
        this.roomIds = op.rooms.map(r => r.room_id);
        while(this.roomIds.length <= (op.range[1] - op.range[0])) {
            this.roomIds.push(null);
        }
        await this.storeList();

        for (const room of op.rooms) {
            await this.handleTimeline(room.room_id, room.timeline);
        }
    }

    public async handleInsertOp(op: OpInsert): Promise<void> {
        this.roomIds.splice(op.index, 0, op.room.room_id);
        await this.storeList();
        await this.handleTimeline(op.room.room_id, op.room.timeline);
    }

    public async handleUpdateOp(op: OpUpdate): Promise<void> {
        // Update in place - process potential timeline data
        if (!op.room.timeline) return; // nothing to do

        await this.handleTimeline(this.roomIds[op.index], op.room.timeline);
    }

    public async handleDeleteOp(op: OpDelete): Promise<void> {
        this.roomIds.splice(op.index, 1);
        await this.storeList();
    }

    private async storeList(): Promise<void> {
        await this.client.storageProvider.storeValue("sync_v3_list_" + this.listIndex, JSON.stringify(this.roomIds));
    }

    private async loadList(): Promise<void> {
        this.roomIds = JSON.parse(await this.client.storageProvider.readValue("sync_v3_list_" + this.listIndex) || "[]");
    }

    private async findMembership(timeline: SyncV3Event[]): Promise<SyncV3Event> {
        const myUserId = await this.client.getUserId();
        return timeline.slice().reverse().find(e => e.state_key === myUserId && e.type === "m.room.member");
    }

    private async handleTimeline(roomId: string, timeline: SyncV3Event[]): Promise<void> {
        if (!timeline) return;
        // if (this.behaviour !== ListBehaviour.General) return; // TODO: See operation comment below

        // Ideally we'd use the operation to determine the membership transition based on the ListBehaviour,
        // but instead we're stuck with trying to figure it out from a timeline update on *all* operations.
        const rawMembership = await this.findMembership(timeline)
        if (rawMembership) {
            const membership = new MembershipEvent(rawMembership);

            // TODO: Handle atomic updates.
            // If there's a UPDATE, DELETE, INSERT then we probably don't want to fire 2 membership updates
            if (membership.effectiveMembership === "join") {
                this.client.emit("room.join", roomId, membership.raw);
            } else if (membership.effectiveMembership === "leave") {
                this.client.emit("room.leave", roomId, membership.raw);
            } else if (membership.effectiveMembership === "invite") {
                this.client.emit("room.invite", roomId, membership.raw);
            }
        }

        // TODO: Exclude events that were pre-join

        for (const event of timeline) {
            if (event['type'] === "m.room.message") {
                this.client.emit("room.message", roomId, event);
            } else if (event['type'] === "m.room.tombstone" && event['state_key'] === '') {
                this.client.emit("room.archived", roomId, event);
            } else if (event['type'] === "m.room.create" && event['state_key'] === '' && event['content']?.['predecessor']?.['room_id']) {
                this.client.emit("room.upgraded", roomId, event);
            }

            this.client.emit("room.event", roomId, event);
        }
    }
}

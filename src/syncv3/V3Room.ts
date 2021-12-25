import { RoomNameEvent } from "../models/events/RoomNameEvent";
import { RoomTopicEvent } from "../models/events/RoomTopicEvent";
import { EncryptionEvent, EncryptionEventContent } from "../models/events/EncryptionEvent";
import { CURRENT_USER_STATE_KEY, RequiredStateTuple } from "./V3List";
import { MembershipEvent } from "../models/events/MembershipEvent";
import { SyncV3Event, SyncV3Room } from "./models";
import { MatrixClient } from "../MatrixClient";

/**
 * @category Unstable: Sync V3
 */
export interface IV3Room {
    name: string | undefined;
    topic: string | undefined;
    encryptionConfig: EncryptionEventContent | undefined;
    membership: MembershipEvent;
}

/**
 * @category Unstable: Sync V3
 */
export class V3Room implements IV3Room {
    private nameEvent: RoomNameEvent;
    private topicEvent: RoomTopicEvent;
    private encryptionEvent: EncryptionEvent;
    private myMembership: MembershipEvent;

    // TODO: Include other event types as "required"?

    public constructor(public readonly roomId: string) {
    }

    public get lossySerialized(): SyncV3Room & {room_id: string} {
        return {
            room_id: this.roomId,
            timeline: [],
            required_state: [
                this.nameEvent, this.topicEvent, this.encryptionEvent, this.myMembership,
            ].filter(e => !!e).map(e => e.raw),
            name: this.nameEvent?.name,

            // We don't know these values, but also don't really care
            highlight_count: 0,
            notification_count: 0,
        };
    }

    public get name(): string | undefined {
        return this.nameEvent?.name ?? undefined;
    }

    public get topic(): string | undefined {
        return this.topicEvent?.topic ?? undefined;
    }

    public get encryptionConfig(): EncryptionEventContent | undefined {
        if (!this.encryptionEvent?.algorithm) return undefined;
        return this.encryptionEvent?.content ?? undefined;
    }

    public get membership(): MembershipEvent {
        return this.myMembership;
    }

    public async updateState(client: MatrixClient, state: (SyncV3Event & {state_key: string})[]): Promise<void> {
        // TODO: Send events through pre-processor

        for (const event of state) {
            if (event['type'] === "m.room.name" && event['state_key'] === '') this.nameEvent = new RoomNameEvent(event);
            if (event['type'] === "m.room.topic" && event['state_key'] === '') this.topicEvent = new RoomTopicEvent(event);
            if (event['type'] === "m.room.encryption" && event['state_key'] === '') this.encryptionEvent = new EncryptionEvent(event);
            if (event['type'] === "m.room.member" && event['state_key'] === (await client.getUserId())) this.myMembership = new MembershipEvent(event);
        }
    }

    public async updateTimeline(client: MatrixClient, timeline: SyncV3Event[]): Promise<void> {
        // TODO: Send events through pre-processor

        // TODO: Process membership
        // TODO: Process events
        console.log('@@ TIMELINE', timeline);
    }

    public static get REQUIRED_STATE(): RequiredStateTuple[] {
        return [
            ["m.room.name", ""],
            ["m.room.topic", ""],
            ["m.room.encryption", ""],
            ["m.room.member", CURRENT_USER_STATE_KEY],
        ];
    }
}

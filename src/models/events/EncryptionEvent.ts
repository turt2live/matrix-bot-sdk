import { StateEvent } from "./RoomEvent";

/**
 * The kinds of room encryption algorithms allowed by the spec.
 * @category Models
 * @see EncryptionEvent
 */
export enum RoomEncryptionAlgorithm {
    MegolmV1AesSha2 = "m.megolm.v1.aes-sha2",
}

/**
 * The content definition for m.room.encryption events
 * @category Matrix event contents
 * @see EncryptionEvent
 */
export interface EncryptionEventContent {
    /**
     * The encryption algorithm for the room.
     */
    algorithm: string | RoomEncryptionAlgorithm;

    /**
     * How long a session should be used before changing it.
     */
    rotation_period_ms?: number;

    /**
     * How many messages should be sent before changing the session.
     */
    rotation_period_msgs?: number;
}

/**
 * Represents an m.room.encryption state event
 * @category Matrix events
 */
export class EncryptionEvent extends StateEvent<EncryptionEventContent> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The encryption algorithm for the room.
     */
    public get algorithm(): string | RoomEncryptionAlgorithm {
        return this.content.algorithm;
    }

    /**
     * How long a session should be used before changing it. Defaults to a week.
     */
    public get rotationPeriodMs(): number {
        return this.content.rotation_period_ms ?? 604800000; // 1 week
    }

    /**
     * How many messages should be sent before a session changes. Defaults to 100.
     */
    public get rotationPeriodMessages(): number {
        return this.content.rotation_period_msgs ?? 100;
    }
}

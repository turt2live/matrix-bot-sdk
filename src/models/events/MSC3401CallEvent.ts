import { StateEvent } from "./RoomEvent";

/**
 * The content definition for m.call state events
 * @category Matrix event contents
 * @see MSC3401CallEvent
 */
export interface MSC3401CallEventContent {
    "m.intent": "m.room" | "m.ring" | "m.prompt" | string;
    "m.type": "m.voice" | "m.video" | string;
    "m.terminated": boolean; // TODO: Check type
    "m.name": string;
    "m.foci"?: string[]; // Not currently supported
}

/**
 * Represents an m.call state event
 * @category Matrix events
 */
export class MSC3401CallEvent extends StateEvent<MSC3401CallEventContent> {
    constructor(event: any) {
        super(event);
    }

    public get callId(): string {
        return this.stateKey;
    }

    public get startTime(): number {
        return this.timestamp;
    }

    public get intent(): MSC3401CallEventContent["m.intent"] {
        return this.content["m.intent"];
    }

    public get callType(): MSC3401CallEventContent["m.type"] {
        return this.content["m.type"];
    }

    public get isTerminated(): boolean {
        return !!this.content["m.terminated"];
    }

    public get name(): string {
        return this.content["m.name"];
    }
}

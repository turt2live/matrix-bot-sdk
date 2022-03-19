import { StateEvent } from "./RoomEvent";

/**
 * The definition of a member's device in an m.call.member event content.
 * @category Matrix event contents
 * @see MSC3401CallMemberEventContent
 */
export interface MSC3401CallMemberEventDevice {
    device_id: string;
    session_id: string;
    feeds: {
        purpose: "m.usermedia" | "m.screenshare" | string;
    }[];
}

/**
 * The content definition for m.call.member state events
 * @category Matrix event contents
 * @see MSC3401CallMemberEvent
 */
export interface MSC3401CallMemberEventContent {
    "m.calls": {
        "m.call_id": string;
        "m.foci"?: string[]; // not currently used
        "m.devices": MSC3401CallMemberEventDevice[];
    }[];
}

/**
 * Represents an m.call.member state event
 * @category Matrix events
 */
export class MSC3401CallMemberEvent extends StateEvent<MSC3401CallMemberEvent> {
    constructor(event: any) {
        super(event);
    }

    public get forUserId(): string {
        return this.stateKey;
    }

    public get isInCall(): boolean {
        return this.content["m.calls"]?.length > 0;
    }

    public get callId(): string {
        return this.content["m.calls"]?.[0]?.["m.call_id"];
    }

    public get deviceIdSessions(): Record<string, string> {
        return this.content["m.calls"]?.[0]?.["m.devices"]?.reduce((p, c) => {
            if (c.feeds?.filter(f => f.purpose === "m.usermedia" || f.purpose === "m.screenshare").length === 0) {
                return p;
            }
            return { ...p, [c.device_id]: c.session_id };
        }, {});
    }
}

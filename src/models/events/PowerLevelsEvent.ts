import { StateEvent } from "./RoomEvent";

/**
 * The content definition for m.room.power_levels events
 * @category Matrix event contents
 * @see PowerLevelsEvent
 */
export interface PowerLevelsEventContent {
    /**
     * The power level required to ban. Default 50.
     */
    ban?: number;

    /**
     * A map of event types to the power level required to send them.
     */
    events?: { [eventType: string]: number };

    /**
     * The power level required to send events in the room. Default 50.
     */
    events_default?: number;

    /**
     * The power level required to invite users to the room. Default 50.
     */
    invite?: number;

    /**
     * The power level required to kick users from the room. Default 50.
     */
    kick?: number;

    /**
     * The power level required to redact other people's events in the room. Default 50.
     */
    redact?: number;

    /**
     * The power level required to send state events in the room. Default 50.
     */
    state_default?: number;

    /**
     * A map of user IDs to power levels.
     */
    users?: { [userId: string]: number };

    /**
     * The power level of users not listed in `users`. Default 0.
     */
    users_default?: number;

    /**
     * Power levels required to send certain kinds of notifications.
     */
    notifications?: {
        /**
         * The power level required to send "@room" notifications. Default 50.
         */
        room?: number;
    };
}

function defaultNum(val: number | undefined, def: number): number {
    if (!val && val !== 0) return def;
    return val;
}

/**
 * Represents an m.room.power_levels state event
 * @category Matrix events
 */
export class PowerLevelsEvent extends StateEvent<PowerLevelsEventContent> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The power level required to ban users.
     */
    public get banLevel(): number {
        return defaultNum(this.content.ban, 50);
    }

    /**
     * The power level required to invite users.
     */
    public get inviteLevel(): number {
        return defaultNum(this.content.invite, 50);
    }

    /**
     * The power level required to kick users.
     */
    public get kickLevel(): number {
        return defaultNum(this.content.kick, 50);
    }

    /**
     * The power level required to redact messages sent by other users.
     */
    public get redactLevel(): number {
        return defaultNum(this.content.redact, 50);
    }

    /**
     * The power level required to send "@room" notifications.
     */
    public get notifyWholeRoomLevel(): number {
        if (!this.content.notifications) return 50;
        return defaultNum(this.content.notifications.room, 50);
    }

    /**
     * The default power level for users.
     */
    public get defaultUserLevel(): number {
        return defaultNum(this.content.users_default, 0);
    }

    /**
     * The default power level required to send state events.
     */
    public get defaultStateEventLevel(): number {
        return defaultNum(this.content.state_default, 50);
    }

    /**
     * The default power level required to send room events.
     */
    public get defaultEventLevel(): number {
        return defaultNum(this.content.events_default, 50);
    }
}

import { PresenceEventContent, PresenceState } from "./events/PresenceEvent";

/**
 * Presence information for a user.
 * @category Models
 */
export class Presence {
    constructor(protected presence: PresenceEventContent) {
    }

    /**
     * The state for this presence update.
     */
    public get state(): PresenceState {
        return this.presence.presence;
    }

    /**
     * The status message which accompanies this presence. May be falsey.
     */
    public get statusMessage(): string {
        return this.presence.status_msg;
    }

    /**
     * How long ago in milliseconds this presence was changed. May be falsey.
     */
    public get lastActiveAgo(): number {
        return this.presence.last_active_ago;
    }

    /**
     * Whether or not the user is currently active.
     */
    public get currentlyActive(): boolean {
        return this.presence.currently_active;
    }
}

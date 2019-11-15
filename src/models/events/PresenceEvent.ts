import { MatrixEvent } from "./Event";

/**
 * The allowed states of presence in Matrix
 */
export type PresenceState = "online" | "offline" | "unavailable";

export interface PresenceEventContent {
    /**
     * The avatar URL for the user, if any.
     */
    avatar_url?: string;

    /**
     * The display name for the user, if any.
     */
    displayname?: string;

    /**
     * How long ago the user performed some action, in milliseconds.
     */
    last_active_ago?: number;

    /**
     * The user's presence state.
     */
    presence: PresenceState;

    /**
     * Whether or not the user is currently active.
     */
    currently_active?: boolean;

    /**
     * A status message associated with this presence.
     */
    status_msg?: string;
}

export class PresenceEvent extends MatrixEvent<PresenceEventContent> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The current presence state for the user.
     */
    public get presence(): PresenceState {
        return this.content.presence;
    }
}

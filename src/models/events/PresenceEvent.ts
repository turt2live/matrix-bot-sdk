import { MatrixEvent } from "./Event";

/**
 * The allowed states of presence in Matrix.
 *
 * * `online`: The default state when the user is connected to an event stream.
 * * `unavailable`: The user is not reachable at this time e.g. they are idle.
 * * `offline`: The user is not connected to an event stream or is explicitly suppressing their profile information from being sent.
 *
 * @category Matrix event info
 * @see PresenceEventContent
 */
export type PresenceState = "online" | "offline" | "unavailable";

/**
 * Event content for m.presence events
 * @category Matrix event contents
 * @see PresenceEvent
 */
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
     *
     * @see {@link PresenceState} for a description of each presence key.
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

/**
 * Wraps a m.presence ephemeral event in Matrix
 * @category Matrix events
 */
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

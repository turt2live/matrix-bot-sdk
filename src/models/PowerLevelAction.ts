/**
 * Actions that can be guarded by power levels.
 */
export enum PowerLevelAction {
    /**
     * Power level required to ban other users.
     */
    Ban = "ban",

    /**
     * Power level required to kick other users.
     */
    Kick = "kick",

    /**
     * Power level required to redact events sent by other users. Users can redact
     * their own messages regardless of this power level requirement, unless forbidden
     * by the `events` section of the power levels content.
     */
    RedactEvents = "redact",

    /**
     * Power level required to invite other users.
     */
    Invite = "invite",

    /**
     * Power level required to notify the whole room with "@room".
     */
    NotifyRoom = "notifications.room",
}

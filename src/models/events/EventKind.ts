/**
 * Represents the different kinds of events a bot/appservice might see.
 * @category Matrix events
 */
export enum EventKind {
    /**
     * A room event. This could be a message event or a state event, and is associated with
     * a room.
     */
    RoomEvent = "room",

    /**
     * An ephemeral event, such as typing notifications or presence.
     */
    EphemeralEvent = "ephemeral",
}

import { PowerLevelsEventContent } from "./events/PowerLevelsEvent";
import { CreateEventContent } from "./events/CreateEvent";

/**
 * "private_chat" sets:
 * - join_rules to `invite`
 * - history_visibility to `shared`
 * - guest_access to `can_join`
 *
 * "trusted_private_chat" sets:
 * - join_rules to `invite`
 * - history_visibility to `shared`
 * - guest_access to `can_join`
 * - All invitees are given the same power level as the room creator.
 *
 * "public_chat" sets:
 * - join_rules to `public`
 * - history_visibility to `shared`
 * - guest_access to `forbidden`
 * @category Models
 */
export type RoomPreset = "private_chat" | "trusted_private_chat" | "public_chat";

/**
 * "public" visibility indicates that the room will be shown in the published room list.
 *
 * "private" visibility indicates that the room will not be included in published room list.
 * @category Models
 */
export type RoomVisibility = "public" | "private";

/**
 * The options available when creating a room.
 * @category Models
 */
export interface RoomCreateOptions {
    /**
     * Extra keys, such as m.federate, to be added to the content of the m.room.create event.
     * The server will overwrite the following keys: `creator`, `room_version`.
     * Future versions of the specification may allow the server to overwrite other keys.
     */
    creation_content?: Omit<CreateEventContent, "creator">;

    /**
     * A list of state events to set in the new room.
     * This allows the user to override the default state events set in the new room.
     * The expected format of the state events are an object with `type`, `state_key` and `content` keys set.
     * Takes precedence over events set by `preset`, but gets overridden by `name` and `topic` keys.
     */
    initial_state?: {
        /**
         * The content of the event.
         */
        content: any;

        /**
         * The state_key of the state event. Defaults to an empty string.
         */
        state_key?: string;

        /**
         * The type of event to send.
         */
        type: string;
    }[];

    /**
     * A list of user IDs to invite to the room. This will tell the server to invite everyone in the list to the newly created room.
     */
    invite?: string[];

    invite_3pid?: {
        /**
         * The invitee’s third party identifier.
         */
        address: string;

        /**
         * An access token previously registered with the identity server.
         * Servers can treat this as optional to distinguish between r0.5-compatible clients and this specification version.
         */
        id_access_token: string;

        /**
         * The hostname+port of the identity server which should be used for third party identifier lookups.
         */
        id_server: string;

        /**
         * The kind of address being passed in the address field, for example `email`.
         */
        medium: string;
    }[];

    /**
     * This flag makes the server set the `is_direct` flag on the `m.room.member` events sent to the users in `invite` and `invite_3pid`.
     */
    is_direct?: boolean;

    /**
     * If this is included, an `m.room.name` event will be sent into the room to indicate the name of the room.
     */
    name?: string;

    /**
     * The power level content to override in the default power level event.
     * This object is applied on top of the generated `m.room.power_levels` event content prior to it being sent to the room.
     * Defaults to overriding nothing.
     */
    power_level_content_override?: PowerLevelsEventContent;

    /**
     * Convenience parameter for setting various default state events based on a preset.
     *
     * If unspecified, the server should use the `visibility` to determine which preset to use.
     * A visbility of `public` equates to a preset of `public_chat` and `private` visibility equates to a preset of `private_chat`.
     */
    preset?: RoomPreset;

    /**
     * The desired room alias local part.
     * If this is included, a room alias will be created and mapped to the newly created room.
     * The alias will belong on the same homeserver which created the room.
     */
    room_alias_name?: string;

    /**
     * The room version to set for the room.
     * If not provided, the homeserver is to use its configured default.
     * If provided, the homeserver will return a `400` error with the errcode `M_UNSUPPORTED_ROOM_VERSION` if it does not support the room version.
     */
    room_version?: string;

    /**
     * If this is included, an `m.room.topic` event will be sent into the room to indicate the topic for the room.
     */
    topic?: string;

    /**
     * Sets the visibility of the room
     * Rooms default to private visibility if this key is not included.
     */
    visibility?: RoomVisibility;
}

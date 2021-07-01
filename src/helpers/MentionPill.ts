import { MatrixClient } from "../MatrixClient";
import { Permalinks } from "./Permalinks";
import { extractRequestError, LogService } from "..";

/**
 * Represents a system for generating a mention pill for an entity.
 * @category Utilities
 */
export class MentionPill {

    private constructor(private entityPermalink: string, private displayName: string) {
    }

    /**
     * The HTML component of the mention.
     */
    public get html(): string {
        return `<a href="${this.entityPermalink}">${this.displayName}</a>`;
    }

    /**
     * The plain text component of the mention.
     */
    public get text(): string {
        return this.displayName;
    }

    /**
     * Creates a new mention for a user in an optional room.
     * @param {string} userId The user ID the mention is for.
     * @param {String} inRoomId Optional room ID the user is being mentioned in, for the aesthetics of the mention.
     * @param {MatrixClient} client Optional client for creating a more pleasing mention.
     * @returns {Promise<MentionPill>} Resolves to the user's mention.
     */
    public static async forUser(userId: string, inRoomId: string = null, client: MatrixClient = null): Promise<MentionPill> {
        const permalink = Permalinks.forUser(userId);

        let displayName = userId;
        try {
            if (client) {
                let profile = null;

                if (inRoomId) {
                    profile = await client.getRoomStateEvent(inRoomId, "m.room.member", userId);
                }
                if (!profile) {
                    profile = await client.getUserProfile(userId);
                }

                if (profile['displayname']) {
                    displayName = profile['displayname'];
                }
            }
        } catch (e) {
            LogService.warn("MentionPill", "Error getting profile", extractRequestError(e));
        }

        return new MentionPill(permalink, displayName);
    }

    /**
     * Creates a new mention for a room (not @room, but the room itself to be linked).
     * @param {string} roomIdOrAlias The room ID or alias to mention.
     * @param {MatrixClient} client Optional client for creating a more pleasing mention.
     * @returns {Promise<MentionPill>} Resolves to the room's mention.
     */
    public static async forRoom(roomIdOrAlias: string, client: MatrixClient = null): Promise<MentionPill> {
        let permalink = Permalinks.forRoom(roomIdOrAlias);
        let displayProp = roomIdOrAlias;

        try {
            if (client) {
                const roomId = await client.resolveRoom(roomIdOrAlias);
                const canonicalAlias = await client.getRoomStateEvent(roomId, "m.room.canonical_alias", "");
                if (canonicalAlias?.alias) {
                    displayProp = canonicalAlias.alias;
                    permalink = Permalinks.forRoom(displayProp);
                }
            }
        } catch (e) {
            LogService.warn("MentionPill", "Error getting room information", extractRequestError(e));
        }

        return new MentionPill(permalink, displayProp);
    }

    /**
     * Creates a mention from static information.
     * @param {string} userId The user ID the mention is for.
     * @param {string} displayName The user's display name.
     * @returns {MentionPill} The mention for the user.
     */
    public static withDisplayName(userId: string, displayName: string): MentionPill {
        return new MentionPill(Permalinks.forUser(userId), displayName || userId);
    }
}

import { MatrixClient } from "./MatrixClient";
import { MSC2380MediaInfo } from "./models/unstable/MediaInfo";

/**
 * Represents a profile for a group
 * @category Unstable APIs
 * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
 */
export interface GroupProfile {
    /**
     * The name of the group
     */
    name: string;

    /**
     * The avatar for the group. Must be a MSC URI.
     */
    avatar_url: string;

    /**
     * The short description for the group. Equivalent to a room's topic.
     */
    short_description: string;

    /**
     * The long description for the group. Most clients will support HTML
     * in this.
     */
    long_description: string;
}

/**
 * Unstable APIs that shouldn't be used in most circumstances.
 * @category Unstable APIs
 */
export class UnstableApis {
    constructor(private client: MatrixClient) {
    }

    /**
     * Gets the local room aliases that are published for a given room.
     * @param {string} roomId The room ID to get local aliases for.
     * @returns {Promise<string[]>} Resolves to the aliases on the room, or an empty array.
     * @deprecated Relies on MSC2432 endpoint.
     */
    public async getRoomAliases(roomId: string): Promise<string[]> {
        const r = await this.client.doRequest("GET", "/_matrix/client/unstable/org.matrix.msc2432/rooms/" + encodeURIComponent(roomId) + "/aliases");
        return r['aliases'] || [];
    }

    /**
     * Creates a group.
     * @param {string} localpart The localpart for the group
     * @return {Promise<string>} Resolves to the created group ID.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async createGroup(localpart: string): Promise<string> {
        const response = await this.client.doRequest("POST", "/_matrix/client/unstable/create_group", null, { "localpart": localpart });
        return response["group_id"];
    }

    /**
     * Invites a user to the group.
     * @param {string} groupId The group ID to invite the user to.
     * @param {string} userId The user ID to invite to the group.
     * @return {Promise<"join" | "invite" | "reject">} Resolves to the invite state for
     *  the user. This is normally "invite", but may be "join" or "reject" if the user's
     *  homeserver accepted/rejected the invite right away.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async inviteUserToGroup(groupId: string, userId: string): Promise<"join" | "invite" | "reject"> {
        const path = `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/users/invite/${encodeURIComponent(userId)}`;
        const response = await this.client.doRequest("PUT", path, null, {});
        return response["state"];
    }

    /**
     * Kicks a user from a group.
     * @param {string} groupId The group ID to kick the user from.
     * @param {string} userId The user ID to kick from the group.
     * @return {Promise<any>} Resolves when completed.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async kickUserFromGroup(groupId: string, userId: string): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/users/remove/${encodeURIComponent(userId)}`, null, {});
    }

    /**
     * Updates a group's profile
     * @param {string} groupId The group ID to update.
     * @param {GroupProfile} profile The profile to update the group with.
     * @return {Promise<any>} Resolves when completed.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async setGroupProfile(groupId: string, profile: GroupProfile): Promise<any> {
        return this.client.doRequest("POST", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/profile`, null, profile);
    }

    /**
     * Sets a group's join policy to either be publicly joinable (open) or
     * require an invite (invite).
     * @param {string} groupId The group ID to set the policy for.
     * @param {"open" | "invite"} policy The policy to set.
     * @return {Promise<any>} Resolves when completed.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async setGroupJoinPolicy(groupId: string, policy: "open" | "invite"): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/settings/m.join_policy`, null, {
            "m.join_policy": {
                "type": policy,
            },
        });
    }

    /**
     * Adds a room to a group.
     * @param {string} groupId The group ID to add the room to.
     * @param {string} roomId The room ID to add to the group.
     * @param {boolean} isPublic Whether this group-room association is visible to non-members. Optional. Defaults to true.
     * @return {Promise<any>} Resolves when completed.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async addRoomToGroup(groupId: string, roomId: string, isPublic = true): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/rooms/${encodeURIComponent(roomId)}`, null, {
            "m.visibility": { type: isPublic ? "public" : "private" },
        });
    }

    /**
     * Updates the visibility of a room in a group.
     * @param {string} groupId The group ID of the room to update.
     * @param {string} roomId The room ID of the room to update.
     * @param {boolean} isPublic Whether this group-room association is visible to non-members.
     * @return {Promise<any>} Resolves when completed.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async updateGroupRoomVisibility(groupId: string, roomId: string, isPublic: boolean): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/rooms/${encodeURIComponent(roomId)}/config/m.visibility`, null, {
            type: isPublic ? "public" : "private",
        });
    }

    /**
     * Removes a room from a group.
     * @param {string} groupId The group ID to remove the room from.
     * @param {string} roomId The room ID to remove from the group.
     * @return {Promise<any>} Resolves when completed.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async removeRoomFromGroup(groupId: string, roomId: string): Promise<any> {
        return this.client.doRequest("DELETE", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/rooms/${encodeURIComponent(roomId)}`);
    }

    /**
     * Gets a group's profile.
     * @param {string} groupId The group ID to fetch the profile of.
     * @return {Promise<GroupProfile>} Resolves to the profile of the group.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async getGroupProfile(groupId: string): Promise<GroupProfile> {
        return this.client.doRequest("GET", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/profile`);
    }

    /**
     * Gets the users in a group.
     * @param {string} groupId The group ID of which to get the users.
     * @return {Promise<any[]>} Resolves to an array of all the users in the group.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async getGroupUsers(groupId: string): Promise<any[]> {
        const response = await this.client.doRequest("GET", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/users`);
        return response["chunk"];
    }

    /**
     * Gets the invited users of a group.
     * @param {string} groupId The group ID of which to get the invited users.
     * @return {Promise<any[]>} Resolves to an array of all the users invited to the group.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async getGroupInvitedUsers(groupId: string): Promise<any[]> {
        const response = await this.client.doRequest("GET", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/invited_users`);
        return response["chunk"];
    }

    /**
     * Gets the rooms of a group.
     * @param {string} groupId The group ID of which to get all the rooms.
     * @return {Promise<any[]>} Resolves to an array of all the rooms of the group.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async getGroupRooms(groupId: string): Promise<any[]> {
        const response = await this.client.doRequest("GET", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/rooms`);
        return response["chunk"];
    }

    /**
     * Accepts an invite to a group.
     * @param {string} groupId The group ID of which to accept the invite of.
     * @return {Promise<any>} Resolves when completed.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async acceptGroupInvite(groupId: string): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/accept_invite`, null, {});
    }

    /**
     * Joins a group.
     * @param {string} groupId The group ID to join.
     * @return {Promise<any>} Resolves when completed.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async joinGroup(groupId: string): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/join`, null, {});
    }

    /**
     * Leaves a group.
     * @param {string} groupId The group ID of the group to leave.
     * @return {Promise<any>} Resolves when completed.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async leaveGroup(groupId: string): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/leave`, null, {});
    }

    /**
     * Sets the publicity of a group.
     * @param {string} groupId The group ID to set the publicity of.
     * @param {boolean} publicise If the group should be publicised.
     * @return {Promise<any>} Resolves when completed.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async setGroupPublicity(groupId: string, publicise: boolean): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/update_publicity`, null, {
            publicise,
        });
    }

    /**
     * Gets all group IDs joined.
     * @return {Promise<string[]>} Resolves to the group IDs of the joined groups.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async getJoinedGroups(): Promise<string[]> {
        const response = await this.client.doRequest("GET", "/_matrix/client/unstable/joined_groups");
        return response["groups"];
    }

    /**
     * Gets the group IDs that the specified user has publicised.
     * @param {string} userId The user ID to fetch the publicised groups of.
     * @return {Promise<string[]>} Resolves to the publicised group IDs of that user.
     * @deprecated This API is no longer supported by Synapse and will be removed in a future version of the bot-sdk.
     */
    public async getPublicisedGroups(userId: string): Promise<string[]> {
        const response = await this.client.doRequest("GET", `/_matrix/client/unstable/publicised_groups/${encodeURIComponent(userId)}`);
        return response["groups"];
    }

    /**
     * Adds a reaction to an event. The contract for this function may change in the future.
     * @param {string} roomId The room ID to react in
     * @param {string} eventId The event ID to react against, in the given room
     * @param {string} emoji The emoji to react with
     * @returns {Promise<string>} Resolves to the event ID of the reaction
     */
    public async addReactionToEvent(roomId: string, eventId: string, emoji: string): Promise<string> {
        return this.client.sendEvent(roomId, "m.reaction", {
            "m.relates_to": {
                event_id: eventId,
                key: emoji,
                rel_type: "m.annotation",
            },
        });
    }

    /**
     * Get relations for a given event.
     * @param {string} roomId The room ID to for the given event.
     * @param {string} eventId The event ID to list reacations for.
     * @param {string?} relationType The type of reaction (e.g. `m.room.member`) to filter for. Optional.
     * @param {string?} eventType The type of event to look for (e.g. `m.room.member`). Optional.
     * @returns {Promise<{original_event: any, chunk: any[]}>} Resolves a object containing the original event, and a chunk of relations
     */
    public async getRelationsForEvent(roomId: string, eventId: string, relationType?: string, eventType?: string): Promise<{ original_event: any, chunk: any[] }> {
        let url = `/_matrix/client/unstable/rooms/${roomId}/relations/${eventId}`;
        if (relationType) {
            url += `/${relationType}`;
        }
        if (eventType) {
            url += `/${eventType}`;
        }
        return this.client.doRequest("GET", url);
    }

    /**
     * Get information about a media item. Implements MSC2380
     * @param {string} mxc The MXC to get information about.
     * @returns {Promise<MSC2380MediaInfo>} Resolves a object containing the media information.
     */
    public async getMediaInfo(mxcUrl: string): Promise<MSC2380MediaInfo> {
        if (!mxcUrl.toLowerCase().startsWith("mxc://")) {
            throw Error("'mxcUrl' does not begin with mxc://");
        }
        const [domain, mediaId] = mxcUrl.substr("mxc://".length).split("/");
        if (!domain || !mediaId) {
            throw Error('Missing domain');
        }
        if (!mediaId) {
            throw Error('Missing mediaId');
        }
        return this.client.doRequest("GET", `/_matrix/media/unstable/info/${encodeURIComponent(domain)}/${encodeURIComponent(mediaId)}`);
    }
}

import { MatrixClient } from "./MatrixClient";

/**
 * Represents a profile for a group
 * @category Unstable APIs
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
     * Creates a group.
     * @param {string} localpart The localpart for the group
     * @return {Promise<string>} Resolves to the created group ID.
     */
    public async createGroup(localpart: string): Promise<string> {
        const response = await this.client.doRequest("POST", "/_matrix/client/unstable/create_group", null, {"localpart": localpart});
        return response["group_id"];
    }

    /**
     * Invites a user to the group.
     * @param {string} groupId The group ID to invite the user to.
     * @param {string} userId The user ID to invite to the group.
     * @return {Promise<"join" | "invite" | "reject">} Resolves to the invite state for
     *  the user. This is normally "invite", but may be "join" or "reject" if the user's
     *  homeserver accepted/rejected the invite right away.
     */
    public async inviteUserToGroup(groupId: string, userId: string): Promise<"join" | "invite" | "reject"> {
        const response = await this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/users/invite/${encodeURIComponent(userId)}`, null, {});
        return response["state"];
    }

    /**
     * Kicks a user from a group.
     * @param {string} groupId The group ID to kick the user from.
     * @param {string} userId The user ID to kick from the group.
     * @return {Promise<*>} Resolves when completed.
     */
    public async kickUserFromGroup(groupId: string, userId: string): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/users/remove/${encodeURIComponent(userId)}`, null, {});
    }

    /**
     * Updates a group's profile
     * @param {string} groupId The group ID to update.
     * @param {GroupProfile} profile The profile to update the group with.
     * @return {Promise<*>} Resolves when completed.
     */
    public async setGroupProfile(groupId: string, profile: GroupProfile): Promise<any> {
        return this.client.doRequest("POST", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/profile`, null, profile);
    }

    /**
     * Sets a group's join policy to either be publicly joinable (open) or
     * require an invite (invite).
     * @param {string} groupId The group ID to set the policy for.
     * @param {"open" | "invite"} policy The policy to set.
     * @return {Promise<*>} Resolves when completed.
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
     * @return {Promise<*>} Resolves when completed.
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
     * @return {Promise<*>} Resolves when completed.
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
     * @return {Promise<*>} Resolves when completed.
     */
    public async removeRoomFromGroup(groupId: string, roomId: string): Promise<any> {
        return this.client.doRequest("DELETE", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/admin/rooms/${encodeURIComponent(roomId)}`);
    }

    /**
     * Gets a group's profile.
     * @param {string} groupId The group ID to fetch the profile of.
     * @return {Promise<GroupProfile>} Resolves to the profile of the group.
     */
    public async getGroupProfile(groupId: string): Promise<GroupProfile> {
        return this.client.doRequest("GET", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/profile`);
    }

    /**
     * Gets the users in a group.
     * @param {string} groupId The group ID of which to get the users.
     * @return {Promise<*[]>} Resolves to an array of all the users in the group.
     */
    public async getGroupUsers(groupId: string): Promise<any[]> {
        const response = await this.client.doRequest("GET", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/users`);
        return response["chunk"];
    }

    /**
     * Gets the invited users of a group.
     * @param {string} groupId The group ID of which to get the invited users.
     * @return {Promise<*[]>} Resolves to an array of all the users invited to the group.
     */
    public async getGroupInvitedUsers(groupId: string): Promise<any[]> {
        const response = await this.client.doRequest("GET", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/invited_users`);
        return response["chunk"];
    }

    /**
     * Gets the rooms of a group.
     * @param {string} groupId The group ID of which to get all the rooms.
     * @return {Promise<*[]>} Resolves to an array of all the rooms of the group.
     */
    public async getGroupRooms(groupId: string): Promise<any[]> {
        const response = await this.client.doRequest("GET", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/rooms`);
        return response["chunk"];
    }

    /**
     * Accepts an invite to a group.
     * @param {string} groupId The group ID of which to accept the invite of.
     * @return {Promise<*>} Resolves when completed.
     */
    public async acceptGroupInvite(groupId: string): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/accept_invite`, null, {});
    }

    /**
     * Joins a group.
     * @param {string} groupId The group ID to join.
     * @return {Promise<*>} Resolves when completed.
     */
    public async joinGroup(groupId: string): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/join`, null, {});
    }

    /**
     * Leaves a group.
     * @param {string} groupId The group ID of the group to leave.
     * @return {Promise<*>} Resolves when completed.
     */
    public async leaveGroup(groupId: string): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/leave`, null, {});
    }

    /**
     * Sets the publicity of a group.
     * @param {string} groupId The group ID to set the publicity of.
     * @param {boolean} publicise If the group should be publicised.
     * @return {Promise<*>} Resolves when completed.
     */
    public async setGroupPublicity(groupId: string, publicise: boolean): Promise<any> {
        return this.client.doRequest("PUT", `/_matrix/client/unstable/groups/${encodeURIComponent(groupId)}/self/update_publicity`, null, {
            publicise,
        });
    }

    /**
     * Gets all group IDs joined.
     * @return {Promise<string[]>} Resolves to the group IDs of the joined groups.
     */
    public async getJoinedGroups(): Promise<string[]> {
        const response = await this.client.doRequest("GET", "/_matrix/client/unstable/joined_groups");
        return response["groups"];
    }

    /**
     * Gets the group IDs that the specified user has publicised.
     * @param {string} userId The user ID to fetch the publicised groups of.
     * @return {Promise<string[]>} Resolves to the publicised group IDs of that user.
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
}

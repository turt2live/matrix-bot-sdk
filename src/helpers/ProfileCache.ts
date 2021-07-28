import * as LRU from "lru-cache";
import { extractRequestError, LogService, MatrixClient, MatrixProfile } from "..";
import { MembershipEvent } from "../models/events/MembershipEvent";
import { Appservice } from "../appservice/Appservice";

/**
 * Functions for avoiding calls to profile endpoints. Useful for bots when
 * people are mentioned often or bridges which need profile information
 * often.
 * @category Utilities
 */
export class ProfileCache {

    private cache: LRU;

    /**
     * Creates a new profile cache.
     * @param {number} maxEntries The maximum number of entries to cache.
     * @param {number} maxAgeMs The maximum age of an entry in milliseconds.
     * @param {MatrixClient} client The client to use to get profile updates.
     */
    constructor(maxEntries: number, maxAgeMs: number, private client: MatrixClient) {
        this.cache = new LRU({
            max: maxEntries,
            maxAge: maxAgeMs,
        });
    }

    private getCacheKey(userId: string, roomId: string | null): string {
        return `${userId}@${roomId || '<none>'}`;
    }

    /**
     * Watch for profile changes to cached entries with the provided client. The
     * same client will also be used to update the user's profile in the cache.
     * @param {MatrixClient} client The client to watch for profile changes with.
     */
    public watchWithClient(client: MatrixClient) {
        client.on("room.event", async (roomId: string, event: string) => {
            if (!event['state_key'] || !event['content'] || event['type'] !== 'm.room.member') return;
            await this.tryUpdateProfile(roomId, new MembershipEvent(event), client);
        });
    }

    /**
     * Watch for profile changes to cached entries with the provided application
     * service. The clientFn will be called to get the relevant client for any
     * updates. If the clientFn is null, the appservice's bot user will be used.
     * The clientFn takes two arguments: the user ID being updated and the room ID
     * they are being updated in (shouldn't be null). The return value should be the
     * MatrixClient to use, or null to use the appservice's bot client. The same
     * client will be used to update the user's general profile, if that profile
     * is cached.
     * @param {Appservice} appservice The application service to watch for profile changes with.
     * @param {Function} clientFn The function to use to acquire profile updates with. If null, the appservice's bot client will be used.
     */
    public watchWithAppservice(appservice: Appservice, clientFn: (userId: string, roomId: string) => MatrixClient = null) {
        if (!clientFn) clientFn = () => appservice.botClient;
        appservice.on("room.event", async (roomId: string, event: string) => {
            if (!event['state_key'] || !event['content'] || event['type'] !== 'm.room.member') return;

            const memberEvent = new MembershipEvent(event);
            let client = clientFn(memberEvent.membershipFor, roomId);
            if (!client) client = appservice.botClient;

            await this.tryUpdateProfile(roomId, memberEvent, client);
        });
    }

    /**
     * Gets a profile for a user in optional room.
     * @param {string} userId The user ID to get a profile for.
     * @param {string|null} roomId Optional room ID to get a per-room profile for the user.
     * @returns {Promise<MatrixProfile>} Resolves to the user's profile.
     */
    public async getUserProfile(userId: string, roomId: string = null): Promise<MatrixProfile> {
        const cacheKey = this.getCacheKey(userId, roomId);
        const cached = this.cache.get(cacheKey);
        if (cached) return Promise.resolve(<MatrixProfile>cached);

        const profile = await this.getUserProfileWith(userId, roomId, this.client);
        this.cache.set(cacheKey, profile);
        return profile;
    }

    private async getUserProfileWith(userId: string, roomId: string, client: MatrixClient): Promise<MatrixProfile> {
        try {
            if (roomId) {
                const membership = await client.getRoomStateEvent(roomId, "m.room.member", userId);
                return new MatrixProfile(userId, membership);
            } else {
                const profile = await client.getUserProfile(userId);
                return new MatrixProfile(userId, profile);
            }
        } catch (e) {
            LogService.warn("ProfileCache", "Non-fatal error getting user profile. They might not exist.");
            LogService.warn("ProfileCache", extractRequestError(e));
            return new MatrixProfile(userId, {});
        }
    }

    private async tryUpdateProfile(roomId: string, memberEvent: MembershipEvent, client: MatrixClient) {
        const roomCacheKey = this.getCacheKey(memberEvent.membershipFor, roomId);
        const generalCacheKey = this.getCacheKey(memberEvent.membershipFor, null);

        if (this.cache.has(roomCacheKey)) {
            this.cache.set(roomCacheKey, new MatrixProfile(memberEvent.membershipFor, memberEvent.content));
        }

        // TODO: Try and figure out semantics for this updating.
        // Large accounts could cause hammering on the profile endpoint, but hopefully it is cached by the server.
        if (this.cache.has(generalCacheKey)) {
            const profile = await this.getUserProfileWith(memberEvent.membershipFor, null, client);
            this.cache.set(generalCacheKey, profile);
        }
    }
}

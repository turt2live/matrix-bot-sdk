/**
 * The parts of a permalink.
 * @see Permalinks
 * @category Utilities
 */
export interface PermalinkParts {
    /**
     * The room ID or alias the permalink references. May be null.
     */
    roomIdOrAlias: string;

    /**
     * The user ID the permalink references. May be null.
     */
    userId: string;

    /**
     * The event ID the permalink references. May be null.
     */
    eventId: string;

    /**
     * The servers the permalink is routed through. May be null or empty.
     */
    viaServers: string[];
}

/**
 * Functions for handling permalinks
 * @category Utilities
 */
export class Permalinks {
    private constructor() {
    }

    // TODO: Encode permalinks

    private static encodeViaArgs(servers: string[]): string {
        if (!servers || !servers.length) return "";

        return `?via=${servers.join("via=")}`;
    }

    /**
     * Creates a room permalink.
     * @param {string} roomIdOrAlias The room ID or alias to create a permalink for.
     * @param {string[]} viaServers The servers to route the permalink through.
     * @returns {string} A room permalink.
     */
    public static forRoom(roomIdOrAlias: string, viaServers: string[] = []): string {
        return `https://matrix.to/#/${roomIdOrAlias}${Permalinks.encodeViaArgs(viaServers)}`;
    }

    /**
     * Creates a user permalink.
     * @param {string} userId The user ID to create a permalink for.
     * @returns {string} A user permalink.
     */
    public static forUser(userId: string): string {
        return `https://matrix.to/#/${userId}`;
    }

    /**
     * Creates an event permalink.
     * @param {string} roomIdOrAlias The room ID or alias to create a permalink in.
     * @param {string} eventId The event ID to reference in the permalink.
     * @param {string[]} viaServers The servers to route the permalink through.
     * @returns {string} An event permalink.
     */
    public static forEvent(roomIdOrAlias: string, eventId: string, viaServers: string[] = []): string {
        return `https://matrix.to/#/${roomIdOrAlias}/${eventId}${Permalinks.encodeViaArgs(viaServers)}`;
    }

    /**
     * Parses a permalink URL into usable parts.
     * @param {string} matrixTo The matrix.to URL to parse.
     * @returns {PermalinkParts} The parts of the permalink.
     */
    public static parseUrl(matrixTo: string): PermalinkParts {
        if (!matrixTo || !matrixTo.startsWith("https://matrix.to/#/")) {
            throw new Error("Not a valid matrix.to URL");
        }

        const parts = matrixTo.substring("https://matrix.to/#/".length).split("/");

        const entity = decodeURIComponent(parts[0]);
        if (entity[0] === '@') {
            return {userId: entity, roomIdOrAlias: undefined, eventId: undefined, viaServers: undefined};
        } else if (entity[0] === '#' || entity[0] === '!') {
            if (parts.length === 1) {
                return {roomIdOrAlias: entity, userId: undefined, eventId: undefined, viaServers: []};
            }

            // rejoin the rest because v3 room can have slashes
            const eventIdAndQuery = decodeURIComponent(parts.length > 1 ? parts.slice(1).join('/') : "");
            const secondaryParts = eventIdAndQuery.split('?');

            const eventId = secondaryParts[0];
            const query = secondaryParts.length > 1 ? secondaryParts[1] : "";

            const via = query.split("via=").filter(p => !!p);

            return {roomIdOrAlias: entity, eventId: eventId, viaServers: via, userId: undefined};
        }

        throw new Error("Unexpected entity");
    }
}

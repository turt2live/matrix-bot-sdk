export interface PermalinkParts {
    roomIdOrAlias: string;
    userId: string;
    eventId: string;
    viaServers: string[];
}

export class Permalinks {
    private constructor() {
    }

    // TODO: Encode permalinks

    private static encodeViaArgs(servers: string[]): string {
        if (!servers || !servers.length) return "";

        return `?via=${servers.join("via=")}`;
    }


    public static forRoom(roomIdOrAlias: string, viaServers: string[] = []): string {
        return `https://matrix.to/#/${roomIdOrAlias}${Permalinks.encodeViaArgs(viaServers)}`;
    }

    public static forUser(userId: string): string {
        return `https://matrix.to/#/${userId}`;
    }

    public static forEvent(roomIdOrAlias: string, eventId: string, viaServers: string[] = []): string {
        return `https://matrix.to/#/${roomIdOrAlias}/${eventId}${Permalinks.encodeViaArgs(viaServers)}`;
    }

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

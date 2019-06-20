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
}
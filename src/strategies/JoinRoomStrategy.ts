import { extractRequestError, LogService } from "..";

export interface IJoinRoomStrategy {
    joinRoom(roomIdOrAlias: string, userId: string, apiCall: (roomIdOrAlias: string) => Promise<string>): Promise<string>;
}

/**
 * A join strategy that keeps trying to join the room on a set interval.
 * @category Join strategies
 */
export class SimpleRetryJoinStrategy implements IJoinRoomStrategy {

    // Note: The schedule must not have duplicate values to avoid problems in positioning.
    private schedule = [
        0,              // Right away
        1000,           // 1 second
        30 * 1000,      // 30 seconds
        5 * 60 * 1000,  // 5 minutes
        15 * 60 * 1000, // 15 minutes
    ];

    public joinRoom(roomIdOrAlias: string, userId: string, apiCall: (roomIdOrAlias: string) => Promise<string>): Promise<string> {
        let currentSchedule = this.schedule[0];

        const doJoin = () => waitPromise(currentSchedule).then(() => apiCall(roomIdOrAlias));
        const errorHandler = err => {
            LogService.error("SimpleRetryJoinStrategy", extractRequestError(err));
            const idx = this.schedule.indexOf(currentSchedule);
            if (idx === this.schedule.length - 1) {
                LogService.warn("SimpleRetryJoinStrategy", "Failed to join room " + roomIdOrAlias);
                return Promise.reject(err);
            } else {
                currentSchedule = this.schedule[idx + 1];
                return doJoin().catch(errorHandler);
            }
        };

        return doJoin().catch(errorHandler);
    }
}

function waitPromise(interval: number): Promise<any> {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, interval);
    });
}

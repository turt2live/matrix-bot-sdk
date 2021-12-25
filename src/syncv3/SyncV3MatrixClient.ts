import { MatrixClient } from "../MatrixClient";
import * as crypto from "crypto";
import { extractRequestError, LogService } from "../logging/LogService";
import { IStorageProvider } from "../storage/IStorageProvider";
import { List, ListBehaviour } from "./List";
import { SyncV3Response } from "./models";
import { Operation } from "./operations";

/**
 * A MatrixClient class which attempts to use Sync V3 instead of the normal sync protocol
 * on the server.
 *
 * This class is considered <b>UNSTABLE</b> and may be removed at any time. This class will
 * not check for server support before attempting to use it.
 *
 * @category Unstable: Sync V3
 */
export class SyncV3MatrixClient extends MatrixClient {
    private syncSessionId: string;
    private lists = [
        new List(0, this, ListBehaviour.General),
        new List(1, this, ListBehaviour.Invites),
    ];

    /**
     Creates a new matrix client
     @param {string} homeserverUrl The homeserver's client-server API URL
     @param {string} accessToken The access token for the homeserver
     @param {IStorageProvider} storage The storage provider to use.
     */
    public constructor(homeserverUrl: string, accessToken: string, storage: IStorageProvider) {
        super(homeserverUrl, accessToken, storage);
    }

    protected async startSyncInternal(): Promise<any> {
        this.syncSessionId = await this.storageProvider.readValue("sync_v3_session");
        if (!this.syncSessionId) {
            this.syncSessionId = crypto.randomBytes(16).toString('hex');
            await this.storageProvider.storeValue("sync_v3_session", this.syncSessionId);
        }
        this.loopSync();
    }

    private loopSync() {
        const promiseWhile = async () => {
            if (this.stopSyncing) {
                LogService.info("MatrixClientLite", "Client stop requested - stopping sync");
                return;
            }

            try {
                const response = await this.doSyncV3();
                await this.processSyncV3(response);
            } catch (e) {
                LogService.error("MatrixClientLite", "Error handling sync " + extractRequestError(e));
                const backoffTime = 5000 + Math.random() * (15000 - 5000); // TODO: de-hardcode values. SYNC_BACKOFF_MIN_MS SYNC_BACKOFF_MAX_MS
                LogService.info("MatrixClientLite", `Backing off for ${backoffTime}ms`);
                await new Promise((r) => setTimeout(r, backoffTime));
            }

            return promiseWhile();
        };

        promiseWhile(); // start loop async
    }

    private async processSyncV3(sync: SyncV3Response): Promise<void> {
        for (const op of sync.ops) {
            const list = this.lists[op.list];
            switch(op.op) {
                case Operation.Sync:
                    await list.handleSyncOp(op);
                    break;
                case Operation.Update:
                    await list.handleUpdateOp(op);
                    break;
                case Operation.Insert:
                    await list.handleInsertOp(op);
                    break;
                case Operation.Delete:
                    await list.handleDeleteOp(op);
                    break;
                default:
                    LogService.warn("SyncV3MatrixClient", "Unhandled operation: ", op);
                    break;
            }
        }
    }

    private async doSyncV3(): Promise<SyncV3Response> {
        return this.doRequest("POST", "/_matrix/client/unstable/org.matrix.msc3575/sync", {}, {
            session_id: this.syncSessionId,
            lists: [{
                // First list: default catch-all for everything.

                // We want all rooms
                // rooms: [[0, Number.MAX_SAFE_INTEGER]],
                rooms: [[0, 100]], // For testing purposes, reduce window size (otherwise OOM)

                // We don't care about sort
                //sort: ["by_notification_count"],

                // We don't have any required state, so tell the server that
                // required_state: [
                //     ["m.room.member", await this.getUserId()],
                // ], // [["event type", "state key"]]
                //
                // // We don't want any previous timeline state to avoid confusing bots
                // // timeline_limit: 0,
                // timeline_limit: 20,
            }, {
                // Second list: invites only

                // rooms: [[0, Number.MAX_SAFE_INTEGER]],
                rooms: [[0, 100]], // For testing purposes, reduce window size (otherwise OOM)

                // required_state: [
                //     ["m.room.member", await this.getUserId()],
                // ], // [["event type", "state key"]]
                // timeline_limit: 20,

                filters: {
                    is_invite: true,
                },
                priority: 1,
            }],

            // TODO: Support extensions for crypto and such
        });
    }
}

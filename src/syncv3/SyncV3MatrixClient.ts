import { MatrixClient } from "../MatrixClient";
import { extractRequestError, LogService } from "../logging/LogService";
import { IStorageProvider } from "../storage/IStorageProvider";
import { SyncV3Response } from "./models";
import { IV3List, ListBehaviour, SortBehaviour, V3List } from "./V3List";

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
    private lastPos: string;
    private lists: V3List[] = [];

    /**
     * Creates a new matrix client
     * @param {string} homeserverUrl The homeserver's client-server API URL
     * @param {string} accessToken The access token for the homeserver
     * @param {IStorageProvider} storage The storage provider to use.
     * @param {SortBehaviour[]} sortBehaviours The list sorting behaviour to use.
     */
    public constructor(homeserverUrl: string, accessToken: string, storage: IStorageProvider, sortBehaviours: SortBehaviour[] = [SortBehaviour.Name]) {
        super(homeserverUrl, accessToken, storage);

        this.lists = [
            new V3List(ListBehaviour.JoinedOnly, sortBehaviours),
            new V3List(ListBehaviour.InvitedOnly, sortBehaviours),
            new V3List(ListBehaviour.DMsOnly, sortBehaviours),
        ];
    }

    public get joinedList(): IV3List {
        return this.lists[0];
    }

    public get invitedList(): IV3List {
        return this.lists[1];
    }

    public get directMessagesList(): IV3List {
        return this.lists[2];
    }

    protected async startSyncInternal(): Promise<any> {
        this.lastPos = await this.storageProvider.getSyncToken();
        for (let i = 0; i < this.lists.length; i++) {
            const value = JSON.parse((await this.storageProvider.readValue(`sync_v3_list_${i}`)) || "{}");
            await this.lists[i].processOperations(this, value.count ?? 0, value.ops ?? []);
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
                this.lastPos = response.pos;
                await this.storageProvider.setSyncToken(this.lastPos);
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
        for (let i = 0; i < this.lists.length; i++) {
            const ops = sync.ops.filter(o => o.list === i);
            await this.lists[i].processOperations(this, sync.counts[i], ops);
            await this.storageProvider.storeValue(`sync_v3_list_${i}`, JSON.stringify({
                ops: this.lists[i].lossySerialized,
                count: this.lists[i].totalRoomCount,
            }));
        }
    }

    private async doSyncV3(): Promise<SyncV3Response> {
        const userId = await this.getUserId();
        const qs = {};
        if (this.lastPos) qs['pos'] = this.lastPos;
        return this.doRequest("POST", "/_matrix/client/unstable/org.matrix.msc3575/sync", qs, {
            lists: this.lists.map(l => l.getDefinitionFor(userId)),

            // TODO: Support extensions for crypto and such
        });
    }
}

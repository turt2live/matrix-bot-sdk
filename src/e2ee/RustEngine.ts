import {
    EncryptionSettings,
    KeysClaimRequest,
    OlmMachine,
    RequestType,
    RoomId,
    UserId,
    EncryptionAlgorithm as RustEncryptionAlgorithm,
    HistoryVisibility,
    KeysUploadRequest,
    KeysQueryRequest,
    ToDeviceRequest,
    KeysBackupRequest,
} from "@matrix-org/matrix-sdk-crypto-nodejs";
import * as AsyncLock from "async-lock";

import { MatrixClient } from "../MatrixClient";
import { extractRequestError, LogService } from "../logging/LogService";
import { ICryptoRoomInformation } from "./ICryptoRoomInformation";
import { EncryptionAlgorithm } from "../models/Crypto";
import { EncryptionEvent } from "../models/events/EncryptionEvent";
import { ICurve25519AuthData, IKeyBackupInfoRetrieved, IMegolmSessionDataExport, KeyBackupEncryptionAlgorithm, KeyBackupVersion } from "../models/KeyBackup";
import { Membership } from "../models/events/MembershipEvent";

/**
 * @internal
 */
export const SYNC_LOCK_NAME = "sync";

/**
 * @internal
 */
export class RustEngine {
    public readonly lock = new AsyncLock();

    public readonly trackedUsersToAdd = new Set<string>();
    public addTrackedUsersPromise: Promise<void>|undefined;

    private keyBackupVersion: KeyBackupVersion|undefined;
    private keyBackupWaiter = Promise.resolve();

    private backupEnabled = false;
    public isBackupEnabled() {
        return this.backupEnabled;
    }

    public constructor(public readonly machine: OlmMachine, private client: MatrixClient) {
    }

    public async run() {
        await this.runOnly(); // run everything, but with syntactic sugar
    }

    private async runOnly(...types: RequestType[]) {
        // Note: we should not be running this until it runs out, so cache the value into a variable
        const requests = await this.machine.outgoingRequests();
        for (const request of requests) {
            if (types.length && !types.includes(request.type)) continue;
            switch (request.type) {
                case RequestType.KeysUpload:
                    await this.processKeysUploadRequest(request);
                    break;
                case RequestType.KeysQuery:
                    await this.processKeysQueryRequest(request);
                    break;
                case RequestType.KeysClaim:
                    await this.processKeysClaimRequest(request);
                    break;
                case RequestType.ToDevice:
                    await this.processToDeviceRequest(request as ToDeviceRequest);
                    break;
                case RequestType.RoomMessage:
                    throw new Error("Bindings error: Sending room messages is not supported");
                case RequestType.SignatureUpload:
                    throw new Error("Bindings error: Backup feature not possible");
                case RequestType.KeysBackup:
                    await this.processKeysBackupRequest(request);
                    break;
                default:
                    throw new Error("Bindings error: Unrecognized request type: " + request.type);
            }
        }
    }

    public async addTrackedUsers(userIds: string[]) {
        // Add the new set of users to the pool
        userIds.forEach(uId => this.trackedUsersToAdd.add(uId));
        if (this.addTrackedUsersPromise) {
            // If we have a pending promise, don't create another lock requirement.
            return;
        }
        return this.addTrackedUsersPromise = this.lock.acquire(SYNC_LOCK_NAME, async () => {
            // Immediately clear this promise so that a new promise is queued up.
            this.addTrackedUsersPromise = undefined;
            const uids = new Array<UserId>(this.trackedUsersToAdd.size);
            let idx = 0;
            for (const u of this.trackedUsersToAdd.values()) {
                uids[idx++] = new UserId(u);
            }
            // Clear the existing pool
            this.trackedUsersToAdd.clear();
            await this.machine.updateTrackedUsers(uids);

            const keysClaim = await this.machine.getMissingSessions(uids);
            if (keysClaim) {
                await this.processKeysClaimRequest(keysClaim);
            }
        });
    }

    public async prepareEncrypt(roomId: string, roomInfo: ICryptoRoomInformation) {
        let memberships: Membership[] = ["join", "invite"];
        let historyVis = HistoryVisibility.Joined;
        switch (roomInfo.historyVisibility) {
            case "world_readable":
                historyVis = HistoryVisibility.WorldReadable;
                break;
            case "invited":
                historyVis = HistoryVisibility.Invited;
                break;
            case "shared":
                historyVis = HistoryVisibility.Shared;
                break;
            case "joined":
            default:
                memberships = ["join"];
        }

        const members = new Set<UserId>();
        for (const membership of memberships) {
            try {
                (await this.client.getRoomMembersByMembership(roomId, membership))
                    .map(u => new UserId(u.membershipFor))
                    .forEach(u => void members.add(u));
            } catch (err) {
                LogService.warn("RustEngine", `Failed to get room members for membership type "${membership}" in ${roomId}`, extractRequestError(err));
            }
        }
        if (members.size === 0) {
            return;
        }
        const membersArray = Array.from(members);

        const encEv = new EncryptionEvent({
            type: "m.room.encryption",
            content: roomInfo,
        });

        const settings = new EncryptionSettings();
        settings.algorithm = roomInfo.algorithm === EncryptionAlgorithm.MegolmV1AesSha2
            ? RustEncryptionAlgorithm.MegolmV1AesSha2
            : undefined;
        settings.historyVisibility = historyVis;
        settings.rotationPeriod = BigInt(encEv.rotationPeriodMs);
        settings.rotationPeriodMessages = BigInt(encEv.rotationPeriodMessages);

        await this.lock.acquire(SYNC_LOCK_NAME, async () => {
            await this.machine.updateTrackedUsers(membersArray); // just in case we missed some
            await this.runOnly(RequestType.KeysQuery);
            const keysClaim = await this.machine.getMissingSessions(membersArray);
            if (keysClaim) {
                await this.processKeysClaimRequest(keysClaim);
            }
        });

        await this.lock.acquire(roomId, async () => {
            const requests = await this.machine.shareRoomKey(new RoomId(roomId), membersArray, settings);
            for (const req of requests) {
                await this.processToDeviceRequest(req);
            }
            // Back up keys asynchronously
            void this.backupRoomKeysIfEnabled();
        });
    }

    public enableKeyBackup(info: IKeyBackupInfoRetrieved): Promise<void> {
        this.keyBackupWaiter = this.keyBackupWaiter.then(async () => {
            if (this.backupEnabled) {
                // Finish any pending backups before changing the backup version/pubkey
                await this.actuallyDisableKeyBackup();
            }
            let publicKey: string;
            switch (info.algorithm) {
                case KeyBackupEncryptionAlgorithm.MegolmBackupV1Curve25519AesSha2:
                    publicKey = (info.auth_data as ICurve25519AuthData).public_key;
                    break;
                default:
                    throw new Error("Key backup error: cannot enable backups with unsupported backup algorithm " + info.algorithm);
            }
            await this.machine.enableBackupV1(publicKey, info.version);
            this.keyBackupVersion = info.version;
            this.backupEnabled = true;
        });
        return this.keyBackupWaiter;
    }

    public disableKeyBackup(): Promise<void> {
        this.keyBackupWaiter = this.keyBackupWaiter.then(async () => {
            await this.actuallyDisableKeyBackup();
        });
        return this.keyBackupWaiter;
    }

    private async actuallyDisableKeyBackup(): Promise<void> {
        await this.machine.disableBackup();
        this.keyBackupVersion = undefined;
        this.backupEnabled = false;
    }

    public backupRoomKeys(): Promise<void> {
        this.keyBackupWaiter = this.keyBackupWaiter.then(async () => {
            if (!this.backupEnabled) {
                throw new Error("Key backup error: attempted to create a backup before having enabled backups");
            }
            await this.actuallyBackupRoomKeys();
        });
        return this.keyBackupWaiter;
    }

    public async exportRoomKeysForSession(roomId: string, sessionId: string): Promise<IMegolmSessionDataExport[]> {
        return JSON.parse(await this.machine.exportRoomKeysForSession(roomId, sessionId)) as IMegolmSessionDataExport[];
    }

    private backupRoomKeysIfEnabled(): Promise<void> {
        this.keyBackupWaiter = this.keyBackupWaiter.then(async () => {
            if (this.backupEnabled) {
                await this.actuallyBackupRoomKeys();
            }
        });
        return this.keyBackupWaiter;
    }

    private async actuallyBackupRoomKeys(): Promise<void> {
        const request = await this.machine.backupRoomKeys();
        if (request) {
            await this.processKeysBackupRequest(request);
        }
    }

    private async processKeysClaimRequest(request: KeysClaimRequest) {
        const resp = await this.client.doRequest("POST", "/_matrix/client/v3/keys/claim", null, JSON.parse(request.body));
        await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(resp));
    }

    private async processKeysUploadRequest(request: KeysUploadRequest) {
        const body = JSON.parse(request.body);
        // delete body["one_time_keys"]; // use this to test MSC3983
        const resp = await this.client.doRequest("POST", "/_matrix/client/v3/keys/upload", null, body);
        await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(resp));
    }

    private async processKeysQueryRequest(request: KeysQueryRequest) {
        const resp = await this.client.doRequest("POST", "/_matrix/client/v3/keys/query", null, JSON.parse(request.body));
        await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(resp));
    }

    private async processToDeviceRequest(request: ToDeviceRequest) {
        const resp = await this.client.sendToDevices(request.eventType, JSON.parse(request.body).messages);
        await this.machine.markRequestAsSent(request.txnId, RequestType.ToDevice, JSON.stringify(resp));
    }

    private async processKeysBackupRequest(request: KeysBackupRequest) {
        let resp: Awaited<ReturnType<MatrixClient["doRequest"]>>;
        try {
            if (!this.keyBackupVersion) {
                throw new Error("Key backup version missing");
            }
            resp = await this.client.doRequest("PUT", "/_matrix/client/v3/room_keys/keys", { version: this.keyBackupVersion }, JSON.parse(request.body));
        } catch (e) {
            this.client.emit("crypto.failed_backup", e);
            return;
        }
        await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(resp));
    }
}

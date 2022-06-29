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
} from "@matrix-org/matrix-sdk-crypto";
import { MatrixClient } from "../MatrixClient";
import { ICryptoRoomInformation } from "./ICryptoRoomInformation";
import { EncryptionAlgorithm } from "../models/Crypto";
import { EncryptionEvent } from "../models/events/EncryptionEvent";

/**
 * @internal
 */
export class RustEngine {
    public constructor(public readonly machine: OlmMachine, private client: MatrixClient) {
    }

    public async run() {
        const requests = await this.machine.outgoingRequests();
        for (const request of requests) {
            switch(request.type) {
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
                    await this.processToDeviceRequest(request);
                    break;
                case RequestType.RoomMessage:
                    throw new Error("Bindings error: Sending room messages is not supported");
                case RequestType.SignatureUpload:
                    throw new Error("Bindings error: Backup feature not possible");
                case RequestType.KeysBackup:
                    throw new Error("Bindings error: Backup feature not possible");
                default:
                    throw new Error("Bindings error: Unrecognized request type: " + request.type);
            }
        }
    }

    public async prepareEncrypt(roomId: string, roomInfo: ICryptoRoomInformation) {
        // TODO: Handle pre-shared invite keys too
        const members = (await this.client.getJoinedRoomMembers(roomId)).map(u => new UserId(u));
        await this.machine.updateTrackedUsers(members);

        const keysClaim = await this.machine.getMissingSessions(members);
        if (keysClaim) {
            await this.processKeysClaimRequest(keysClaim);
        }

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
            // Default and other cases handled by assignment before switch
        }

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

        // Note: we don't use the toDevice message requests returned by shareRoomKey() because they show up
        // in the pending requests for the machine, which means we can mark them as "sent" properly. This
        // way we avoid sending room keys twice.
        const messages = JSON.parse(await this.machine.shareRoomKey(new RoomId(roomId), members, settings));
        for (const msg of messages) {
            const resp = await this.client.sendToDevices(msg.event_type, msg.messages);
        }
        await this.run();
    }

    private async processKeysClaimRequest(request: KeysClaimRequest) {
        const resp = await this.client.doRequest("POST", "/_matrix/client/v3/keys/claim", null, JSON.parse(request.body));
        await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(resp));
    }

    private async processKeysUploadRequest(request: KeysUploadRequest) {
        const resp = await this.client.doRequest("POST", "/_matrix/client/v3/keys/upload", null, JSON.parse(request.body));
        await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(resp));
    }

    private async processKeysQueryRequest(request: KeysQueryRequest) {
        const resp = await this.client.doRequest("POST", "/_matrix/client/v3/keys/query", null, JSON.parse(request.body));
        await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(resp));
    }

    private async processToDeviceRequest(request: ToDeviceRequest) {
        const req = JSON.parse(request.body);
        const resp = await this.client.sendToDevices(req.event_type, req.messages);
        await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(resp));
    }
}

import {
    DeviceKeys,
    GenericKeys,
    KeyClaim,
    KeyClaimResponse,
    KeyQueryResults,
    OlmEngine,
    OTKCounts,
    ToDeviceMessages,
} from "@turt2live/matrix-sdk-crypto-nodejs";
import { MatrixClient } from "../MatrixClient";
import { OTKAlgorithm } from "../models/Crypto";

/**
 * A representation of a rust-sdk OlmEngine for the bot-sdk. You should not need to
 * instantiate this yourself.
 * @category Encryption
 */
export class SdkOlmEngine implements OlmEngine {
    public constructor(private client: MatrixClient) {
    }

    public claimOneTimeKeys(claim: KeyClaim): Promise<KeyClaimResponse> {
        const reconstructed: Record<string, Record<string, OTKAlgorithm>> = {};
        for (const userId of Object.keys(claim)) {
            if (!reconstructed[userId]) reconstructed[userId] = {};

            for (const deviceId of Object.keys(claim[userId])) {
                reconstructed[userId][deviceId] = claim[userId][deviceId] as OTKAlgorithm;
            }
        }
        return this.client.claimOneTimeKeys(reconstructed);
    }

    public queryOneTimeKeys(userIds: string[]): Promise<KeyQueryResults> {
        return this.client.getUserDevices(userIds);
    }

    public uploadOneTimeKeys(body: {device_keys?: DeviceKeys, one_time_keys?: GenericKeys}): Promise<OTKCounts> {
        return this.client.doRequest("POST", "/_matrix/client/r0/keys/upload", null, body);
    }

    public getEffectiveJoinedUsersInRoom(roomId: string): Promise<string[]> {
        // TODO: Handle pre-shared invite keys too
        return this.client.getJoinedRoomMembers(roomId);
    }

    public sendToDevices(eventType: string, messages: ToDeviceMessages): Promise<void> {
        return this.client.sendToDevices(eventType, messages);
    }
}

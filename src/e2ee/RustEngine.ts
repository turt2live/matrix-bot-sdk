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
    SignatureUploadRequest,
    KeysBackupRequest,
} from "@matrix-org/matrix-sdk-crypto-nodejs";
import * as AsyncLock from "async-lock";

import { MatrixClient } from "../MatrixClient";
import { ICryptoRoomInformation } from "./ICryptoRoomInformation";
import { EncryptionAlgorithm } from "../models/Crypto";
import { EncryptionEvent } from "../models/events/EncryptionEvent";

/**
 * @internal
 */
export const SYNC_LOCK_NAME = "sync";

/**
 * Callback invoked to satisfy a User-Interactive Authentication (UIA) challenge
 * when uploading cross-signing keys. Given the `flows`/`params`/`session` from a
 * 401 response, it must return the `auth` dict to retry with (e.g. an
 * `m.login.password` stage), or `null` to give up. May be called more than once
 * if the server requires multiple stages.
 *
 * @category Encryption
 */
export type UIACallback = (uia: {
    flows: { stages: string[] }[];
    params?: Record<string, unknown>;
    session?: string;
}) => Promise<Record<string, unknown> | null>;

/**
 * The shape of `OlmMachine.bootstrapCrossSigning()`'s return value on
 * matrix-sdk-crypto-nodejs >= 0.5.0. Older bindings (<= 0.4.0) return `void`
 * and provide no way to retrieve these requests, so cross-signing cannot be
 * published with them — `bootstrapCrossSigning()` below detects that and reports
 * it rather than silently doing nothing.
 *
 * @internal
 */
interface CrossSigningBootstrapRequestsLike {
    /** Device-keys upload; may be absent if device keys were already uploaded. */
    uploadKeysReq?: KeysUploadRequest;
    /**
     * JSON-encoded body for `POST /keys/device_signing/upload`. No request id —
     * `markRequestAsSent` is NOT called for it; uploading requires UIA.
     */
    uploadSigningKeysReq: string;
    /** The cross-signing signatures upload (signs our own device). */
    uploadSignaturesReq: SignatureUploadRequest;
}

/**
 * @internal
 */
export class RustEngine {
    public readonly lock = new AsyncLock();

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
                    await this.processSignatureUploadRequest(request as SignatureUploadRequest);
                    break;
                case RequestType.KeysBackup:
                    await this.processKeysBackupRequest(request as KeysBackupRequest);
                    break;
                default:
                    throw new Error("Bindings error: Unrecognized request type: " + request.type);
            }
        }
    }

    public async addTrackedUsers(userIds: string[]) {
        await this.lock.acquire(SYNC_LOCK_NAME, async () => {
            const uids = userIds.map(u => new UserId(u));
            await this.machine.updateTrackedUsers(uids);

            const keysClaim = await this.machine.getMissingSessions(uids);
            if (keysClaim) {
                await this.processKeysClaimRequest(keysClaim);
            }
        });
    }

    public async prepareEncrypt(roomId: string, roomInfo: ICryptoRoomInformation) {
        // TODO: Handle pre-shared invite keys too
        const members = (await this.client.getJoinedRoomMembers(roomId)).map(u => new UserId(u));

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

        await this.lock.acquire(SYNC_LOCK_NAME, async () => {
            await this.machine.updateTrackedUsers(members); // just in case we missed some
            await this.runOnly(RequestType.KeysQuery);
            const keysClaim = await this.machine.getMissingSessions(members);
            if (keysClaim) {
                await this.processKeysClaimRequest(keysClaim);
            }
        });

        await this.lock.acquire(roomId, async () => {
            const requests = await this.machine.shareRoomKey(new RoomId(roomId), members, settings);
            for (const req of requests) {
                await this.actuallyProcessToDeviceRequest(req.txnId, req.eventType, JSON.parse(req.body)["messages"]);
            }
        });
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
        const req = JSON.parse(request.body);
        await this.actuallyProcessToDeviceRequest(req.txn_id, req.event_type, req.messages);
    }

    private async actuallyProcessToDeviceRequest(id: string, type: string, messages: Record<string, Record<string, unknown>>) {
        const resp = await this.client.sendToDevices(type, messages);
        await this.machine.markRequestAsSent(id, RequestType.ToDevice, JSON.stringify(resp));
    }

    private async processSignatureUploadRequest(request: SignatureUploadRequest) {
        // The binding serializes the body as { "signed_keys": {<user_id>: {...}} },
        // but POST /keys/signatures/upload expects that inner map directly (its
        // top-level keys are user IDs). Unwrap the `signed_keys` envelope —
        // otherwise the server rejects "signed_keys" as a user id (M_INVALID_PARAM)
        // and the failure response breaks markRequestAsSent's deserialization.
        const parsed = JSON.parse(request.body);
        const httpBody = parsed && parsed.signed_keys ? parsed.signed_keys : parsed;
        const resp = await this.client.doRequest(
            "POST", "/_matrix/client/v3/keys/signatures/upload", null, httpBody,
        );
        // The bootstrap-driven signature request carries no request id; only
        // mark queue-driven requests as sent.
        if (request.id) {
            await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(resp));
        }
    }

    private async processKeysBackupRequest(request: KeysBackupRequest) {
        // Backing up room keys requires an existing server-side backup version
        // to write into. The version is created out-of-band by
        // `enableKeyBackup()`; here we just write the encrypted room keys to the
        // active version. If no backup version exists the server returns
        // M_NOT_FOUND — we surface that rather than silently dropping keys.
        const version = await this.activeKeyBackupVersion();
        if (!version) {
            throw new Error(
                "Bindings error: a KeysBackup request was produced but no server-side backup version " +
                "exists. Call enableKeyBackup() to create/activate one before backing up room keys.",
            );
        }
        const resp = await this.client.doRequest(
            "PUT", "/_matrix/client/v3/room_keys/keys", { version }, JSON.parse(request.body),
        );
        await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(resp));
    }

    /** The currently-active server-side key-backup version, or null if none. */
    private async activeKeyBackupVersion(): Promise<string | null> {
        try {
            const resp = await this.client.doRequest("GET", "/_matrix/client/v3/room_keys/version");
            return resp?.version ?? null;
        } catch (e) {
            // M_NOT_FOUND => no backup exists yet.
            return null;
        }
    }

    /**
     * Publish a cross-signing identity for this account so the device becomes
     * cross-signed (self-verified). This is the piece matrix-bot-sdk historically
     * could not drive: `runOnly` threw on the request types it produces, and the
     * cross-signing public-key upload is not an outgoing-queue request at all —
     * it is returned by `OlmMachine.bootstrapCrossSigning()`.
     *
     * Flow:
     *   1. `machine.bootstrapCrossSigning(reset)` creates the identity locally
     *      and (on matrix-sdk-crypto-nodejs >= 0.5.0) returns the three upload
     *      requests.
     *   2. Upload device keys (`uploadKeysReq`) if present.
     *   3. POST the cross-signing public keys to `/keys/device_signing/upload`,
     *      completing the User-Interactive Auth challenge via `uiaCallback`.
     *   4. POST the self-signature to `/keys/signatures/upload`.
     *
     * On bindings <= 0.4.0, `bootstrapCrossSigning` returns `void` and gives no
     * way to retrieve the upload requests, so this method throws a clear,
     * actionable error (callers are expected to treat that as non-fatal).
     *
     * @param uiaCallback Resolves the UIA challenge for the device-signing upload.
     * @param reset Pass `false` (default) to reuse an existing local identity;
     *              the same request can be re-sent across UIA stages. `true`
     *              wipes any existing identity and resets device trust.
     */
    public async bootstrapCrossSigning(uiaCallback: UIACallback, reset = false): Promise<void> {
        await this.lock.acquire(SYNC_LOCK_NAME, async () => {
            const requests = (await this.machine.bootstrapCrossSigning(reset)) as
                unknown as CrossSigningBootstrapRequestsLike | undefined;

            if (!requests || typeof requests.uploadSigningKeysReq !== "string") {
                throw new Error(
                    "Bindings error: OlmMachine.bootstrapCrossSigning() did not return the upload requests. " +
                    "Cross-signing cannot be published with this version of " +
                    "@matrix-org/matrix-sdk-crypto-nodejs (need >= 0.5.0).",
                );
            }

            // 1. Device keys (may be absent if already uploaded).
            if (requests.uploadKeysReq) {
                await this.processKeysUploadRequest(requests.uploadKeysReq);
            }

            // 2. Cross-signing public keys -> /keys/device_signing/upload (UIA).
            await this.uploadDeviceSigningKeys(JSON.parse(requests.uploadSigningKeysReq), uiaCallback);

            // 3. Self-signature upload. This one IS a normal SignatureUpload
            //    request, so reuse the same code path (and mark it as sent).
            await this.processSignatureUploadRequest(requests.uploadSignaturesReq);
        });
    }

    /**
     * POST the cross-signing public keys to `/keys/device_signing/upload`,
     * driving the UIA challenge. The first attempt is sent without `auth`; the
     * server replies 401 with the available flows, which `uiaCallback` resolves
     * (typically an `m.login.password` stage). We then resubmit the SAME key
     * body with the returned `auth` dict (including the `session` id).
     */
    private async uploadDeviceSigningKeys(keysBody: Record<string, unknown>, uiaCallback: UIACallback): Promise<void> {
        const path = "/_matrix/client/v3/keys/device_signing/upload";
        try {
            await this.client.doRequest("POST", path, null, keysBody);
            return; // Server accepted without UIA (rare, but allowed).
        } catch (e) {
            const uia = extractUIA(e);
            if (!uia) throw e; // Not a UIA challenge — a real error.

            // Resolve the challenge, then resubmit the same keys with `auth`.
            // Loop in case the server stacks multiple stages.
            let session = uia.session;
            for (let attempt = 0; attempt < 10; attempt++) {
                const auth = await uiaCallback(uia);
                if (!auth) {
                    throw new Error("UIA for /keys/device_signing/upload was not satisfied (callback returned null)");
                }
                if (session && auth.session === undefined) auth.session = session;
                try {
                    await this.client.doRequest("POST", path, null, { ...keysBody, auth });
                    return; // Success.
                } catch (e2) {
                    const next = extractUIA(e2);
                    if (!next) throw e2; // Either success-shaped error or a hard failure.
                    // 401 again: if it carries completed stages we progress; otherwise
                    // the credentials were rejected. Surface the error body either way.
                    if (next.session) session = next.session;
                    if (hasFailedUIA(e2)) {
                        throw new Error("UIA for /keys/device_signing/upload failed: credentials rejected");
                    }
                    // Continue to next stage.
                }
            }
            throw new Error("UIA for /keys/device_signing/upload did not complete after multiple attempts");
        }
    }

    /**
     * Create + activate a server-side key-backup version derived from the given
     * recovery/backup public key, and tell the OlmMachine to use it. After this,
     * `KeysBackup` requests produced by `backupRoomKeys()` will have a version to
     * write into (handled in `processKeysBackupRequest`).
     *
     * NOTE: key backup is secondary to cross-signing. This wires the version
     * plumbing; the caller is responsible for generating the backup key and for
     * calling `machine.enableBackupV1()` / `backupRoomKeys()`. It is intentionally
     * conservative — see the adapter docs.
     */
    public async enableKeyBackup(authData: Record<string, unknown>, algorithm = "m.megolm_backup.v1.curve25519-aes-sha2"): Promise<string> {
        const resp = await this.client.doRequest(
            "POST", "/_matrix/client/v3/room_keys/version", null, { algorithm, auth_data: authData },
        );
        return resp.version;
    }
}

/**
 * Extract a UIA challenge from a thrown matrix-bot-sdk request error. A 401 UIA
 * body has `flows`/`session` and no `errcode`, so matrix-bot-sdk throws the raw
 * response object (`throw response`) rather than a `MatrixError`. We also accept
 * a `MatrixError`-like shape defensively. Returns null if it is not a UIA 401.
 *
 * @internal
 */
export function extractUIA(err: unknown): { flows: { stages: string[] }[]; params?: Record<string, unknown>; session?: string } | null {
    if (!err || typeof err !== "object") return null;
    const e = err as { statusCode?: number; body?: unknown };
    const status = e.statusCode;
    const body = (e.body ?? err) as { flows?: unknown; session?: string; params?: Record<string, unknown> };
    if (status !== undefined && status !== 401) return null;
    if (!body || !Array.isArray(body.flows)) return null;
    return { flows: body.flows as { stages: string[] }[], params: body.params, session: body.session };
}

/**
 * A second 401 whose body reports `completed: []` (or an unchanged stage list)
 * after we supplied credentials indicates the credentials were rejected, not a
 * stacked second stage. We treat the presence of an `error`/`errcode` in the
 * body as a hard rejection.
 *
 * @internal
 */
export function hasFailedUIA(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const e = err as { body?: { errcode?: string; error?: string } };
    const body = e.body ?? (err as { errcode?: string; error?: string });
    return Boolean(body && (body as { errcode?: string }).errcode);
}

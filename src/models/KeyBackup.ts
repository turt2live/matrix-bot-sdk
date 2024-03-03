import { IJsonType } from "../helpers/Types";
import { Signed } from "./Crypto";
import { RoomEncryptionAlgorithm } from "./events/EncryptionEvent";

/**
 * The kinds of key backup encryption algorithms allowed by the spec.
 * @category Models
 */
export enum KeyBackupEncryptionAlgorithm {
    MegolmBackupV1Curve25519AesSha2 = "m.megolm_backup.v1.curve25519-aes-sha2",
}

export interface ICurve25519AuthDataUnsigned {
    public_key: string;
}
export type ICurve25519AuthData = ICurve25519AuthDataUnsigned & Signed;

export type IKeyBackupAuthData = IJsonType | ICurve25519AuthDataUnsigned;

/**
 * Information about a server-side key backup,
 * with its auth_data left unsigned.
 */
export interface IKeyBackupInfoUnsigned {
    algorithm: string | KeyBackupEncryptionAlgorithm;
    auth_data: IKeyBackupAuthData;
}

/**
 * Information about a server-side key backup,
 * with its auth_data signed by the entity that created it.
 */
export type IKeyBackupInfo = IKeyBackupInfoUnsigned & {
    auth_data: Signed & IKeyBackupAuthData;
};

export type KeyBackupVersion = string;

export interface IKeyBackupVersion {
    version: KeyBackupVersion;
}

export interface IKeyBackupUpdateResponse {
    count: number;
    etag: string;
}

export type IKeyBackupInfoRetrieved = IKeyBackupInfo & IKeyBackupVersion & IKeyBackupUpdateResponse;

export type IKeyBackupInfoUpdate = IKeyBackupInfo & Partial<IKeyBackupVersion>;

export interface IMegolmSessionDataExport {
    algorithm: RoomEncryptionAlgorithm.MegolmV1AesSha2;
    room_id: string;
    sender_key: string;
    session_id: string;
    session_key: string;
    sender_claimed_keys: {
        [algorithm: string]: string;
    };
    forwarding_curve25519_key_chain: string[];
}

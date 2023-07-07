import { Signatures } from "./Crypto";

/**
 * The kinds of key backup encryption algorithms allowed by the spec.
 * @category Models
 */
export enum KeyBackupEncryptionAlgorithm {
    MegolmBackupV1Curve25519AesSha2 = "m.megolm_backup.v1.curve25519-aes-sha2",
}

/**
 * Information about a server-side key backup.
 */
export interface IKeyBackupInfo {
    algorithm: string | KeyBackupEncryptionAlgorithm;
    auth_data: object;
}

export type KeyBackupVersion = string;

export interface IKeyBackupVersion {
    version: KeyBackupVersion;
}

export interface IKeyBackupInfoRetrieved extends IKeyBackupInfo, IKeyBackupVersion {
    count: number;
    etag: string;
}

export type IKeyBackupInfoUpdate = IKeyBackupInfo & Partial<IKeyBackupVersion>;

export interface ICurve25519AuthDataUnsigned {
    public_key: string;
}

export type ICurve25519AuthData = ICurve25519AuthDataUnsigned & Signatures;

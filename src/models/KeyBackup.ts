import { IJsonType } from "../helpers/Types";
import { Signed } from "./Crypto";

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

/**
 * Information about a server-side key backup,
 * with its auth_data left unsigned.
 */
export interface IKeyBackupInfoUnsigned {
    algorithm: string | KeyBackupEncryptionAlgorithm;
    auth_data: IJsonType | ICurve25519AuthDataUnsigned;
}

/**
 * Information about a server-side key backup,
 * with its auth_data signed by the entity that created it.
 */
export type IKeyBackupInfo = IKeyBackupInfoUnsigned & {
    auth_data: Signed & IKeyBackupInfoUnsigned["auth_data"];
};

export type KeyBackupVersion = string;

export interface IKeyBackupVersion {
    version: KeyBackupVersion;
}

export interface IKeyBackupInfoRetrieved extends IKeyBackupInfo, IKeyBackupVersion {
    count: number;
    etag: string;
}

export type IKeyBackupInfoUpdate = IKeyBackupInfo & Partial<IKeyBackupVersion>;

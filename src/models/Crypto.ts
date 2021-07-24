/**
 * One time key algorithms.
 * @category Models
 */
export enum OTKAlgorithm {
    Signed = "signed_curve25519",
    Unsigned = "curve25519",
}

/**
 * Label for a one time key.
 * @category Models
 */
export type OTKLabel<Algorithm extends OTKAlgorithm, ID extends string> = `${Algorithm}:${ID}`;

/**
 * Signatures object.
 * @category Models
 */
export interface Signatures {
    [entity: string]: {
        [keyLabel: string]: string;
    };
}

/**
 * A signed_curve25519 one time key.
 * @category Models
 */
export interface SignedCurve25519OTK {
    key: string;
    signatures: Signatures;
}

/**
 * One Time Keys structure model.
 * @category Models
 */
export type OTKs = Record<OTKLabel<OTKAlgorithm.Signed, string>, SignedCurve25519OTK> & Record<OTKLabel<OTKAlgorithm.Unsigned, string>, string>;

/**
 * The counts of each one time key by algorithm.
 * @category Models
 */
export type OTKCounts = {
    [alg in OTKAlgorithm]?: number;
};

/**
 * The available encryption algorithms.
 * @category Models
 */
export enum EncryptionAlgorithm {
    OlmV1Curve25519AesSha2 = "m.olm.v1.curve25519-aes-sha2",
    MegolmV1AesSha2 = "m.megolm.v1.aes-sha2",
}

/**
 * The key algorithms for device keys.
 * @category Models
 */
export enum DeviceKeyAlgorithm {
    Ed25119 = "ed25519",
    Curve25519 = "curve25519",
}

/**
 * Label for a device key.
 * @category Models
 */
export type DeviceKeyLabel<Algorithm extends DeviceKeyAlgorithm, ID extends string> = `${Algorithm}:${ID}`;

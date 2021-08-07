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
    /**
     * The number of keys which remain unused for the algorithm.
     */
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

/**
 * Represents a user's device.
 * @category Models
 */
export interface UserDevice {
    user_id: string;
    device_id: string;
    algorithms: (EncryptionAlgorithm | string)[];
    keys: Record<DeviceKeyLabel<DeviceKeyAlgorithm, string>, string>;
    signatures: Signatures;
    unsigned?: {
        [k: string]: any;
        device_display_name?: string;
    };
}

/**
 * Device list response for a multi-user query.
 * @category Models
 */
export interface MultiUserDeviceListResponse {
    /**
     * Federation failures, keyed by server name. The mapped object should be a standard
     * error object.
     */
    failures: {
        [serverName: string]: any;
    };

    /**
     * A map of user ID to device ID to device.
     */
    device_keys: Record<string, Record<string, UserDevice>>;
}

/**
 * One Time Key claim response.
 * @category Models
 */
export interface OTKClaimResponse {
    /**
     * Federation failures, keyed by server name. The mapped object should be a standard
     * error object.
     */
    failures: {
        [serverName: string]: any;
    };

    /**
     * The claimed One Time Keys, as a map from user ID to device ID to key ID to OTK.
     */
    one_time_keys: Record<string, Record<string, OTKs>>;
}

/**
 * An outbound group session.
 * @category Models
 */
export interface IOutboundGroupSession {
    sessionId: string;
    roomId: string;
    pickled: string;
    isCurrent: boolean;
    usesLeft: number;
    expiresTs: number;
}

/**
 * An Olm session.
 * @category Models
 */
export interface IOlmSession {
    sessionId: string;
    pickled: string;
    lastDecryptionTs: number;
}

/**
 * An Olm payload (plaintext).
 * @category Models
 */
export interface IOlmPayload {
    type: string;
    content: any;
    sender: string;
    recipient: string; // user ID
    recipient_keys: {
        ed25519: string; // our key
    };
    keys: {
        ed25519: string; // their key
    };
}

/**
 * An encrypted Olm payload.
 * @category Models
 */
export interface IOlmEncrypted {
    algorithm: EncryptionAlgorithm.OlmV1Curve25519AesSha2;
    sender_key: string;
    ciphertext: {
        [deviceCurve25519Key: string]: {
            type: number;
            body: string; // base64
        };
    };
}

/**
 * The kind of payload which is sent encrypted from an Olm device.
 * @category Models
 */
export enum OlmPayloadKind {
    CanSetUpSession = 0,
    RequiresKnownSession = 1,
}

/**
 * A device message.
 * @category Models
 */
export interface IDeviceMessage {
    /**
     * The recipient user ID.
     */
    targetUserId: string;

    /**
     * The recipient device ID. May be "*" to denote all of the user's devices.
     */
    targetDeviceId: string;

    /**
     * The payload.
     */
    content: any;
}

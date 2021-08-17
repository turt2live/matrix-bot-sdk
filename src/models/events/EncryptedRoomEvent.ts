import { RoomEvent } from "./RoomEvent";
import { EncryptionAlgorithm, IMegolmEncrypted } from "../Crypto";

/**
 * The content definition for m.room.encrypted events
 * @category Matrix event contents
 * @see EncryptedRoomEvent
 */
export interface EncryptedRoomEventContent {
    algorithm: EncryptionAlgorithm;

    /**
     * For m.megolm.v1.aes-sha2 messages. The sender's Curve25519 key.
     */
    sender_key?: string;

    /**
     * For m.megolm.v1.aes-sha2 messages. The session ID established by the sender.
     */
    session_id?: string;

    /**
     * For m.megolm.v1.aes-sha2 messages. The encrypted payload.
     */
    ciphertext?: string;

    /**
     * For m.megolm.v1.aes-sha2 messages. The sender's device ID.
     */
    device_id?: string;

    // Other algorithms not supported at the moment
}

/**
 * Represents an m.room.encrypted room event
 * @category Matrix events
 */
export class EncryptedRoomEvent extends RoomEvent<EncryptedRoomEventContent> {
    constructor(event: any) {
        super(event);
    }

    /**
     * The encryption algorithm used on the event. Should match the m.room.encryption
     * state config.
     */
    public get algorithm(): EncryptionAlgorithm {
        return this.content.algorithm;
    }

    /**
     * The Megolm encrypted payload information.
     */
    public get megolmProperties(): IMegolmEncrypted {
        return this.content as IMegolmEncrypted;
    }
}

import { EncryptionEventContent } from "../models/events/EncryptionEvent";

/**
 * Information about a room for the purposes of crypto.
 * @category Encryption
 */
export interface ICryptoRoomInformation extends Partial<EncryptionEventContent> {
    historyVisibility?: string;
}

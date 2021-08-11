import {
    EncryptionAlgorithm,
    LogLevel,
    LogService,
    MatrixClient, MessageEvent,
    RichConsoleLogger,
    SimpleFsStorageProvider
} from "../src";
import { SqliteCryptoStorageProvider } from "../src/storage/SqliteCryptoStorageProvider";

LogService.setLogger(new RichConsoleLogger());
LogService.setLevel(LogLevel.TRACE);
LogService.muteModule("Metrics");
LogService.trace = LogService.debug;

let creds = null;
try {
    creds = require("../../examples/storage/encryption_bot.creds.json");
} catch (e) {
    // ignore
}

const dmTarget = creds?.['dmTarget'] ?? "@admin:localhost";
const homeserverUrl = creds?.['homeserverUrl'] ?? "http://localhost:8008";
const accessToken = creds?.['accessToken'] ?? 'YOUR_TOKEN';
const storage = new SimpleFsStorageProvider("./examples/storage/encryption_bot.json");
const crypto = new SqliteCryptoStorageProvider("./examples/storage/encryption_bot.db");

const client = new MatrixClient(homeserverUrl, accessToken, storage, crypto);

(async function() {
    let encryptedRoomId: string;
    const joinedRooms = await client.getJoinedRooms();
    await client.crypto.prepare(joinedRooms); // init crypto because we're doing things before the client is started
    for (const roomId of joinedRooms) {
        if (await client.crypto.isRoomEncrypted(roomId)) {
            encryptedRoomId = roomId;
            break;
        }
    }
    if (!encryptedRoomId) {
        encryptedRoomId = await client.createRoom({
            invite: [dmTarget],
            is_direct: true,
            visibility: "private",
            preset: "trusted_private_chat",
            initial_state: [
                {type: "m.room.encryption", state_key: "", content: {algorithm: EncryptionAlgorithm.MegolmV1AesSha2}},
                {type: "m.room.guest_access", state_key: "", content: {guest_access: "can_join"}},
            ],
        });
    }

    client.on("room.message", async (roomId: string, event: any) => {
        if (roomId !== encryptedRoomId) return;

        const message = new MessageEvent(event);

        if (message.sender === (await client.getUserId())) {
            // yay, we decrypted our own message. Communicate that back for testing purposes.
            return await client.unstableApis.addReactionToEvent(roomId, message.eventId, '🔐');
        }

        if (message.messageType !== "m.text") return;
        if (message.textBody.startsWith("!ping")) {
            await client.replyNotice(roomId, event, "Pong");
        }
    });

    LogService.info("index", "Starting bot...");
    await client.start();
})();

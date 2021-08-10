import {
    EncryptedRoomEvent,
    EncryptionAlgorithm,
    LogLevel,
    LogService,
    MatrixClient, MessageEvent,
    RichConsoleLogger, RichReply,
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

    client.on("room.event", async (roomId: string, event: any) => {
        if (roomId !== encryptedRoomId || event['type'] !== "m.room.encrypted") return;

        try {
            const decrypted = await client.crypto.decryptRoomEvent(new EncryptedRoomEvent(event), roomId);
            if (decrypted.type === "m.room.message") {
                const message = new MessageEvent(decrypted.raw);
                if (message.messageType !== "m.text") return;
                if (message.textBody.startsWith("!ping")) {
                    const reply = RichReply.createFor(roomId, message.raw, "Pong", "Pong");
                    reply['msgtype'] = "m.notice";
                    const encrypted = await client.crypto.encryptRoomEvent(roomId, "m.room.message", reply);
                    await client.sendEvent(roomId, "m.room.encrypted", encrypted);
                }
            }
        } catch (e) {
            LogService.error("index", e);
        }
    });

    LogService.info("index", "Starting bot...");
    await client.start();
})();

import * as fs from "fs";
import { StoreType } from "@matrix-org/matrix-sdk-crypto-nodejs";

import {
    EncryptionAlgorithm,
    FileMessageEventContent,
    LogLevel,
    LogService,
    MatrixClient,
    MessageEvent,
    RichConsoleLogger,
    RustSdkCryptoStorageProvider,
    SimpleFsStorageProvider,
} from "../src";

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
const crypto = new RustSdkCryptoStorageProvider("./examples/storage/encryption_bot_sqlite", StoreType.Sqlite);
const worksImage = fs.readFileSync("./examples/static/it-works.png");

const client = new MatrixClient(homeserverUrl, accessToken, storage, crypto);

(async function() {
    let encryptedRoomId: string|undefined = undefined;
    const joinedRooms = await client.getJoinedRooms();
    await client.crypto.prepare(); // init crypto because we're doing things before the client is started
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
                { type: "m.room.encryption", state_key: "", content: { algorithm: EncryptionAlgorithm.MegolmV1AesSha2 } },
                { type: "m.room.guest_access", state_key: "", content: { guest_access: "can_join" } },
            ],
        });
    }

    client.on("room.failed_decryption", async (roomId: string, event: any, e: Error) => {
        LogService.error("index", `Failed to decrypt ${roomId} ${event['event_id']} because `, e);
    });

    client.on("room.message", async (roomId: string, event: any) => {
        if (roomId !== encryptedRoomId) return;

        const message = new MessageEvent(event);

        if (message.sender === (await client.getUserId()) && message.messageType === "m.notice") {
            // yay, we decrypted our own message. Communicate that back for testing purposes.
            const encrypted = await client.crypto.encryptMedia(Buffer.from(worksImage));
            const mxc = await client.uploadContent(encrypted.buffer);
            await client.sendMessage(roomId, {
                msgtype: "m.image",
                body: "it-works.png",
                info: {
                    // XXX: We know these details, so have hardcoded them.
                    w: 256,
                    h: 256,
                    mimetype: "image/png",
                    size: worksImage.length,
                },
                file: {
                    url: mxc,
                    ...encrypted.file,
                },
            });
            return;
        }

        if (message.messageType === "m.image") {
            const fileEvent = new MessageEvent<FileMessageEventContent>(message.raw);
            const decrypted = await client.crypto.decryptMedia(fileEvent.content.file);
            fs.writeFileSync('./examples/storage/decrypted.png', decrypted);
            await client.unstableApis.addReactionToEvent(roomId, fileEvent.eventId, 'Decrypted');
            return;
        }

        if (message.messageType !== "m.text") return;
        if (message.textBody.startsWith("!ping")) {
            await client.replyNotice(roomId, event, "Pong");
        }
    });

    LogService.info("index", "Starting bot...");
    await client.start();
})();

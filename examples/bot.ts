import { StoreType } from "@matrix-org/matrix-sdk-crypto-nodejs";

import {
    AutojoinRoomsMixin,
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
    creds = require("../../examples/storage/bot.creds.json");
} catch (e) {
    // ignore
}

const dmTarget = creds?.['dmTarget'] ?? "@admin:localhost";
const homeserverUrl = creds?.['homeserverUrl'] ?? "http://localhost:8008";
const accessToken = creds?.['accessToken'] ?? 'YOUR_TOKEN';
const storage = new SimpleFsStorageProvider("./examples/storage/bot.json");
const crypto = new RustSdkCryptoStorageProvider("./examples/storage/bot_sqlite", StoreType.Sqlite);

const client = new MatrixClient(homeserverUrl, accessToken, storage, crypto);
AutojoinRoomsMixin.setupOnClient(client);

(async function() {
    await client.dms.update(); // should update in `start()`, but we're earlier than that here
    const targetRoomId = await client.dms.getOrCreateDm(dmTarget);

    client.on("room.message", async (roomId: string, event: any) => {
        if (roomId !== targetRoomId) return;

        const message = new MessageEvent(event);

        if (message.messageType !== "m.text") return;
        if (message.textBody.startsWith("!ping")) {
            await client.replyNotice(roomId, event, "Pong from DM");
        }
    });

    LogService.info("index", "Starting bot...");
    await client.start();
})();

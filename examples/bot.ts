import {
    AutojoinRoomsMixin,
    LogLevel,
    LogService,
    MessageEvent,
    RichConsoleLogger,
    SimpleFsStorageProvider
} from "../src";
import { SyncV3MatrixClient } from "../src/syncv3/SyncV3MatrixClient";

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

const homeserverUrl = creds?.['homeserverUrl'] ?? "http://localhost:8008";
const accessToken = creds?.['accessToken'] ?? 'YOUR_TOKEN';
const storage = new SimpleFsStorageProvider("./examples/storage/bot.json");

const client = new SyncV3MatrixClient(homeserverUrl, accessToken, storage);
AutojoinRoomsMixin.setupOnClient(client);

(async function() {
    // client.joinRoom('!dIJnfuNqTABKFEGJVf:localhost');
    client.on("room.message", async (roomId: string, event: any) => {
        const message = new MessageEvent(event);
        if (message.sender === await client.getUserId() || message.messageType === "m.notice") return;

        if (message.textBody.startsWith("!hello ")) {
            await client.replyText(roomId, event, message.textBody.substring("!hello ".length).trim() || "Hello!");
        }
    });

    await client.start();
    LogService.info("index", "Client started! Running as " + (await client.getUserId()));
})();

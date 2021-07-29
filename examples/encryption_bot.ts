import { LogLevel, LogService, MatrixClient, RichConsoleLogger, SimpleFsStorageProvider } from "../src";
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

const homeserverUrl = creds?.['homeserverUrl'] ?? "http://localhost:8008";
const accessToken = creds?.['accessToken'] ?? 'YOUR_TOKEN';
const storage = new SimpleFsStorageProvider("./examples/storage/encryption_bot.json");
const crypto = new SqliteCryptoStorageProvider("./examples/storage/encryption_bot.db");

const client = new MatrixClient(homeserverUrl, accessToken, storage, crypto);

(async function() {
    client.on("room.event", (roomId: string, event: any) => {
        LogService.debug("index", `${roomId}`, event);
    });

    LogService.info("index", "Starting bot...");
    await client.start();
})();

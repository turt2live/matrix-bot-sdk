import { LogLevel, LogService, MatrixClient, RichConsoleLogger, SimpleFsStorageProvider } from "../src";

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

const client = new MatrixClient(homeserverUrl, accessToken, storage, true);

(async function() {
    await client.crypto.prepare();
})();

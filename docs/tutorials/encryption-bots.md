Setting up encryption for a bot is easy: simply provide a crypto storage provider in addition to your other storage
providers and it'll start working behind the scenes.

```typescript
const storageProvider = new SimpleFsStorageProvider("./path/to/bot.json"); // or any other {@link IStorageProvider}
const cryptoProvider = new RustSdkCryptoStorageProvider("./path/to/directory");

// ⚠⚠ Be sure to back up both `./path/to/bot.json` and `./path/to/directory` when using this setup

const homeserverUrl = "https://example.org"; // where the bot can reach the homeserver at
const accessToken = "..."; // acquired from login or registration.

// ℹ The access token for the bot should remain consistent. The crypto storage in particular will assume that the
// device ID (and thus access token) does not change between restarts. If the access token becomes invalid, or the
// crypto storage is lost, a new access token and new crypto storage will need to be created.

const client = new MatrixClient(homeserverUrl, accessToken, storageProvider, cryptoProvider);

// set up your listeners here
client.on("room.message", (roomId: string, event: any) => {
    if (!event['content']?.['msgtype']) return;

    // handle message here. It'll be decrypted already.
});

// This will set up crypto if needed and prepare the client for automatically decrypting and encrypting messages. Simply
// use the client like you would without encryption and it should just work.
client.start().then(() => console.log("Bot started!"));
```

## Advanced usage

To monitor the encryption/decryption process, add the following listeners:

```typescript
client.on("room.encrypted_event", (roomId: string, event: any) => {
    // handle `m.room.encrypted` event that was received from the server
});
```

```typescript
client.on("room.decrypted_event", (roomId: string, event: any) => {
    // handle a decrypted `m.room.encrypted` event (`event` will be representative of the cleartext event).
    
    // this is effectively the same as `on('room.event', ...)` though at a different point in the lifecycle.
});
```

```typescript
client.on("room.failed_decryption", (roomId: string, event: any, error: Error) => {
    // handle `m.room.encrypted` event that could not be decrypted
});
```

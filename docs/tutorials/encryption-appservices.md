Encryption for appservices is just about as easy as bots, though involves using a storage mechanism which is capable of
handling the higher traffic. Eventually the SDK will support custom stores, however for now the crypto store must be
a {@link RustSdkAppserviceCryptoStorageProvider}.

```typescript
const storage = new SimpleFsStorageProvider("./path/to/appservice.json"); // or any other {@link IStorageProvider}
const cryptoStorage = new RustSdkAppserviceCryptoStorageProvider("./path/to/directory");

// ⚠⚠ Be sure to back up both `./path/to/appservice.json` and `./path/to/directory` when using this setup

const registration: IAppserviceRegistration = {
   /* ... */
   "de.sorunome.msc2409.push_ephemeral": true,
};
const options: IAppserviceOptions = {
   /* ... */
   storage: storage,
   cryptoStorage: cryptoStorage,
   intentOptions: {
      // Enable encryption on all appservice users, including the `sender_localpart` user
      encryption: true,
   },
}
const appservice = new Appservice(options);
```

## Advanced usage

To monitor the encryption/decryption process, add the following listeners:

```typescript
appservice.on("room.encrypted_event", (roomId: string, event: any) => {
    // handle `m.room.encrypted` event that was received from the server
});
```

```typescript
appservice.on("room.decrypted_event", (roomId: string, event: any) => {
    // handle a decrypted `m.room.encrypted` event (`event` will be representative of the cleartext event).
    
    // this is effectively the same as `on('room.event', ...)` though at a different point in the lifecycle.
});
```

```typescript
appservice.on("room.failed_decryption", (roomId: string, event: any, error: Error) => {
    // handle `m.room.encrypted` event that could not be decrypted
});
```

To control when encryption is set up for {@link Intent}s, set `intentOptions.encryption = false` in the appservice options
and call `await intent.enableEncryption()` before encryption will be needed. It is safe to call multiple times.

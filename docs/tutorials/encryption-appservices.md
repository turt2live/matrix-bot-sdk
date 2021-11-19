Encryption for appservices is just about as easy as bots, though involves using a storage mechanism which is capable of
handling the higher traffic. The bot-sdk provides a PostgreSQL implementation of {@link ICryptoStorageProvider}, though
you're welcome to write your own. Note that `storageForUser()` **must** be implemented if writing your own provider.

## {@link NamespacingPostgresCryptoStorageProvider}

This provider requires an {@link ICryptoSecureStorageProvider}. The bot-sdk provides one using 
[Cryptex](https://github.com/TomFrost/Cryptex), though you're welcome to write your own.

Upon instantiation, the class will automatically prepare the database for you.

⚠ It is important not to lose the PostgreSQL database or the Cryptex key (eg, in AWS KMS). Losing either will make for
a difficult recovery of the encryption state.

```typescript
const storage = new SimpleFsStorageProvider("./path/to/appservice.json"); // or any other {@link IStorageProvider}
const secureStorage = new CryptexCryptoSecureStorageProvider(); // instance of an {@link ICryptoSecureStorageProvider}
const psqlStorage = new NamespacingPostgresCryptoStorageProvider("postgresql://user:pass@domain/database", secureStorage);

const registration: IAppserviceRegistration = {
    /* ... */
    "de.sorunome.msc2409.push_ephemeral": true,
};
const options: IAppserviceOptions = {
    /* ... */
    storage: storage,
    cryptoStorage: psqlStorage,
    intentOptions: {
        // Enable encryption on all appservice users, including the `sender_localpart` user
        encryption: true,
    },
}
const appservice = new Appservice(options);
```

## {@link CryptexCryptoSecureStorageProvider}

This is an implementation of {@link ICryptoSecureStorageProvider} using [Cryptex](https://github.com/TomFrost/Cryptex).

The configuration methods supported by the Cryptex library are all supported here. The recommendation for appservices is
to add to their own config a section which mirrors the Cryptex configuration to pass it through to the provider.

⚠ It is important not to lose the Cryptex key (eg, in AWS KMS). Losing it will make for  a difficult recovery of the 
encryption state.

For example:

```yaml
# Your appservice config

crypto:
  algorithm: "aes256"
  keySource: "kms"
  keySourceOpts:
    dataKey: "... from KMS ..."
    region: "us-east-2"
  secrets:
    # `pickle_key` is the only secret the provider cares about (currently)
    pickle_key: "... encrypted with KMS key ..."
```

Then, after parsing, the provider instance can be created as:

```typescript
const secureStorage = new CryptexCryptoSecureStorageProvider({
    config: config.get("crypto"),
});
```

### Using AWS [KMS](https://aws.amazon.com/kms/)

1. Create a new symmetric key in the [KMS](https://aws.amazon.com/kms/) Console.
2. Give access to a user which has access to the [AWS CLI tool](http://docs.aws.amazon.com/cli/latest/userguide/installing.html).
3. Run the following to get the `dataKey` for `keySourceOpts` above:
    ```bash
    aws kms generate-data-key-without-plaintext \
        --key-id alias/<YOUR_KEY_ALIAS> \
        --key-spec AES_256 \
        --output text \
        --query CiphertextBlob
    ```
4. In an empty directory somewhere, create a `cryptex.json` file which looks similar to the following:
    ```json
    {
      "production": {
        "algorithm": "aes256",
        "keySource": "kms",
        "keySourceOpts": {
          "dataKey": "... from KMS ...",
          "region": "us-east-2"
        },
        "secrets": {}
      }
    }
    ```
5. Run `cryptex encrypt $YOUR_PICKLE_KEY` in that directory - the pickle key should be sufficiently complex.
6. Copy the output of that command into the `pickle_key` value for the appservice config.
7. (Optional) Delete the directory used to encrypt the pickle key.

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

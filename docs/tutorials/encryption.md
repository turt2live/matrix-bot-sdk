Matrix supports end-to-end encryption between users in encrypted rooms. Not all rooms are encrypted, and most bots and
bridges do not support encryption out of the gate. With the bot-sdk, encryption (or crypto) needs to be turned on 
deliberately in the code.

The following guides go into detail on how to enable encryption for different use cases:

* {@tutorial encryption-bots}
* {@tutorial encryption-appservices}

## General principles

For both bots and appservices, an {@link ICryptoStorageProvider} will be needed to actually enable encryption. This can
be your own implementation of the interface (including `storageForUser` in the case of appservices), or it can be one of
the built in types.

For bots, {@link NamespacingSqliteCryptoStorageProvider} is typically best. There is also an 
{@link NamespacingPostgresCryptoStorageProvider} intended for appservices, though works fine with bots too. The PostgreSQL
implementation takes a {@link ICryptoSecureStorageProvider} which can also be implemented on your own, or using something
like {@link CryptexCryptoSecureStorageProvider} instead.

```typescript
// Sqlite is easiest for most bots
const sqliteStorage = new NamespacingSqliteCryptoStorageProvider("./path/to/bot.db");

// PostgreSQL is easier for appservices, but just as available to bots. It requires a secret management provider.
// See the appservices tutorial for more information: {@tutorial encryption-appservices}
const cryptexInstance = new CryptexCryptoSecureStorageProvider(); // read from default locations
const psqlStorage = new NamespacingPostgresCryptoStorageProvider("postgresql://user:pass@domain/database", cryptexInstance);
```

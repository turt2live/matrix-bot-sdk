Matrix supports end-to-end encryption between users in encrypted rooms. Not all rooms are encrypted, and most bots and
bridges do not support encryption out of the gate. With the bot-sdk, encryption (or crypto) needs to be turned on 
deliberately in the code.

The following guides go into detail on how to enable encryption for different use cases:

* {@tutorial encryption-bots}
* {@tutorial encryption-appservices}

## General principles

For both bots and appservices, an {@link ICryptoStorageProvider} will be needed to actually enable encryption. Eventually
this will be able to be your own implementation, but for now must be a {@link RustSdkCryptoStorageProvider} or derivative.

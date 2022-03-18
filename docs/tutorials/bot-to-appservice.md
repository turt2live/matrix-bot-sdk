Once a bot has outgrown the performance of a `/sync` loop, it's typically time to convert it to an appservice. This involves
changing how the application receives events from the server, and possibly even migrating datastores if using custom storage
providers.

For the purposes of this tutorial, we'll assume the bot has been running as `@bot:example.org` with an access token.

First, you'll need to create a registration file. Check out the appservices tutorial for more information on what this
is: {@tutorial appservice}.

```yaml
id: examplebot
as_token: <RANDOM STRING>
hs_token: <RANDOM STRING>
url: "http://localhost:9000" # where your bot can be reached at the built-in webserver for the bot-sdk
sender_localpart: "bot"

# We don't need any namespaces, but they need to be declared
namespaces:
  users: []
  aliases: []
  rooms: []

rate_limited: false
de.sorunome.msc2409.push_ephemeral: true # default false. Keep false if not using typing notifications, encryption, etc.
```

That registration will need to be installed on the homeserver. Consult your homeserver documentation for more information.

Next, you'll need to incorporate that into the bot-sdk's interface. Because the bot-sdk is more geared to bridges, we'll
have to lie to it a bit to ensure it stays happy.

```typescript
const registration: IAppserviceRegistration = {
    id: "examplebot",
    as_token: "<RANDOM STRING>",
    hs_token: "<RANDOM STRING>",
    url: "http://localhost:9000", // not used by bot-sdk, but good to define for documentation purposes
    sender_localpart: "bot",
    namespaces: {
        users: [{exclusive: true, regex: "@bot.+"}], // we won't be using anything in the namespace, but need to define it
        aliases: [],
        rooms: [],
    },
    
    // For documentation purposes:
    rate_limited: false,
    "de.sorunome.msc2409.push_ephemeral": true,
};
```

Then, you'll need to define the appservice options. This will be things such as where the internal webserver will listen
at and where its data is stored. If you used a storage provider built into the bot-sdk, it can be reused here.

```typescript
const options: IAppserviceOptions = {
    // Webserver options
    port: 9000,
    bindAddress: "0.0.0.0",

    // This should be the same URL used by the bot.
    homeserverUrl: "https://example.org",

    // The domain name of the homeserver. This is the part that is included in user IDs.
    homeserverName: "example.org",

    registration: registration,
    storage: new SimpleFsStorageProvider("./path/to/bot.json"),
    joinStrategy: new SimpleRetryJoinStrategy(), // just to ensure reliable joins
};
```

Now, your listeners from your bot can be attached to the `appservice` instance instead:

```typescript
// Old code:

// bot.on("room.message", (roomId: string, event: any) => {
//     if (!event['content']?.['msgtype']) return;
//    
//     // handle message
// });

// ---------------

// New code:

appservice.on("room.message", (roomId: string, event: any) => {
    if (!event['content']?.['msgtype']) return;

    // handle message
});
```

Finally, start the appservice and give it a go: `appservice.begin().then(() => console.log("Appservice started"));`

If you need to access a {@link MatrixClient} instance for calling functions, use `appservice.botClient`. Note that the
client instance will not emit events because it will not be syncing/will not be started. It should not have `start()`
called on it as this can cause data loss/duplication.

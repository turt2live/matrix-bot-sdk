Application services are essentially superpowered bots with a much more capable connection to the homeserver. While bots
can operate on nearly any homeserver, appservices need to be specifically installed and configured by the server admins.
Because of the direct connection nature, and the ability to reserve a whole namespace of user IDs, appservices typically
take the shape of bridges. They also typically take the shape of single-user bots which outgrew the performance of calling
`/sync` in a loop.

Appservices are added to homeservers using a registration file. Typically, these are YAML files which get added/listed
to the server config somewhere. Check your homeserver software's documentation for how to install an appservice.

The bot-sdk does not automatically generate a registration file, but it is trivial to generate one by hand. Implementations
typically request that the server admin also supply an exact copy of the registration file so it can be handed off to the
bot-sdk to handle. Advanced uses (ie: multiple namespaces for a single appservice) might require translating the registration
file into something the bot-sdk is willing to accept, however most cases will be perfectly fine to just read it in directly.

An example registration file is:

```yaml
# A general purpose identifier for the appservice. Typically, this is just a lowercase version of the application
# name. It should be unique among all other appservices installed on the homeserver.
id: mybridge

# These are the authentication secrets used to communicate between the homeserver and appservice. They should
# be secret, sufficiently complex, and different from each other and all other appservices installed on the 
# homeserver.
as_token: <RANDOM STRING>
hs_token: <RANDOM STRING>

# These are the namespaces that the appservice would like to reserve or use. Typically, bridges will want to
# reserve an alias and user namespace.
namespaces:
  aliases:
    - exclusive: true
      # It's good practice to limit the regex to just bridge users on the current homeserver to avoid confusing
      # your bridge with other people who might be using it.
      regex: "#bridge_.+:example.org"
  users:
    - exclusive: true
      regex: "@bridge_.+:example.org"
  rooms: [] # not commonly used, but required to be set

rate_limited: false # typical bridges don't want to be rate limited

# This is the localpart of the primary user for the appservice. For bridges, this is typically known as the
# "bridge bot" user.
sender_localpart: "bridge_bot"

# This is where the homeserver can reach your appservice at. The bot-sdk will automatically expose a webserver
# at the configured port to handle this traffic and turn it into useful events.
url: "http://localhost:9000"

# If you need ephemeral events (for crypto or other reasons), set this to true. Defaults to false to avoid flooding
# the appservice wtih traffic.
de.sorunome.msc2409.push_ephemeral: true
```

## Creating the appservice instance

The {@link Appservice} class wants a whole bunch of options, though the details are not much different from a regular
bot. Namely, it wants a storage mechanism, config options for the webserver, and an appservice registration to use as
reference.

```typescript
const registration: {@link IAppserviceRegistration} = {/* ... typically read from the YAML file ... */ };
const options: {@link IAppserviceOptions} = {
    // Webserver options
    port: 9000,
    bindAddress: "0.0.0.0",

    // Where the appservice can reach the homeserver at. This should be the same URL configured for clients and bots.
    homeserverUrl: "https://example.org",

    // The domain name of the homeserver. This is the part that is included in user IDs.
    homeserverName: "example.org",

    registration: registration,
    storage: new SimpleFsStorageProvider("./path/to/appservice.json"), // or any other {@link IAppserviceStorageProvider}
    joinStrategy: new SimpleRetryJoinStrategy(), // just to ensure reliable joins
};
const appservice = new Appservice(options);

// Attach listeners here
appservice.on("room.message", (roomId: string, event: any) => {
    if (!event['content']?.['msgtype']) return;
    
    // handle message
});

// Typically appservices will want to autojoin all rooms
AutojoinRoomsMixin.setupOnAppservice(appservice);

// Actually start the appservice
appservice.begin().then(() => console.log("Appservice started"));
```

The `appservice` instance will emit all the same stuff as a regular bot. Check out the bot tutorial for more information:
{@tutorial bot}.

## Intents

Intents are how the bot-sdk deals with the namespace of users declared in the registration. The bridge bot user is also
an intent, though with a special accessor.

To get the bridge bot intent, use `appservice.botIntent`. For all other intents, `appservice.getIntentForSuffix("suffix")`
is typically easiest.

The {@link Intent} class has all sorts of built-in functions, though if you need to do something more complex then you
may need to handle the intent differently:

```typescript
const intent = appservice.getIntentForSuffix("your_suffix"); // typically a suffix is an identifier from a third party platform
await intent.ensureRegistered(); // can be called multiple times safely
await intent.underlyingClient.setDisplayName("Name"); // or whatever function you'd like to call
```

Typically the bridge bot intent is used for anything which doesn't need to be impersonated by a specific user ID, such
as querying room state or inviting users. The bridge client is exposed as `appservice.botClient` for easy access.

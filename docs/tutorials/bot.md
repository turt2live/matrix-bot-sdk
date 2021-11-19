Bots are typically simple creatures which act on commands and provide utility to rooms. They work very similar to how
normal Matrix clients work, with the added complexity of needing to be run on a server somewhere. Unlike appservices
(bridges), bots do not need to be added by a server admin and can be attached to any regular account.

For a guide starting from scratch, check out the [matrix.org guide](https://matrix.org/docs/guides/usage-of-matrix-bot-sdk).

## Creating the bot account

The bot-sdk can be used to script a simple registration or login script, depending on whether or not an account has
been made prior to deploying the bot. If you already have an access token, skip this section.

**Registration**:

```typescript
import { MatrixAuth } from "matrix-bot-sdk";

// This will be the URL where clients can reach your homeserver. Note that this might be different
// from where the web/chat interface is hosted. The server must support password registration without
// captcha or terms of service (public servers typically won't work).
const homeserverUrl = "https://example.org";

const auth = new MatrixAuth(homeserverUrl);
const client = await auth.passwordRegister("username", "password");

console.log("Copy this access token to your bot's config: ", client.accessToken);
```

**Login** (preferred):

```typescript
import { MatrixAuth } from "matrix-bot-sdk";

// This will be the URL where clients can reach your homeserver. Note that this might be different
// from where the web/chat interface is hosted. The server must support password registration without
// captcha or terms of service (public servers typically won't work).
const homeserverUrl = "https://example.org";

const auth = new MatrixAuth(homeserverUrl);
const client = await auth.passwordLogin("username", "password");

console.log("Copy this access token to your bot's config: ", client.accessToken);
```

In either case, the access token printed at the end will need copying to your bot's config.

## Quickstart bot

As an example, a bot which replies to `!hello` commands would be:

```typescript
import { 
    MatrixClient,
    SimpleFsStorageProvider,
    AutojoinRoomsMixin,
} from "matrix-bot-sdk";

// This will be the URL where clients can reach your homeserver. Note that this might be different
// from where the web/chat interface is hosted. The server must support password registration without
// captcha or terms of service (public servers typically won't work).
const homeserverUrl = "https://example.org";

// Use the access token you got from login or registration above.
const accessToken = "ACQUIRED_FROM_ABOVE";

// In order to make sure the bot doesn't lose its state between restarts, we'll give it a place to cache
// any information it needs to. You can implement your own storage provider if you like, but a JSON file
// will work fine for this example.
const storage = new SimpleFsStorageProvider("hello-bot.json");

// Finally, let's create the client and set it to autojoin rooms. Autojoining is typical of bots to ensure
// they can be easily added to any room.
const client = new MatrixClient(homeserverUrl, accessToken, storage);
AutojoinRoomsMixin.setupOnClient(client);

// Before we start the bot, register our command handler
client.on("room.message", handleCommand);

// Now that everything is set up, start the bot. This will start the sync loop and run until killed.
client.start().then(() => console.log("Bot started!"));

// This is the command handler we registered a few lines up
async function handleCommand(roomId: string, event: any) {
    // Don't handle unhelpful events (ones that aren't text messages, are redacted, or sent by us)
    if (event['content']?.['msgtype'] !== 'm.text') return;
    if (event['sender'] === await client.getUserId()) return;
    
    // Check to ensure that the `!hello` command is being run
    const body = event['content']['body'];
    if (!body?.startsWith("!hello")) return;
    
    // Now that we've passed all the checks, we can actually act upon the command
    await client.replyNotice(roomId, event, "Hello world!");
}
```

## Watching for events

A `MatrixClient` instance will call listeners for various different things that might happen after the bot has started.

### [Room messages](https://spec.matrix.org/latest/client-server-api/#instant-messaging) & [events](https://spec.matrix.org/latest/client-server-api/#events)

```typescript
client.on("room.message", (roomId: string, event: any) => {
    // `event['type']` will always be an `m.room.message` and can be processed as such
    
    // be sure to check if the event is redacted/invalid though:
    if (!event['content']?.['msgtype']) return;
});
```

```typescript
client.on("room.event", (roomId: string, event: any) => {
    // Check `event['type']` to see if it is an event you're interested in
    if (event['type'] !== 'org.example.custom') return;
    
    // Note that state events can also be sent down this listener too
    if (event['state_key'] !== undefined) return; // state event
});
```

### [Account data](https://spec.matrix.org/latest/client-server-api/#client-config)

```typescript
client.on("account_data", (event: any) => {
    // Handle the account data update
});
```

```typescript
client.on("room.account_data", (roomId: string, event: any) => {
    // Handle the room account data update 
});
```

### Room membership

```typescript
client.on("room.join", (roomId: string, event: any) => {
    // The client has joined `roomId`
});
```

```typescript
client.on("room.leave", (roomId: string, event: any) => {
    // The client has left `roomId` (either voluntarily, kicked, or banned)
});
```

```typescript
client.on("room.join", (roomId: string, event: any) => {
    // The client has been invited to `roomId`
});
```

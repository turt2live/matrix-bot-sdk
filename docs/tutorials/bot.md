Bots are typically simple creatures which act on commands and provide utility to rooms. They work very similar to how
normal Matrix clients work, with the added complexity of needing to be run on a server somewhere. Unlike appservices
(bridges), bots do not need to be added by a server admin and can be attached to any regular account.

<!-- TODO: setup environment a lot like the matrix.org blog -->

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

## General usage

<!-- TODO: Improve section -->

```typescript
const MatrixClient = require("matrix-bot-sdk").MatrixClient;
const AutojoinRoomsMixin = require("matrix-bot-sdk").AutojoinRoomsMixin;

const client = new MatrixClient("https://matrix.org", "your_access_token_here");
AutojoinRoomsMixin.setupOnClient(client);

// To listen for room messages (m.room.message) only:
client.on("room.message", (roomId, event) => {
    if (!event["content"]) return;
    console.log(event["sender"] + " says " + event["content"]["body"]);

    client.sendMessage(roomId, {
        "msgtype": "m.notice",
        "body": "hello!",
    });

    // or...
    client.sendNotice(roomId, "hello!");
});

// Or to listen for any event that happens in a room:
client.on("room.event", (roomId, event) => {
    if (!event["content"]) return;
    console.log(event["sender"] + " sent " + event["type"]);
});

client.start().then(() => console.log("Client started!"));
```


## Rich replies

<!-- TODO: Improve section -->

To automatically process rich replies coming into the client:
```typescript
const MatrixClient = require("matrix-bot-sdk").MatrixClient;
const RichRepliesPreprocessor = require("matrix-bot-sdk").RichRepliesPreprocessor;
const IRichReplyMetadata = require("matrix-bot-sdk").IRichReplyMetadata;

const client = new MatrixClient("https://matrix.org", "your_access_token_here");

// Set fetchRealEventContents to true to have the preprocessor get the real event
client.addPreprocessor(new RichRepliesPreprocessor(fetchRealEventContents: false));

// regular client usage here. When you encounter an event:
const event = {/* from somewhere, such as on a room message */};
if (event["mx_richreply"]) {
    const reply = <IRichReplyMetadata>event["mx_richreply"];
    console.log("The original event was " + reply.parentEventId + " and the text was " + reply.fallbackPlainBody);
}
```

To send a rich reply to an event:
```typescript
const MatrixClient = require("matrix-bot-sdk").MatrixClient;
const AutojoinRoomsMixin = require("matrix-bot-sdk").AutojoinRoomsMixin;
const RichReply = require("matrix-bot-sdk").RichReply;

const client = new MatrixClient("https://matrix.org", "your_access_token_here");
AutojoinRoomsMixin.setupOnClient(client);

client.on("room.message", (roomId, event) => {
    if (!event["content"]) return;

    const newEvent = RichReply.createFor(event, "Hello!", "<b>Hello!</b>");
    newEvent["msgtype"] = "m.notice";
    client.sendMessage(roomId, newEvent);
});

client.start().then(() => console.log("Client started!"));
```

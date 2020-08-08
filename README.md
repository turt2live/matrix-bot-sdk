# matrix-bot-sdk

[![npm version](https://badge.fury.io/js/matrix-bot-sdk.svg)](https://www.npmjs.com/package/matrix-bot-sdk)
[![TravisCI badge](https://travis-ci.org/turt2live/matrix-bot-sdk.svg?branch=master)](https://travis-ci.org/turt2live/matrix-js-bot-sdk)

TypeScript/JavaScript SDK for Matrix bots. For help and support, visit [#matrix-bot-sdk:t2bot.io](https://matrix.to/#/#matrix-bot-sdk:t2bot.io)

Documentation for the develop branch is available [here](https://turt2live.github.io/matrix-bot-sdk/index.html).

# Templates and guides

* [matrix.org's guide on the basic functions of the bot](https://matrix.org/docs/guides/usage-of-matrix-js-bot-sdk)
* [GitHub bot template repository](https://github.com/turt2live/matrix-bot-sdk-bot-template)

# Installing

This package can be found on [npm](https://www.npmjs.com):
```
npm install matrix-bot-sdk
```

# Quickstart Bot

Here's an example of a very simple bot written using this library. It will auto-join rooms and respond to `!hello` as a command.

```typescript
import {
    MatrixClient,
    SimpleFsStorageProvider,
    AutojoinRoomsMixin,
    RichReply,
} from "matrix-bot-sdk";

// where you would point a client to talk to a homeserver
const homeserverUrl = "https://matrix.org";

// see https://t2bot.io/docs/access_tokens
const accessToken = "YourSecretAccessToken";

// We'll want to make sure the bot doesn't have to do an initial sync every
// time it restarts, so we need to prepare a storage provider. Here we use
// a simple JSON database.
const storage = new SimpleFsStorageProvider("hello-bot.json");

// Now we can create the client and set it up to automatically join rooms.
const client = new MatrixClient(homeserverUrl, accessToken, storage);
AutojoinRoomsMixin.setupOnClient(client);

// We also want to make sure we can receive events - this is where we will
// handle our command.
client.on("room.message", handleCommand);

// Now that the client is all set up and the event handler is registered, start the
// client up. This will start it syncing.
client.start().then(() => console.log("Client started!"));

// This is our event handler for dealing with the `!hello` command.
async function handleCommand(roomId, event) {
    // Don't handle events that don't have contents (they were probably redacted)
    if (!event["content"]) return;

    // Don't handle non-text events
    if (event["content"]["msgtype"] !== "m.text") return;

    // We never send `m.text` messages so this isn't required, however this is
    // how you would filter out events sent by the bot itself.
    if (event["sender"] === await client.getUserId()) return;

    // Make sure that the event looks like a command we're expecting
    const body = event["content"]["body"];
    if (!body || !body.startsWith("!hello")) return;

    // If we've reached this point, we can safely execute the command. We'll
    // send a reply to the user's command saying "Hello World!".
    const replyBody = "Hello World!"; // we don't have any special styling to do.
    const reply = RichReply.createFor(roomId, event, replyBody, replyBody);
    reply["msgtype"] = "m.notice";
    client.sendMessage(roomId, reply);
}
```

# Usage

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


## Application Services

**Note**: If you plan on using application services, you'll need to install the `peerDependencies` of this project.

Application service support is an experimental feature of the SDK. This does things like Intent management, impersonation, and transaction handling on behalf of the application.

You'll need to load your registration file from somewhere, however the fastest path is:

```javascript
const Appservice = require("matrix-bot-sdk").Appservice;

// The registration is of type AppserviceRegistration, also available from the matrix-bot-sdk
const registration = {
    as_token: "YourTokenHere",
    hs_token: "YourTokenHere",
    sender_localpart: "_some_bridge",
    namespaces: {
        users: [
            {
                exclusive: true,
                regex: "@_some_bridge_.*",
            },
        ],
        rooms: [],
        aliases: [],
    },
};

// The options are of type AppserviceOptions, also available from the matrix-bot-sdk
const options = {
    port: 9000,
    bindAddress: "0.0.0.0",
    homeserverName: "matrix.org",
    homeserverUrl: "https://matrix.org",
};

const appservice = new Appservice(options, registration);
appservice.getIntent("_some_bridge_user").sendText("!somewhere:domain.com", "Hello world!");

// or if you don't want to do your own parsing to figure out the user prefix:
appservice.getIntentForSuffix("user").sendText("!somewhere:domain.com", "Hello world!");
```


## Room upgrades

When a room is upgraded, bots and bridges might have to relocate data to the new room. This SDK can handle the easier part of ensuring the bot/bridge is in the new room, and emits events to make the remainder of the process a little easier.

An upgrade happens in two phases: a `room.archived` phase where the old room is flagged as being replaced by another room and a `room.upgraded` phase once the bot/bridge is aware of the new room. Bots and appservices can be told to automatically try and join the new room by attaching a `AutojoinUpgradedRoomsMixin` to the client/appservice, much like the `AutojoinRoomsMixin`.

Bots and appservices should listen for `room.upgraded` to perform a data transfer as this is when there is referential integrity between the two rooms. Prior to an upgrade, there is no guarantee that the replacement room advertised is actually valid.

To get the full chain of rooms, use `getRoomUpgradeHistory(roomId)` on a `MatrixClient` (ie: the `botIntent.underlyingClient` or your own).

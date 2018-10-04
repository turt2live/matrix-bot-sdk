# matrix-js-bot-sdk

[![npm version](https://badge.fury.io/js/matrix-bot-sdk.svg)](https://www.npmjs.com/package/matrix-bot-sdk)
[![TravisCI badge](https://travis-ci.org/turt2live/matrix-js-bot-sdk.svg?branch=master)](https://travis-ci.org/turt2live/matrix-js-bot-sdk)

A lightweight version of the matrix-js-sdk intended for bots. For help and support, visit [#matrix-bot-sdk:t2bot.io](https://matrix.to/#/#matrix-bot-sdk:t2bot.io)

# Installing

This package can be found on [npm](https://www.npmjs.com):
```
npm install matrix-bot-sdk
```


# Usage

```typescript
const MatrixClient = require("matrix-bot-sdk").MatrixClient;
const AutojoinRoomsMixin = require("matrix-bot-sdk").AutojoinRoomsMixin;

const client = new MatrixClient("https://matrix.org", "your_access_token_here");
AutojoinRoomsMixin.setupOnClient(client);

client.on("room.message", (event) => {
    if (!event["content"]) return;
    console.log(event["sender"] + " says " + event["content"]["body"]);
    
    client.sendMessage(event["room_id"], {
        "msgtype": "m.notice",
        "body": "hello!",
    });
    
    // or...
    client.sendNotice(event["room_id"], "hello!");
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

client.on("room.message", (event) => {
    if (!event["content"]) return;
    
    const newEvent = RichReply.createFor(event, "Hello!", "<b>Hello!</b>");
    newEvent["msgtype"] = "m.notice";
    client.sendMessage(event["room_id"], newEvent);
});

client.start().then(() => console.log("Client started!"));
```

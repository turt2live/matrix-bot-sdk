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

```javascript
const MatrixClient = require("matrix-bot-sdk").MatrixClient;
const AutojoinRoomsMixin = require("matrix-bot-sdk").AutojoinRoomsMixin;

const client = new MatrixClient("https://matrix.org", "your_access_token_here");
AutojoinRoomsMixin.setupOnClient(client);

client.start().then(() => console.log("Client started!"));
```


### Application Services

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

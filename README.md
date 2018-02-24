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

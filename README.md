# matrix-bot-sdk

[![npm version](https://badge.fury.io/js/matrix-bot-sdk.svg)](https://www.npmjs.com/package/matrix-bot-sdk)

TypeScript/JavaScript SDK for Matrix bots. For help and support, visit [#matrix-bot-sdk:t2bot.io](https://matrix.to/#/#matrix-bot-sdk:t2bot.io)

# Documentation

Documentation for the project is available [here](https://turt2live.github.io/matrix-bot-sdk/index.html).

# Matrix version support

The Matrix protocol is [versioned](https://spec.matrix.org/latest/#specification-versions) to ensure endpoints and
functionality can safely rotate in and out of the ecosystem. The bot-sdk will assume it is connected to a homeserver 
with support for at least one of the last 2 versions, at the time of the bot-sdk's release. This means that if you 
connect the bot-sdk to a homeserver which is 3 or more Matrix versions out of date, things might not work for you.

It is recommended to update the bot-sdk as frequently as spec releases themselves (or faster) to avoid this situation, 
and watch the repo for updates in the event a release is delayed.

**Note**: Currently the bot-sdk does not throw an error if the server appears to be incompatible, however this might
change in the future.

<!-- TODO: Improve section -->

When a room is upgraded, bots and bridges might have to relocate data to the new room. This SDK can handle the easier part of ensuring the bot/bridge is in the new room, and emits events to make the remainder of the process a little easier.

An upgrade happens in two phases: a `room.archived` phase where the old room is flagged as being replaced by another room and a `room.upgraded` phase once the bot/bridge is aware of the new room. Bots and appservices can be told to automatically try and join the new room by attaching a `AutojoinUpgradedRoomsMixin` to the client/appservice, much like the `AutojoinRoomsMixin`.

Bots and appservices should listen for `room.upgraded` to perform a data transfer as this is when there is referential integrity between the two rooms. Prior to an upgrade, there is no guarantee that the replacement room advertised is actually valid.

To get the full chain of rooms, use `getRoomUpgradeHistory(roomId)` on a `MatrixClient` (ie: the `botIntent.underlyingClient` or your own).

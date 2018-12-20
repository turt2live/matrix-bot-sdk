import {
    Appservice,
    AutojoinRoomsMixin,
    IAppserviceOptions,
    IAppserviceRegistration,
    MemoryStorageProvider,
    SimpleRetryJoinStrategy
} from "../src";

const registration: IAppserviceRegistration = {
    as_token: "change_me",
    hs_token: "change_me",
    sender_localpart: "_example_bot",
    namespaces: {
        users: [{
            regex: "@_example_.*:localhost",
            exclusive: true,
            groupId: null,
        }],
        rooms: [],
        aliases: [],
    },
};

console.log("Setting up appservice with in-memory storage");

const storage = new MemoryStorageProvider();

const options: IAppserviceOptions = {
    bindAddress: "0.0.0.0",
    port: 9000,
    homeserverName: "localhost",
    homeserverUrl: "http://localhost:8008",

    storage: storage,
    registration: registration,
    joinStrategy: new SimpleRetryJoinStrategy(),
};

const appservice = new Appservice(options);
AutojoinRoomsMixin.setupOnAppservice(appservice);

appservice.on("room.event", (roomId, event) => {
    console.log(`Received event ${event["id"]} (${event["type"]}) from ${event["sender"]} in ${roomId}`);
});

appservice.on("room.message", (roomId, event) => {
    if (!event["content"]) return;
    if (event["content"]["msgtype"] !== "m.text") return;

    const body = event["content"]["body"];
    console.log(`Received message ${event["id"]} from ${event["sender"]} in ${roomId}: ${body}`);

    // We'll create fake ghosts based on the event ID. Typically these users would be mapped
    // by some other means and not arbitrarily. The ghost here also echos whatever the original
    // user said.
    const intent = appservice.getIntentForSuffix(event["id"].replace(/^[a-z0-9]/g, '_'));
    intent.sendText(roomId, body, "m.notice");
});

// Note: The following 3 handlers only fire for appservice users! These will NOT be fired
// for everyone.

appservice.on("room.invite", (roomId, inviteEvent) => {
    console.log(`Received invite for ${inviteEvent["state_key"]} to ${roomId}`);
});

appservice.on("room.join", (roomId, joinEvent) => {
    console.log(`Joined ${roomId} as ${joinEvent["state_key"]}`);
});

appservice.on("room.leave", (roomId, leaveEvent) => {
    console.log(`Left ${roomId} as ${leaveEvent["state_key"]}`);
});

appservice.begin().then(() => console.log("Appservice started"));

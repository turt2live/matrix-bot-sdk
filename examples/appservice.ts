import { Appservice, IAppserviceOptions, IAppserviceRegistration, MemoryStorageProvider } from "../src";

const options: IAppserviceOptions = {
    bindAddress: "0.0.0.0",
    port: 9000,
    homeserverName: "localhost",
    homeserverUrl: "http://localhost:8008",
};

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

const storage = new MemoryStorageProvider();
const appservice = new Appservice(options, registration, storage);
appservice.begin().then(() => console.log("Appservice started"));

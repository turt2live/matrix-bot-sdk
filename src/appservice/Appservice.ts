import * as express from "express";
import { Intent } from "./Intent";
import {
    AppserviceJoinRoomStrategy,
    IAppserviceStorageProvider,
    IJoinRoomStrategy,
    IPreprocessor,
    LogService,
    MemoryStorageProvider
} from "..";
import { EventEmitter } from "events";
import * as morgan from "morgan";
import { MatrixBridge } from "./MatrixBridge";

/**
 * Represents an application service's registration file. This is expected to be
 * loaded from another source, such as a YAML file.
 */
export interface IAppserviceRegistration {
    /**
     * Optional ID for the appplication service. Used by homeservers to track which application
     * service registers what.
     */
    id?: string;

    /**
     * Optional URL at which the application service can be contacted.
     */
    url?: string;

    /**
     * The token the application service uses to communicate with the homeserver.
     */
    as_token: string;

    /**
     * The token the homeserver uses to communicate with the application service.
     */
    hs_token: string;

    /**
     * The application service's own localpart (eg: "_irc_bot" in the user ID "@_irc_bot:domain.com")
     */
    sender_localpart: string;

    /**
     * The various namespaces the application service can support.
     */
    namespaces: {
        /**
         * The user namespaces the application service is requesting.
         */
        users: {
            /**
             * Whether or not the application service holds an exclusive lock on the namespace. This
             * means that no other user on the homeserver may register users that match this namespace.
             */
            exclusive: boolean;

            /**
             * The regular expression that the homeserver uses to determine if a user is in this namespace.
             */
            regex: string;

            /**
             * An optional group ID to enable flair for users in this namespace.
             */
            groupId?: string;
        }[];

        /**
         * The room namespaces the application service is requesting. This is not for alises.
         */
        rooms: {
            /**
             * Whether or not the application service holds an exclusive lock on the namespace.
             */
            exclusive: boolean;

            /**
             * The regular expression that the homeserver uses to determine if a user is in this namespace.
             */
            regex: string;
        }[];

        /**
         * The room alias namespaces the application service is requesting.
         */
        aliases: {
            /**
             * Whether or not the application service holds an exclusive lock on the namespace. This means
             * that no other user on the homeserver may register aliases that match this namespace.
             */
            exclusive: boolean;

            /**
             * The regular expression that the homeserver uses to determine if an alias is in this namespace.
             */
            regex: string;
        }[];
    };

    // not interested in other options
}

/**
 * General options for the application service
 */
export interface IAppserviceOptions {
    /**
     * The port to listen for requests from the homeserver on.
     */
    port: number;

    /**
     * The bind address to listen for requests on.
     */
    bindAddress: string;

    /**
     * The name of the homeserver, as presented over federation (eg: "matrix.org")
     */
    homeserverName: string;

    /**
     * The URL to the homeserver's client server API (eg: "https://matrix.org")
     */
    homeserverUrl: string;

    /**
     * The storage provider to use for this application service.
     */
    storage?: IAppserviceStorageProvider,

    /**
     * The registration for this application service.
     */
    registration: IAppserviceRegistration,

    /**
     * The join strategy to use for all intents, if any.
     */
    joinStrategy?: IJoinRoomStrategy,
}

/**
 * Represents an application service. This provides helper utilities such as tracking
 * of user intents (clients that are aware of their membership in rooms).
 */
export class Appservice extends EventEmitter {

    private readonly userPrefix: string;
    private readonly registration: IAppserviceRegistration;
    private readonly storage: IAppserviceStorageProvider;
    private readonly bridgeInstance = new MatrixBridge(this);

    private app = express();
    private appServer: any;
    private intents: { [userId: string]: Intent } = {};
    private eventProcessors: { [eventType: string]: IPreprocessor[] } = {};
    private pendingTransactions: { [txnId: string]: Promise<any> } = {};

    /**
     * Creates a new application service.
     * @param {IAppserviceOptions} options The options for the application service.
     */
    constructor(private options: IAppserviceOptions) {
        super();

        options.joinStrategy = new AppserviceJoinRoomStrategy(options.joinStrategy, this);

        this.registration = options.registration;
        this.storage = options.storage || new MemoryStorageProvider();
        options.storage = this.storage;

        this.app.use(express.json());
        this.app.use(morgan("combined"));

        this.app.get("/users/:userId", this.onUser.bind(this));
        this.app.get("/rooms/:roomAlias", this.onRoomAlias.bind(this));
        this.app.put("/transactions/:txnId", this.onTransaction.bind(this));
        this.app.get("/_matrix/app/v1/users/:userId", this.onUser.bind(this));
        this.app.get("/_matrix/app/v1/rooms/:roomAlias", this.onRoomAlias.bind(this));
        this.app.put("/_matrix/app/v1/transactions/:txnId", this.onTransaction.bind(this));
        // Everything else can 404

        // TODO: Should we permit other user namespaces and instead error when trying to use doSomethingBySuffix()?

        if (!this.registration.namespaces || !this.registration.namespaces.users || this.registration.namespaces.users.length === 0) {
            throw new Error("No user namespaces in registration");
        }
        if (this.registration.namespaces.users.length !== 1) {
            throw new Error("Too many user namespaces registered: expecting exactly one");
        }

        this.userPrefix = (this.registration.namespaces.users[0].regex || "").split(":")[0];
        if (!this.userPrefix.endsWith(".*")) {
            throw new Error("Expected user namespace to be a prefix");
        }
        this.userPrefix = this.userPrefix.substring(0, this.userPrefix.length - 2); // trim off the .* part
    }

    /**
     * Gets the express app instance which is serving requests. Not recommended for
     * general usage, but may be used to append routes to the web server.
     */
    public get expressAppInstance() {
        return this.app;
    }

    /**
     * Gets the bridge-specific APIs for this application service.
     */
    public get bridge(): MatrixBridge {
        return this.bridgeInstance;
    }

    /**
     * Get the application service's "bot" user ID (the sender_localpart).
     */
    public get botUserId(): string {
        return this.getUserId(this.registration.sender_localpart);
    }

    /**
     * Get the application service's "bot" Intent (the sender_localpart).
     * @returns {Intent} The intent for the application service itself.
     */
    public get botIntent(): Intent {
        return this.getIntentForUserId(this.botUserId);
    }

    /**
     * Starts the application service, opening the bind address to begin processing requests.
     * @returns {Promise<*>} resolves when started
     */
    public begin(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.appServer = this.app.listen(this.options.port, this.options.bindAddress, () => resolve());
        }).then(() => this.botIntent.ensureRegistered());
    }

    /**
     * Stops the application service, freeing the web server.
     */
    public stop(): void {
        if (!this.appServer) return;
        this.appServer.close();
    }

    /**
     * Gets an intent for a given localpart. The user ID will be formed with the domain name given
     * in the constructor.
     * @param localpart The localpart to get an Intent for.
     * @returns {Intent} An Intent for the user.
     */
    public getIntent(localpart: string): Intent {
        return this.getIntentForUserId(this.getUserId(localpart));
    }

    /**
     * Gets a full user ID for a given localpart. The user ID will be formed with the domain name given
     * in the constructor.
     * @param localpart The localpart to get a user ID for.
     * @returns {string} The user's ID.
     */
    public getUserId(localpart: string): string {
        return `@${localpart}:${this.options.homeserverName}`;
    }

    /**
     * Gets an Intent for a given user suffix. The prefix is automatically detected from the registration
     * options.
     * @param suffix The user's suffix
     * @returns {Intent} An Intent for the user.
     */
    public getIntentForSuffix(suffix: string): Intent {
        return this.getIntentForUserId(this.getUserIdForSuffix(suffix));
    }

    /**
     * Gets a full user ID for a given suffix. The prefix is automatically detected from the registration
     * options.
     * @param suffix The user's suffix
     * @returns {string} The user's ID.
     */
    public getUserIdForSuffix(suffix: string): string {
        return `${this.userPrefix}${suffix}:${this.options.homeserverName}`;
    }

    /**
     * Gets an Intent for a given user ID.
     * @param {string} userId The user ID to get an Intent for.
     * @returns {Intent} An Intent for the user.
     */
    public getIntentForUserId(userId: string): Intent {
        if (!this.intents[userId]) {
            this.intents[userId] = new Intent(this.options, userId, this);
        }
        return this.intents[userId];
    }

    /**
     * Determines if a given user ID is namespaced by this application service.
     * @param {string} userId The user ID to check
     * @returns {boolean} true if the user is namespaced, false otherwise
     */
    public isNamespacedUser(userId: string): boolean {
        return userId === this.botUserId || (userId.startsWith(this.userPrefix) && userId.endsWith(":" + this.options.homeserverName));
    }

    /**
     * Adds a preprocessor to the event pipeline. When this appservice encounters an event, it
     * will try to run it through the preprocessors it can in the order they were added.
     * @param {IPreprocessor} preprocessor the preprocessor to add
     */
    public addPreprocessor(preprocessor: IPreprocessor): void {
        if (!preprocessor) throw new Error("Preprocessor cannot be null");

        const eventTypes = preprocessor.getSupportedEventTypes();
        if (!eventTypes) return; // Nothing to do

        for (const eventType of eventTypes) {
            if (!this.eventProcessors[eventType]) this.eventProcessors[eventType] = [];
            this.eventProcessors[eventType].push(preprocessor);
        }
    }

    private async processEvent(event: any): Promise<any> {
        if (!event) return event;
        if (!this.eventProcessors[event["type"]]) return event;

        for (const processor of this.eventProcessors[event["type"]]) {
            await processor.processEvent(event, this.botIntent.underlyingClient);
        }

        return event;
    }

    private processMembershipEvent(event: any): void {
        if (!event["content"]) return;

        const targetMembership = event["content"]["membership"];
        if (targetMembership === "join") {
            this.emit("room.join", event["room_id"], event);
        } else if (targetMembership === "ban" || targetMembership === "leave") {
            this.emit("room.leave", event["room_id"], event);
        } else if (targetMembership === "invite") {
            this.emit("room.invite", event["room_id"], event);
        }
    }

    private isAuthed(req: any): boolean {
        let providedToken = req.query ? req.query["access_token"] : null;
        if (req.headers && req.headers["Authorization"]) {
            const authHeader = req.headers["Authorization"];
            if (!authHeader.startsWith("Bearer ")) providedToken = null;
            else providedToken = authHeader.substring("Bearer ".length);
        }

        return providedToken === this.registration.hs_token;
    }

    private async onTransaction(req, res): Promise<any> {
        if (!this.isAuthed(req)) {
            res.status(401).send({errcode: "AUTH_FAILED", error: "Authentication failed"});
        }

        if (typeof (req.body) !== "object") {
            res.status(400).send({errcode: "BAD_REQUEST", error: "Expected JSON"});
            return;
        }

        if (!req.body["events"] || !Array.isArray(req.body["events"])) {
            res.status(400).send({errcode: "BAD_REQUEST", error: "Invalid JSON: expected events"});
            return;
        }

        const txnId = req.params["txnId"];

        if (this.storage.isTransactionCompleted(txnId)) {
            res.status(200).send({});
        }

        if (this.pendingTransactions[txnId]) {
            try {
                await this.pendingTransactions[txnId];
                res.status(200).send({});
            } catch (e) {
                LogService.error("Appservice", e);
                res.status(500).send({});
            }
        }

        LogService.info("Appservice", "Processing transaction " + txnId);
        this.pendingTransactions[txnId] = new Promise(async (resolve, reject) => {
            for (let event of req.body["events"]) {
                LogService.info("Appservice", `Processing event of type ${event["type"]}`);
                event = await this.processEvent(event);
                this.emit("room.event", event["room_id"], event);
                if (event['type'] === 'm.room.message') {
                    this.emit("room.message", event["room_id"], event);
                }
                if (event['type'] === 'm.room.member' && this.isNamespacedUser(event['state_key'])) {
                    this.processMembershipEvent(event);
                }
                if (event['type'] === 'm.room.tombstone' && event['state_key'] === '') {
                    this.emit("room.archived", event['room_id'], event);
                }
                if (event['type'] === 'm.room.create' && event['state_key'] === '' && event['content'] && event['content']['predecessor']) {
                    this.emit("room.upgraded", event['room_id'], event);
                }
            }

            resolve();
        });

        try {
            await this.pendingTransactions[txnId];
            this.storage.setTransactionCompleted(txnId);
            res.status(200).send({});
        } catch (e) {
            LogService.error("Appservice", e);
            res.status(500).send({});
        }
    }

    private async onUser(req, res): Promise<any> {
        if (!this.isAuthed(req)) {
            res.status(401).send({errcode: "AUTH_FAILED", error: "Authentication failed"});
        }

        const userId = req.params["userId"];
        this.emit("query.user", userId, async (result) => {
            if (result.then) result = await result;
            if (result === false) {
                res.status(404).send({errcode: "USER_DOES_NOT_EXIST", error: "User not created"});
            } else {
                const intent = this.getIntentForUserId(userId);
                await intent.ensureRegistered();
                if (result.display_name) await intent.underlyingClient.setDisplayName(result.display_name);
                if (result.avatar_mxc) await intent.underlyingClient.setAvatarUrl(result.avatar_mxc);
                res.status(200).send(result); // return result for debugging + testing
            }
        });
    }

    private async onRoomAlias(req, res): Promise<any> {
        if (!this.isAuthed(req)) {
            res.status(401).send({errcode: "AUTH_FAILED", error: "Authentication failed"});
        }

        const roomAlias = req.params["roomAlias"];
        this.emit("query.room", roomAlias, async (result) => {
            if (result.then) result = await result;
            if (result === false) {
                res.status(404).send({errcode: "ROOM_DOES_NOT_EXIST", error: "Room not created"});
            } else {
                const intent = this.botIntent;
                await intent.ensureRegistered();

                result["room_alias_name"] = roomAlias.substring(1).split(':')[0];
                result["__roomId"] = await intent.underlyingClient.createRoom(result);

                res.status(200).send(result); // return result for debugging + testing
            }
        });
    }
}

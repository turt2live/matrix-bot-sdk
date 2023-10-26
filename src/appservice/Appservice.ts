import * as express from "express";
import { EventEmitter } from "events";
import * as morgan from "morgan";
import * as LRU from "lru-cache";
import { stringify } from "querystring";

import { Intent } from "./Intent";
import {
    AppserviceJoinRoomStrategy,
    EncryptedRoomEvent,
    EventKind,
    IAppserviceCryptoStorageProvider,
    IAppserviceStorageProvider,
    IJoinRoomStrategy,
    IPreprocessor,
    LogService,
    MatrixClient,
    MemoryStorageProvider,
    Metrics,
    MSC3983KeyClaimResponse,
    MSC3984KeyQueryResponse,
    OTKAlgorithm,
    redactObjectForLogging,
    UserID,
} from "..";
import { MatrixBridge } from "./MatrixBridge";
import { IApplicationServiceProtocol } from "./http_responses";

const EDU_ANNOTATION_KEY = "io.t2bot.sdk.bot.type";

enum EduAnnotation {
    ToDevice = "to_device",
    Ephemeral = "ephemeral",
}

/**
 * Represents an application service's registration file. This is expected to be
 * loaded from another source, such as a YAML file.
 * @category Application services
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

    /**
     * The protocols the application service supports. Optional.
     */
    protocols?: string[];

    /**
     * If the application service is rate limited by the homeserver. Optional.
     */
    rate_limited?: boolean;

    /**
     * **Experimental**
     *
     * Should the application service receive ephemeral events from the homeserver. Optional.
     * @see https://github.com/matrix-org/matrix-doc/pull/2409
     */
    "de.sorunome.msc2409.push_ephemeral"?: boolean;

    // not interested in other options
}

/**
 * General options for the application service
 * @category Application services
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
    storage?: IAppserviceStorageProvider;

    /**
     * The storage provider to use for setting up encryption. Encryption will be
     * disabled for all intents and the appservice if not configured.
     */
    cryptoStorage?: IAppserviceCryptoStorageProvider;

    /**
     * The registration for this application service.
     */
    registration: IAppserviceRegistration;

    /**
     * The join strategy to use for all intents, if any.
     */
    joinStrategy?: IJoinRoomStrategy;

    /**
     * Options for how Intents are handled.
     */
    intentOptions?: {
        /**
         * The maximum number of intents to keep cached. Defaults to 10 thousand.
         */
        maxCached?: number;

        /**
         * The maximum age in milliseconds to keep an Intent around for, provided
         * the maximum number of intents has been reached. Defaults to 60 minutes.
         */
        maxAgeMs?: number;

        /**
         * If false (default), crypto will not be automatically set up for all intent
         * instances - it will need to be manually enabled with
         * `await intent.enableEncryption()`.
         *
         * If true, crypto will be automatically set up.
         *
         * Note that the appservice bot account is considered an intent.
         */
        encryption?: boolean;
    };
}

/**
 * Represents an application service. This provides helper utilities such as tracking
 * of user intents (clients that are aware of their membership in rooms).
 * @category Application services
 */
export class Appservice extends EventEmitter {
    /**
     * The metrics instance for this appservice. This will raise all metrics
     * from this appservice instance as well as any intents/MatrixClients created
     * by the appservice.
     */
    public readonly metrics: Metrics = new Metrics();

    private readonly userPrefix: string | null;
    private readonly aliasPrefix: string | null;
    private readonly registration: IAppserviceRegistration;
    private readonly storage: IAppserviceStorageProvider;
    private readonly cryptoStorage: IAppserviceCryptoStorageProvider;
    private readonly bridgeInstance = new MatrixBridge(this);

    private app = express();
    private appServer: any;
    private intentsCache: LRU.LRUCache<string, Intent>;
    private eventProcessors: { [eventType: string]: IPreprocessor[] } = {};
    private pendingTransactions: { [txnId: string]: Promise<any> } = {};

    /**
     * Creates a new application service.
     * @param {IAppserviceOptions} options The options for the application service.
     */
    constructor(private options: IAppserviceOptions) {
        super();

        options.joinStrategy = new AppserviceJoinRoomStrategy(options.joinStrategy, this);

        if (!options.intentOptions) options.intentOptions = {};
        if (!options.intentOptions.maxAgeMs) options.intentOptions.maxAgeMs = 60 * 60 * 1000;
        if (!options.intentOptions.maxCached) options.intentOptions.maxCached = 10000;

        this.intentsCache = new LRU.LRUCache({
            max: options.intentOptions.maxCached,
            ttl: options.intentOptions.maxAgeMs,
        });

        this.registration = options.registration;

        // If protocol is not defined, define an empty array.
        if (!this.registration.protocols) {
            this.registration.protocols = [];
        }

        this.storage = options.storage || new MemoryStorageProvider();
        options.storage = this.storage;
        this.cryptoStorage = options.cryptoStorage;

        this.app.use(express.json({ limit: Number.MAX_SAFE_INTEGER })); // disable limits, use a reverse proxy
        morgan.token('url-safe', (req: express.Request) =>
            `${req.path}?${stringify(redactObjectForLogging(req.query ?? {}))}`,
        );

        this.app.use(morgan(
            // Same as "combined", but with sensitive values removed from requests.
            ':remote-addr - :remote-user [:date[clf]] ":method :url-safe HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"',
            { stream: { write: LogService.info.bind(LogService, 'Appservice') } },
        ));

        // ETag headers break the tests sometimes, and we don't actually need them anyways for
        // appservices - none of this should be cached.
        this.app.set('etag', false);

        this.app.get("/users/:userId", this.onUser.bind(this));
        this.app.get("/rooms/:roomAlias", this.onRoomAlias.bind(this));
        this.app.put("/transactions/:txnId", this.onTransaction.bind(this));
        this.app.get("/_matrix/app/v1/users/:userId", this.onUser.bind(this));
        this.app.get("/_matrix/app/v1/rooms/:roomAlias", this.onRoomAlias.bind(this));
        this.app.put("/_matrix/app/v1/transactions/:txnId", this.onTransaction.bind(this));
        this.app.get("/_matrix/app/v1/thirdparty/protocol/:protocol", this.onThirdpartyProtocol.bind(this));
        this.app.get("/_matrix/app/v1/thirdparty/user/:protocol", this.onThirdpartyUser.bind(this));
        this.app.get("/_matrix/app/v1/thirdparty/user", this.onThirdpartyUser.bind(this));
        this.app.get("/_matrix/app/v1/thirdparty/location/:protocol", this.onThirdpartyLocation.bind(this));
        this.app.get("/_matrix/app/v1/thirdparty/location", this.onThirdpartyLocation.bind(this));
        this.app.post("/_matrix/app/unstable/org.matrix.msc3983/keys/claim", this.onKeysClaim.bind(this));
        this.app.post("/_matrix/app/unstable/org.matrix.msc3984/keys/query", this.onKeysQuery.bind(this));

        // Workaround for https://github.com/matrix-org/synapse/issues/3780
        this.app.post("/_matrix/app/v1/unstable/org.matrix.msc3983/keys/claim", this.onKeysClaim.bind(this));
        this.app.post("/unstable/org.matrix.msc3983/keys/claim", this.onKeysClaim.bind(this));
        this.app.post("/_matrix/app/v1/unstable/org.matrix.msc3984/keys/query", this.onKeysQuery.bind(this));
        this.app.post("/unstable/org.matrix.msc3984/keys/query", this.onKeysQuery.bind(this));

        // We register the 404 handler in the `begin()` function to allow consumers to add their own endpoints.

        if (!this.registration.namespaces || !this.registration.namespaces.users || this.registration.namespaces.users.length === 0) {
            throw new Error("No user namespaces in registration");
        }
        if (this.registration.namespaces.users.length !== 1) {
            throw new Error("Too many user namespaces registered: expecting exactly one");
        }

        const userPrefix = (this.registration.namespaces.users[0].regex || "").split(":")[0];
        if (!userPrefix.endsWith(".*") && !userPrefix.endsWith(".+")) {
            this.userPrefix = null;
        } else {
            this.userPrefix = userPrefix.substring(0, userPrefix.length - 2); // trim off the .* part
        }

        if (!this.registration.namespaces?.aliases || this.registration.namespaces.aliases.length !== 1) {
            this.aliasPrefix = null;
        } else {
            this.aliasPrefix = (this.registration.namespaces.aliases[0].regex || "").split(":")[0];
            if (!this.aliasPrefix.endsWith(".*") && !this.aliasPrefix.endsWith(".+")) {
                this.aliasPrefix = null;
            } else {
                this.aliasPrefix = this.aliasPrefix.substring(0, this.aliasPrefix.length - 2); // trim off the .* part
            }
        }
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
     * Get the application service's "bot" MatrixClient (the sender_localpart).
     * Normally the botIntent should be used to ensure that the bot user is safely
     * handled.
     * @returns {MatrixClient} The client for the application service itself.
     */
    public get botClient(): MatrixClient {
        return this.botIntent.underlyingClient;
    }

    /**
     * Starts the application service, opening the bind address to begin processing requests.
     * @returns {Promise<void>} resolves when started
     */
    public begin(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // Per constructor, all other endpoints should 404.
            // Technically, according to https://spec.matrix.org/v1.6/application-service-api/#unknown-routes we should
            // be returning 405 for *known* endpoints with the wrong method.
            this.app.all("*", (req: express.Request, res: express.Response) => {
                res.status(404).json({ errcode: "M_UNRECOGNIZED", error: "Endpoint not implemented" });
            });

            this.appServer = this.app.listen(this.options.port, this.options.bindAddress, () => resolve());
        }).then(async () => {
            if (this.options.intentOptions?.encryption) {
                await this.botIntent.enableEncryption();
            } else {
                await this.botIntent.ensureRegistered();
            }
        });
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
        if (!this.userPrefix) {
            throw new Error(`Cannot use getUserIdForSuffix, provided namespace did not include a valid suffix`);
        }
        return `${this.userPrefix}${suffix}:${this.options.homeserverName}`;
    }

    /**
     * Gets an Intent for a given user ID.
     * @param {string} userId The user ID to get an Intent for.
     * @returns {Intent} An Intent for the user.
     */
    public getIntentForUserId(userId: string): Intent {
        let intent: Intent = this.intentsCache.get(userId);
        if (!intent) {
            intent = new Intent(this.options, userId, this);
            this.intentsCache.set(userId, intent);
            if (this.options.intentOptions.encryption) {
                intent.enableEncryption().catch(e => {
                    LogService.error("Appservice", `Failed to set up crypto on intent ${userId}`, e);
                    throw e; // re-throw to cause unhandled exception
                });
            }
        }
        return intent;
    }

    /**
     * Gets the suffix for the provided user ID. If the user ID is not a namespaced
     * user, this will return a falsey value.
     * @param {string} userId The user ID to parse
     * @returns {string} The suffix from the user ID.
     */
    public getSuffixForUserId(userId: string): string {
        if (!this.userPrefix) {
            throw new Error(`Cannot use getUserIdForSuffix, provided namespace did not include a valid suffix`);
        }
        if (!userId || !userId.startsWith(this.userPrefix) || !userId.endsWith(`:${this.options.homeserverName}`)) {
            // Invalid ID
            return null;
        }

        return userId
            .split('')
            .slice(this.userPrefix.length)
            .reverse()
            .slice(this.options.homeserverName.length + 1)
            .reverse()
            .join('');
    }

    /**
     * Determines if a given user ID is namespaced by this application service.
     * @param {string} userId The user ID to check
     * @returns {boolean} true if the user is namespaced, false otherwise
     */
    public isNamespacedUser(userId: string): boolean {
        return userId === this.botUserId ||
            !!this.registration.namespaces?.users.find(({ regex }) =>
                new RegExp(regex).test(userId),
            );
    }

    /**
     * Gets a full alias for a given localpart. The alias will be formed with the domain name given
     * in the constructor.
     * @param localpart The localpart to get an alias for.
     * @returns {string} The alias.
     */
    public getAlias(localpart: string): string {
        return `#${localpart}:${this.options.homeserverName}`;
    }

    /**
     * Gets a full alias for a given suffix. The prefix is automatically detected from the registration
     * options.
     * @param suffix The alias's suffix
     * @returns {string} The alias.
     */
    public getAliasForSuffix(suffix: string): string {
        if (!this.aliasPrefix) {
            throw new Error("Invalid configured alias prefix");
        }
        return `${this.aliasPrefix}${suffix}:${this.options.homeserverName}`;
    }

    /**
     * Gets the localpart of an alias for a given suffix. The prefix is automatically detected from the registration
     * options. Useful for the createRoom endpoint.
     * @param suffix The alias's suffix
     * @returns {string} The alias localpart.
     */
    public getAliasLocalpartForSuffix(suffix: string): string {
        if (!this.aliasPrefix) {
            throw new Error("Invalid configured alias prefix");
        }
        return `${this.aliasPrefix.substr(1)}${suffix}`;
    }

    /**
     * Gets the suffix for the provided alias. If the alias is not a namespaced
     * alias, this will return a falsey value.
     * @param {string} alias The alias to parse
     * @returns {string} The suffix from the alias.
     */
    public getSuffixForAlias(alias: string): string {
        if (!this.aliasPrefix) {
            throw new Error("Invalid configured alias prefix");
        }
        if (!alias || !this.isNamespacedAlias(alias)) {
            // Invalid ID
            return null;
        }

        return alias
            .split('')
            .slice(this.aliasPrefix.length)
            .reverse()
            .slice(this.options.homeserverName.length + 1)
            .reverse()
            .join('');
    }

    /**
     * Determines if a given alias is namespaced by this application service.
     * @param {string} alias The alias to check
     * @returns {boolean} true if the alias is namespaced, false otherwise
     */
    public isNamespacedAlias(alias: string): boolean {
        if (!this.aliasPrefix) {
            throw new Error("Invalid configured alias prefix");
        }
        return alias.startsWith(this.aliasPrefix) && alias.endsWith(":" + this.options.homeserverName);
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

    /**
     * Sets the visibility of a room in the appservice's room directory.
     * @param {string} networkId The network ID to group the room under.
     * @param {string} roomId The room ID to manipulate the visibility of.
     * @param {"public" | "private"} visibility The visibility to set for the room.
     * @return {Promise<any>} resolves when the visibility has been updated.
     */
    public setRoomDirectoryVisibility(networkId: string, roomId: string, visibility: "public" | "private") {
        roomId = encodeURIComponent(roomId);
        networkId = encodeURIComponent(networkId);
        return this.botClient.doRequest("PUT", `/_matrix/client/v3/directory/list/appservice/${networkId}/${roomId}`, null, {
            visibility,
        });
    }

    private async processEphemeralEvent(event: any): Promise<any> {
        if (!event) return event;
        if (!this.eventProcessors[event["type"]]) return event;

        for (const processor of this.eventProcessors[event["type"]]) {
            await processor.processEvent(event, this.botIntent.underlyingClient, EventKind.EphemeralEvent);
        }

        return event;
    }

    private async processEvent(event: any): Promise<any> {
        if (!event) return event;
        if (!this.eventProcessors[event["type"]]) return event;

        for (const processor of this.eventProcessors[event["type"]]) {
            await processor.processEvent(event, this.botIntent.underlyingClient, EventKind.RoomEvent);
        }

        return event;
    }

    private async processMembershipEvent(event: any): Promise<void> {
        if (!event["content"]) return;

        const domain = new UserID(event['state_key']).domain;
        const botDomain = new UserID(this.botUserId).domain;
        if (domain !== botDomain) return; // can't be impersonated, so don't try

        // Update the target intent's joined rooms (fixes transition errors with the cache, like join->kick->join)
        const intent = this.getIntentForUserId(event['state_key']);
        await intent.refreshJoinedRooms();

        const targetMembership = event["content"]["membership"];
        if (targetMembership === "join") {
            this.emit("room.join", event["room_id"], event);
            await intent.underlyingClient.crypto?.onRoomJoin(event["room_id"]);
        } else if (targetMembership === "ban" || targetMembership === "leave") {
            this.emit("room.leave", event["room_id"], event);
        } else if (targetMembership === "invite") {
            this.emit("room.invite", event["room_id"], event);
        }
    }

    private isAuthed(req: any): boolean {
        let providedToken = req.query ? req.query["access_token"] : null;
        if (req.headers && req.headers["authorization"]) {
            const authHeader = req.headers["authorization"];
            if (!authHeader.startsWith("Bearer ")) providedToken = null;
            else providedToken = authHeader.substring("Bearer ".length);
        }

        return providedToken === this.registration.hs_token;
    }

    private async onTransaction(req: express.Request, res: express.Response): Promise<any> {
        if (!this.isAuthed(req)) {
            res.status(401).json({ errcode: "AUTH_FAILED", error: "Authentication failed" });
            return;
        }

        if (typeof (req.body) !== "object") {
            res.status(400).json({ errcode: "BAD_REQUEST", error: "Expected JSON" });
            return;
        }

        if (!req.body["events"] || !Array.isArray(req.body["events"])) {
            res.status(400).json({ errcode: "BAD_REQUEST", error: "Invalid JSON: expected events" });
            return;
        }

        const txnId = req.params["txnId"];

        if (await Promise.resolve(this.storage.isTransactionCompleted(txnId))) {
            res.status(200).json({});
            return;
        }

        if (this.pendingTransactions[txnId]) {
            try {
                await this.pendingTransactions[txnId];
                res.status(200).json({});
            } catch (e) {
                LogService.error("Appservice", e);
                res.status(500).json({});
            }
            return;
        }

        LogService.info("Appservice", "Processing transaction " + txnId);
        // eslint-disable-next-line no-async-promise-executor
        this.pendingTransactions[txnId] = new Promise<void>(async (resolve) => {
            // Process all the crypto stuff first to ensure that future transactions (if not this one)
            // will decrypt successfully. We start with EDUs because we need structures to put counts
            // and such into in a later stage, and EDUs are independent of crypto.

            const byUserId: {
                [userId: string]: {
                    counts: Record<string, Number>;
                    toDevice: any[];
                    unusedFallbacks: OTKAlgorithm[];
                };
            } = {};

            const orderedEdus = [];
            if (Array.isArray(req.body["de.sorunome.msc2409.to_device"])) {
                orderedEdus.push(...req.body["de.sorunome.msc2409.to_device"].map(e => ({
                    ...e,
                    unsigned: {
                        ...e['unsigned'],
                        [EDU_ANNOTATION_KEY]: EduAnnotation.ToDevice,
                    },
                })));
            }
            if (Array.isArray(req.body["de.sorunome.msc2409.ephemeral"])) {
                orderedEdus.push(...req.body["de.sorunome.msc2409.ephemeral"].map(e => ({
                    ...e,
                    unsigned: {
                        ...e['unsigned'],
                        [EDU_ANNOTATION_KEY]: EduAnnotation.Ephemeral,
                    },
                })));
            }
            for (let event of orderedEdus) {
                if (event['edu_type']) event['type'] = event['edu_type']; // handle property change during MSC2409's course

                LogService.info("Appservice", `Processing ${event['unsigned'][EDU_ANNOTATION_KEY]} event of type ${event["type"]}`);
                event = await this.processEphemeralEvent(event);

                // These events aren't tied to rooms, so just emit them generically
                this.emit("ephemeral.event", event);

                if (this.cryptoStorage && (event["type"] === "m.room.encrypted" || event.unsigned?.[EDU_ANNOTATION_KEY] === EduAnnotation.ToDevice)) {
                    const toUser = event["to_user_id"];
                    const intent = this.getIntentForUserId(toUser);
                    await intent.enableEncryption();

                    if (!byUserId[toUser]) byUserId[toUser] = { counts: null, toDevice: null, unusedFallbacks: null };
                    if (!byUserId[toUser].toDevice) byUserId[toUser].toDevice = [];
                    byUserId[toUser].toDevice.push(event);
                }
            }

            const deviceLists: { changed: string[], removed: string[] } = req.body["org.matrix.msc3202.device_lists"] ?? {
                changed: [],
                removed: [],
            };

            if (!deviceLists.changed) deviceLists.changed = [];
            if (!deviceLists.removed) deviceLists.removed = [];

            if (deviceLists.changed.length || deviceLists.removed.length) {
                this.emit("device_lists", deviceLists);
            }

            let otks = req.body["org.matrix.msc3202.device_one_time_keys_count"];
            const otks2 = req.body["org.matrix.msc3202.device_one_time_key_counts"];
            if (otks2 && !otks) {
                LogService.warn(
                    "Appservice",
                    "Your homeserver is using an outdated field (device_one_time_key_counts) to talk to this appservice. " +
                    "If you're using Synapse, please upgrade to 1.73.0 or higher.",
                );
                otks = otks2;
            }
            if (otks) {
                this.emit("otk.counts", otks);
            }
            if (otks && this.cryptoStorage) {
                for (const userId of Object.keys(otks)) {
                    const intent = this.getIntentForUserId(userId);
                    await intent.enableEncryption();
                    const otksForUser = otks[userId][intent.underlyingClient.crypto.clientDeviceId];
                    if (otksForUser) {
                        if (!byUserId[userId]) {
                            byUserId[userId] = {
                                counts: null,
                                toDevice: null,
                                unusedFallbacks: null,
                            };
                        }
                        byUserId[userId].counts = otksForUser;
                    }
                }
            }

            const fallbacks = req.body["org.matrix.msc3202.device_unused_fallback_key_types"];
            if (fallbacks) {
                this.emit("otk.unused_fallback_keys", fallbacks);
            }
            if (fallbacks && this.cryptoStorage) {
                for (const userId of Object.keys(fallbacks)) {
                    const intent = this.getIntentForUserId(userId);
                    await intent.enableEncryption();
                    const fallbacksForUser = fallbacks[userId][intent.underlyingClient.crypto.clientDeviceId];
                    if (Array.isArray(fallbacksForUser) && !fallbacksForUser.includes(OTKAlgorithm.Signed)) {
                        if (!byUserId[userId]) {
                            byUserId[userId] = {
                                counts: null,
                                toDevice: null,
                                unusedFallbacks: null,
                            };
                        }
                        byUserId[userId].unusedFallbacks = fallbacksForUser;
                    }
                }
            }

            if (this.cryptoStorage) {
                for (const userId of Object.keys(byUserId)) {
                    const intent = this.getIntentForUserId(userId);
                    await intent.enableEncryption();
                    const info = byUserId[userId];
                    const userStorage = this.storage.storageForUser(userId);

                    if (!info.toDevice) info.toDevice = [];
                    if (!info.unusedFallbacks) info.unusedFallbacks = JSON.parse(await userStorage.readValue("last_unused_fallbacks") || "[]");
                    if (!info.counts) info.counts = JSON.parse(await userStorage.readValue("last_counts") || "{}");

                    LogService.info("Appservice", `Updating crypto state for ${userId}`);
                    await intent.underlyingClient.crypto.updateSyncData(info.toDevice, info.counts, info.unusedFallbacks, deviceLists.changed, deviceLists.removed);
                }
            }

            for (let event of req.body["events"]) {
                LogService.info("Appservice", `Processing event of type ${event["type"]}`);
                event = await this.processEvent(event);
                if (event['type'] === 'm.room.encrypted') {
                    this.emit("room.encrypted_event", event["room_id"], event);
                    if (this.cryptoStorage) {
                        try {
                            const encrypted = new EncryptedRoomEvent(event);
                            const roomId = event['room_id'];
                            try {
                                event = (await this.botClient.crypto.decryptRoomEvent(encrypted, roomId)).raw;
                                event = await this.processEvent(event);
                                this.emit("room.decrypted_event", roomId, event);

                                // For logging purposes: show that the event was decrypted
                                LogService.info("Appservice", `Processing decrypted event of type ${event["type"]}`);
                            } catch (e1) {
                                LogService.warn("Appservice", `Bot client was not able to decrypt ${roomId} ${event['event_id']} - trying other intents`);

                                let tryUserId: string;
                                try {
                                    // TODO: This could be more efficient
                                    const userIdsInRoom = await this.botClient.getJoinedRoomMembers(roomId);
                                    tryUserId = userIdsInRoom.find(u => this.isNamespacedUser(u));
                                } catch (e) {
                                    LogService.error("Appservice", "Failed to get members of room - cannot decrypt message");
                                }

                                if (tryUserId) {
                                    const intent = this.getIntentForUserId(tryUserId);

                                    event = (await intent.underlyingClient.crypto.decryptRoomEvent(encrypted, roomId)).raw;
                                    event = await this.processEvent(event);
                                    this.emit("room.decrypted_event", roomId, event);

                                    // For logging purposes: show that the event was decrypted
                                    LogService.info("Appservice", `Processing decrypted event of type ${event["type"]}`);
                                } else {
                                    // noinspection ExceptionCaughtLocallyJS
                                    throw e1;
                                }
                            }
                        } catch (e) {
                            LogService.error("Appservice", `Decryption error on ${event['room_id']} ${event['event_id']}`, e);
                            this.emit("room.failed_decryption", event['room_id'], event, e);
                        }
                    }
                }
                this.emit("room.event", event["room_id"], event);
                if (event['type'] === 'm.room.message') {
                    this.emit("room.message", event["room_id"], event);
                }
                if (event['type'] === 'm.room.member' && this.isNamespacedUser(event['state_key'])) {
                    await this.processMembershipEvent(event);
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
            await Promise.resolve(this.storage.setTransactionCompleted(txnId));
            res.status(200).json({});
        } catch (e) {
            LogService.error("Appservice", e);
            res.status(500).json({});
        }
    }

    private async onUser(req: express.Request, res: express.Response): Promise<any> {
        if (!this.isAuthed(req)) {
            res.status(401).json({ errcode: "AUTH_FAILED", error: "Authentication failed" });
            return;
        }

        const userId = req.params["userId"];
        this.emit("query.user", userId, async (result) => {
            if (result.then) result = await result;
            if (result === false) {
                res.status(404).json({ errcode: "USER_DOES_NOT_EXIST", error: "User not created" });
            } else {
                const intent = this.getIntentForUserId(userId);
                await intent.ensureRegistered();
                if (result.display_name) await intent.underlyingClient.setDisplayName(result.display_name);
                if (result.avatar_mxc) await intent.underlyingClient.setAvatarUrl(result.avatar_mxc);
                res.status(200).json(result); // return result for debugging + testing
            }
        });
    }

    private async onRoomAlias(req: express.Request, res: express.Response): Promise<any> {
        if (!this.isAuthed(req)) {
            res.status(401).json({ errcode: "AUTH_FAILED", error: "Authentication failed" });
            return;
        }

        const roomAlias = req.params["roomAlias"];
        this.emit("query.room", roomAlias, async (result) => {
            if (result.then) result = await result;
            if (result === false) {
                res.status(404).json({ errcode: "ROOM_DOES_NOT_EXIST", error: "Room not created" });
            } else {
                const intent = this.botIntent;
                await intent.ensureRegistered();

                result["room_alias_name"] = roomAlias.substring(1).split(':')[0];
                result["__roomId"] = await intent.underlyingClient.createRoom(result);

                res.status(200).json(result); // return result for debugging + testing
            }
        });
    }

    private async onKeysClaim(req: express.Request, res: express.Response): Promise<any> {
        if (!this.isAuthed(req)) {
            res.status(401).json({ errcode: "AUTH_FAILED", error: "Authentication failed" });
            return;
        }

        if (typeof (req.body) !== "object") {
            res.status(400).json({ errcode: "BAD_REQUEST", error: "Expected JSON" });
            return;
        }

        let responded = false;
        this.emit("query.key_claim", req.body, (result: MSC3983KeyClaimResponse | Promise<MSC3983KeyClaimResponse> | undefined | null) => {
            responded = true;

            const handleResult = (result2: MSC3983KeyClaimResponse) => {
                if (!result2) {
                    res.status(404).json({ errcode: "M_UNRECOGNIZED", error: "Endpoint not implemented" });
                    return;
                }

                res.status(200).json(result2);
            };

            Promise.resolve(result).then(r => handleResult(r)).catch(e => {
                LogService.error("Appservice", "Error handling key claim API", e);
                res.status(500).json({ errcode: "M_UNKNOWN", error: "Error handling key claim API" });
            });
        });
        if (!responded) {
            res.status(404).json({ errcode: "M_UNRECOGNIZED", error: "Endpoint not implemented" });
        }
    }

    private async onKeysQuery(req: express.Request, res: express.Response): Promise<any> {
        if (!this.isAuthed(req)) {
            res.status(401).json({ errcode: "AUTH_FAILED", error: "Authentication failed" });
            return;
        }

        if (typeof (req.body) !== "object") {
            res.status(400).json({ errcode: "BAD_REQUEST", error: "Expected JSON" });
            return;
        }

        let responded = false;
        this.emit("query.key", req.body, (result: MSC3984KeyQueryResponse | Promise<MSC3984KeyQueryResponse> | undefined | null) => {
            responded = true;

            const handleResult = (result2: MSC3984KeyQueryResponse) => {
                if (!result2) {
                    res.status(404).json({ errcode: "M_UNRECOGNIZED", error: "Endpoint not implemented" });
                    return;
                }

                // Implementation note: we could probably query the device keys from our storage if we wanted to.

                res.status(200).json(result2);
            };

            Promise.resolve(result).then(r => handleResult(r)).catch(e => {
                LogService.error("Appservice", "Error handling key query API", e);
                res.status(500).json({ errcode: "M_UNKNOWN", error: "Error handling key query API" });
            });
        });
        if (!responded) {
            res.status(404).json({ errcode: "M_UNRECOGNIZED", error: "Endpoint not implemented" });
        }
    }

    private onThirdpartyProtocol(req: express.Request, res: express.Response) {
        if (!this.isAuthed(req)) {
            res.status(401).json({ errcode: "AUTH_FAILED", error: "Authentication failed" });
            return;
        }

        const protocol = req.params["protocol"];
        if (!this.registration.protocols.includes(protocol)) {
            res.status(404).json({
                errcode: "PROTOCOL_NOT_HANDLED",
                error: "Protocol is not handled by this appservice",
            });
            return;
        }
        this.emit("thirdparty.protocol", protocol, (protocolResponse: IApplicationServiceProtocol) => {
            res.status(200).json(protocolResponse);
        });
    }

    private handleThirdpartyObject(req: express.Request, res: express.Response, objType: string, matrixId?: string) {
        if (!this.isAuthed(req)) {
            res.status(401).json({ errcode: "AUTH_FAILED", error: "Authentication failed" });
            return;
        }

        const protocol = req.params["protocol"];
        const responseFunc = (items: any[]) => {
            if (items && items.length > 0) {
                res.status(200).json(items);
                return;
            }
            res.status(404).json({
                errcode: "NO_MAPPING_FOUND",
                error: "No mappings found",
            });
        };

        // Lookup remote objects(s)
        if (protocol) { // If protocol is given, we are looking up a objects based on fields
            if (!this.registration.protocols.includes(protocol)) {
                res.status(404).json({
                    errcode: "PROTOCOL_NOT_HANDLED",
                    error: "Protocol is not handled by this appservice",
                });
                return;
            }
            // Remove the access_token
            delete req.query.access_token;
            this.emit(`thirdparty.${objType}.remote`, protocol, req.query, responseFunc);
            return;
        } else if (matrixId) { // If a user ID is given, we are looking up a remote objects based on a id
            this.emit(`thirdparty.${objType}.matrix`, matrixId, responseFunc);
            return;
        }

        res.status(400).json({
            errcode: "INVALID_PARAMETERS",
            error: "Invalid parameters given",
        });
    }

    private onThirdpartyUser(req: express.Request, res: express.Response) {
        return this.handleThirdpartyObject(req, res, "user", req.query["userid"] as string);
    }

    private onThirdpartyLocation(req: express.Request, res: express.Response) {
        return this.handleThirdpartyObject(req, res, "location", req.query["alias"] as string);
    }
}

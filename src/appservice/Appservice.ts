import * as express from "express";
import { Intent } from "./Intent";
import { IAppserviceStorageProvider } from "../storage/IAppserviceStorageProvider";

/**
 * Represents an application service's registration file. This is expected to be
 * loaded from another source, such as a YAML file.
 */
export interface IAppserviceRegistration {
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
}

/**
 * Represents an application service. This provides helper utilities such as tracking
 * of user intents (clients that are aware of their membership in rooms). 
 */
export class Appservice {

    private app = express();
    private userPrefix: string;
    private intents: { [userId: string]: Intent } = {};

    /**
     * Creates a new application service.
     * @param {IAppserviceOptions} options The options for the application service.
     * @param {IAppserviceRegistration} registration The registration for the application service.
     * @param {IAppserviceStorageProvider} storage The storage provider for the application service.
     */
    constructor(private options: IAppserviceOptions, protected registration: IAppserviceRegistration, private storage: IAppserviceStorageProvider) {
        this.app.put("/transactions/:txnId", this.onTransaction);
        // Everything else can 404

        // TODO: Should we permit other user namespaces and instead error when trying to use doSomethingBySuffix()?

        if (!registration.namespaces || !registration.namespaces.users || registration.namespaces.users.length === 0) {
            throw new Error("No user namespaces in registration");
        }
        if (registration.namespaces.users.length !== 1) {
            throw new Error("Too many user namespaces registered: expecting exactly one");
        }

        this.userPrefix = (registration.namespaces.users[0].regex || "").split(":")[0];
        if (!this.userPrefix.endsWith(".*")) {
            throw new Error("Expected user namespace to be a prefix");
        }
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
     */
    public begin(): void {
        this.app.listen(this.options.port, this.options.bindAddress);
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
     * @param {string} userId The user ID to get an Intent for,
     * @returns {Intent} An Intent for the user.
     */
    public getIntentForUserId(userId: string): Intent {
        if (!this.intents[userId]) {
            this.intents[userId] = new Intent(this.options, this.registration, this.storage, userId);
        }
        return this.intents[userId];
    }

    private onTransaction(req, res): void {
        console.log(req.body);
        res.status(200).send({});
    }
}

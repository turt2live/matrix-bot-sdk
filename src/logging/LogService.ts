import { ConsoleLogger } from "./ConsoleLogger";
import { ILogger } from "./ILogger";

/**
 * The log levels to log at.
 * @category Logging
 */
export class LogLevel {

    /**
     * The TRACE channel
     */
    public static readonly TRACE = new LogLevel("TRACE", -1);

    /**
     * The DEBUG channel
     */
    public static readonly DEBUG = new LogLevel("DEBUG", 0);

    /**
     * The INFO channel
     */
    public static readonly INFO = new LogLevel("INFO", 1);

    /**
     * The WARN channel
     */
    public static readonly WARN = new LogLevel("WARN", 2);

    /**
     * The ERROR channel
     */
    public static readonly ERROR = new LogLevel("ERROR", 3);

    private constructor(private level: string, private sequence: number) {
    }

    public includes(level: LogLevel): boolean {
        return level.sequence >= this.sequence;
    }

    public toString(): string {
        return this.level;
    }

    public static fromString(level: string, defaultLevel = LogLevel.DEBUG): LogLevel {
        if (!level) return defaultLevel;
        if (level.toUpperCase() === LogLevel.TRACE.level) return LogLevel.TRACE;
        if (level.toUpperCase() === LogLevel.DEBUG.level) return LogLevel.DEBUG;
        if (level.toUpperCase() === LogLevel.INFO.level) return LogLevel.INFO;
        if (level.toUpperCase() === LogLevel.WARN.level) return LogLevel.WARN;
        if (level.toUpperCase() === LogLevel.ERROR.level) return LogLevel.ERROR;
        return defaultLevel;
    }
}

/**
 * Service class for logging in the bot-sdk
 * @category Logging
 */
export class LogService {

    private static logger: ILogger = new ConsoleLogger();
    private static logLevel: LogLevel = LogLevel.INFO;

    private constructor() {
    }

    /**
     * The level at which the LogService is running.
     */
    public static get level(): LogLevel {
        return this.logLevel;
    }

    /**
     * Sets the log level for this logger. Defaults to DEBUG.
     * @param {LogLevel} level the new log level
     */
    public static setLevel(level: LogLevel) {
        LogService.logLevel = level || LogLevel.DEBUG;
    }

    /**
     * Sets a new logger for the Log Service
     * @param {ILogger} logger the new logger
     */
    public static setLogger(logger: ILogger) {
        LogService.logger = logger;
    }

    /**
     * Logs to the TRACE channel
     * @param {string} module The module being logged
     * @param {any[]} messageOrObject The data to log
     */
    public static trace(module: string, ...messageOrObject: any[]) {
        if (!LogService.logLevel.includes(LogLevel.TRACE)) return;
        LogService.logger.trace(module, ...messageOrObject);
    }

    /**
     * Logs to the DEBUG channel
     * @param {string} module The module being logged
     * @param {any[]} messageOrObject The data to log
     */
    public static debug(module: string, ...messageOrObject: any[]) {
        if (!LogService.logLevel.includes(LogLevel.DEBUG)) return;
        LogService.logger.debug(module, ...messageOrObject);
    }

    /**
     * Logs to the ERROR channel
     * @param {string} module The module being logged
     * @param {any[]} messageOrObject The data to log
     */
    public static error(module: string, ...messageOrObject: any[]) {
        if (!LogService.logLevel.includes(LogLevel.ERROR)) return;
        LogService.logger.error(module, ...messageOrObject);
    }

    /**
     * Logs to the INFO channel
     * @param {string} module The module being logged
     * @param {any[]} messageOrObject The data to log
     */
    public static info(module: string, ...messageOrObject: any[]) {
        if (!LogService.logLevel.includes(LogLevel.INFO)) return;
        LogService.logger.info(module, ...messageOrObject);
    }

    /**
     * Logs to the WARN channel
     * @param {string} module The module being logged
     * @param {any[]} messageOrObject The data to log
     */
    public static warn(module: string, ...messageOrObject: any[]) {
        if (!LogService.logLevel.includes(LogLevel.WARN)) return;
        LogService.logger.warn(module, ...messageOrObject);
    }
}

/**
 * Extracts the useful part of a request's error into something loggable.
 * @param {Error} err The error to parse.
 * @returns {*} The extracted error, or the given error if unaltered.
 * @category Logging
 */
export function extractRequestError(err: Error): any {
    if (err?.['body']) {
        return err['body'];
    }
    return err;
}

import { ConsoleLogger } from "./ConsoleLogger";
import { ILogger } from "./ILogger";

export class LogService {

    private static logger: ILogger = new ConsoleLogger();

    private constructor() {
    }

    /**
     * Sets a new logger for the Log Service
     * @param {ILogger} logger the new logger
     */
    public static setLogger(logger: ILogger) {
        LogService.logger = logger;
    }

    /**
     * Logs to the DEBUG channel
     * @param {string} module The module being logged
     * @param {any[]} messageOrObject The data to log
     */
    public static debug(module: string, ...messageOrObject: any[]) {
        LogService.logger.debug(module, ...messageOrObject);
    }

    /**
     * Logs to the ERROR channel
     * @param {string} module The module being logged
     * @param {any[]} messageOrObject The data to log
     */
    public static error(module: string, ...messageOrObject: any[]) {
        LogService.logger.error(module, ...messageOrObject);
    }

    /**
     * Logs to the INFO channel
     * @param {string} module The module being logged
     * @param {any[]} messageOrObject The data to log
     */
    public static info(module: string, ...messageOrObject: any[]) {
        LogService.logger.info(module, ...messageOrObject);
    }

    /**
     * Logs to the WARN channel
     * @param {string} module The module being logged
     * @param {any[]} messageOrObject The data to log
     */
    public static warn(module: string, ...messageOrObject: any[]) {
        LogService.logger.warn(module, ...messageOrObject);
    }
}
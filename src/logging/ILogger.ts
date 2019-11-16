/**
 * Represents a logger
 * @category Logging
 */
export interface ILogger {
    /**
     * Logs to the INFO channel
     * @param {string} module The module being logged
     * @param {*[]} messageOrObject The data to log
     */
    info(module: string, ...messageOrObject: any[]);

    /**
     * Logs to the WARN channel
     * @param {string} module The module being logged
     * @param {*[]} messageOrObject The data to log
     */
    warn(module: string, ...messageOrObject: any[]);

    /**
     * Logs to the ERROR channel
     * @param {string} module The module being logged
     * @param {*[]} messageOrObject The data to log
     */
    error(module: string, ...messageOrObject: any[]);

    /**
     * Logs to the DEBUG channel
     * @param {string} module The module being logged
     * @param {*[]} messageOrObject The data to log
     */
    debug(module: string, ...messageOrObject: any[]);
}

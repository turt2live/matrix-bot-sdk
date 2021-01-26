import { ILogger } from "./ILogger";

/**
 * Logs to the console in a plain format. This is the default logger.
 * @category Logging
 */
export class ConsoleLogger implements ILogger {
    public trace(module: string, ...messageOrObject: any[]) {
        console.trace(module, ...messageOrObject);
    }

    public debug(module: string, ...messageOrObject: any[]) {
        console.debug(module, ...messageOrObject);
    }

    public error(module: string, ...messageOrObject: any[]) {
        console.error(module, ...messageOrObject);
    }

    public info(module: string, ...messageOrObject: any[]) {
        console.log(module, ...messageOrObject);
    }

    public warn(module: string, ...messageOrObject: any[]) {
        console.warn(module, ...messageOrObject);
    }

}

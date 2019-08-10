import { ILogger } from "./ILogger";
import chalk from "chalk";

export class RichConsoleLogger implements ILogger {

    private chalkDebug = chalk.cyan;
    private chalkInfo = chalk.green;
    private chalkWarning = chalk.yellow;
    private chalkError = chalk.bold.red;
    private chalkTimestamp = chalk.grey;
    private chalkModule = chalk.grey;

    private now(): string {
        const now = new Date(Date.now()).toUTCString();
        return this.chalkTimestamp(now);
    }

    public debug(module: string, ...messageOrObject: any[]) {
        console.debug(
            this.now(),
            this.chalkDebug("[DEBUG]"),
            this.chalkModule(`[${module}]`),
            ...messageOrObject,
        );
    }

    public error(module: string, ...messageOrObject: any[]) {
        console.error(
            this.now(),
            this.chalkError("[ERROR]"),
            this.chalkModule(`[${module}]`),
            ...messageOrObject,
        );
    }

    public info(module: string, ...messageOrObject: any[]) {
        console.log(
            this.now(),
            this.chalkInfo("[INFO]"),
            this.chalkModule(`[${module}]`),
            ...messageOrObject,
        );
    }

    public warn(module: string, ...messageOrObject: any[]) {
        console.warn(
            this.now(),
            this.chalkWarning("[WARN]"),
            this.chalkModule(`[${module}]`),
            ...messageOrObject,
        );
    }

}
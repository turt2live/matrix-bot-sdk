import { ILogger } from "./ILogger";

export class ConsoleLogger implements ILogger {
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
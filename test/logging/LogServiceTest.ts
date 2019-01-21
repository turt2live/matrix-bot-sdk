import { ConsoleLogger, LogService } from "../../src";
import * as expect from "expect";
import * as simple from "simple-mock";

// @ts-ignore
describe('LogService', () => {
    // @ts-ignore
    afterEach(() => LogService.setLogger(new ConsoleLogger()));

    // @ts-ignore
    it('should log to the INFO channel', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, a1, a2) => {
            expect(m).toEqual(module);
            expect(a1).toEqual(a1);
            expect(a2).toEqual(a2);
        });

        LogService.setLogger({info: logSpy, warn: null, error: null, debug: null});
        LogService.info(module, a1, a2);
        expect(logSpy.callCount).toBe(1);
    });

    // @ts-ignore
    it('should log to the ERROR channel', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, a1, a2) => {
            expect(m).toEqual(module);
            expect(a1).toEqual(a1);
            expect(a2).toEqual(a2);
        });

        LogService.setLogger({info: null, warn: null, error: logSpy, debug: null});
        LogService.error(module, a1, a2);
        expect(logSpy.callCount).toBe(1);
    });

    // @ts-ignore
    it('should log to the WARN channel', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, a1, a2) => {
            expect(m).toEqual(module);
            expect(a1).toEqual(a1);
            expect(a2).toEqual(a2);
        });

        LogService.setLogger({info: null, warn: logSpy, error: null, debug: null});
        LogService.warn(module, a1, a2);
        expect(logSpy.callCount).toBe(1);
    });

    // @ts-ignore
    it('should log to the DEBUG channel', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, a1, a2) => {
            expect(m).toEqual(module);
            expect(a1).toEqual(a1);
            expect(a2).toEqual(a2);
        });

        LogService.setLogger({info: null, warn: null, error: null, debug: logSpy});
        LogService.debug(module, a1, a2);
        expect(logSpy.callCount).toBe(1);
    });
});

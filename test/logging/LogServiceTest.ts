import { ConsoleLogger, LogLevel, LogService } from "../../src";
import * as expect from "expect";
import * as simple from "simple-mock";


describe('LogService', () => {

    afterEach(() => LogService.setLogger(new ConsoleLogger()));


    it('should log to the INFO channel', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, arg1, arg2) => {
            expect(m).toEqual(module);
            expect(arg1).toEqual(a1);
            expect(arg2).toEqual(a2);
        });

        LogService.setLogger({info: logSpy, warn: null, error: null, debug: null});
        LogService.info(module, a1, a2);
        expect(logSpy.callCount).toBe(1);
    });


    it('should log to the ERROR channel', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, arg1, arg2) => {
            expect(m).toEqual(module);
            expect(arg1).toEqual(a1);
            expect(arg2).toEqual(a2);
        });

        LogService.setLogger({info: null, warn: null, error: logSpy, debug: null});
        LogService.error(module, a1, a2);
        expect(logSpy.callCount).toBe(1);
    });


    it('should log to the WARN channel', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, arg1, arg2) => {
            expect(m).toEqual(module);
            expect(arg1).toEqual(a1);
            expect(arg2).toEqual(a2);
        });

        LogService.setLogger({info: null, warn: logSpy, error: null, debug: null});
        LogService.warn(module, a1, a2);
        expect(logSpy.callCount).toBe(1);
    });


    it('should log to the DEBUG channel', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, arg1, arg2) => {
            expect(m).toEqual(module);
            expect(arg1).toEqual(a1);
            expect(arg2).toEqual(a2);
        });

        LogService.setLogger({info: null, warn: null, error: null, debug: logSpy});
        LogService.debug(module, a1, a2);
        expect(logSpy.callCount).toBe(1);
    });


    it('should not log to the DEBUG channel when the log level is higher', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, arg1, arg2) => {
            expect(m).toEqual(module);
            expect(arg1).toEqual(a1);
            expect(arg2).toEqual(a2);
        });

        LogService.setLogger({info: null, warn: null, error: null, debug: logSpy});
        LogService.setLevel(LogLevel.INFO);
        LogService.debug(module, a1, a2);
        expect(logSpy.callCount).toBe(0);
    });


    it('should not log to the INFO channel when the log level is higher', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, arg1, arg2) => {
            expect(m).toEqual(module);
            expect(arg1).toEqual(a1);
            expect(arg2).toEqual(a2);
        });

        LogService.setLogger({info: logSpy, warn: null, error: null, debug: null});
        LogService.setLevel(LogLevel.WARN);
        LogService.info(module, a1, a2);
        expect(logSpy.callCount).toBe(0);
    });


    it('should not log to the WARN channel when the log level is higher', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, arg1, arg2) => {
            expect(m).toEqual(module);
            expect(arg1).toEqual(a1);
            expect(arg2).toEqual(a2);
        });

        LogService.setLogger({info: null, warn: logSpy, error: null, debug: null});
        LogService.setLevel(LogLevel.ERROR);
        LogService.warn(module, a1, a2);
        expect(logSpy.callCount).toBe(0);
    });
});

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

        LogService.setLogger({info: logSpy, warn: null, error: null, debug: null, trace: null});
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

        LogService.setLogger({info: null, warn: null, error: logSpy, debug: null, trace: null});
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

        LogService.setLogger({info: null, warn: logSpy, error: null, debug: null, trace: null});
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

        LogService.setLevel(LogLevel.DEBUG);
        LogService.setLogger({info: null, warn: null, error: null, debug: logSpy, trace: null});
        LogService.debug(module, a1, a2);
        expect(logSpy.callCount).toBe(1);
    });

    it('should log to the TRACE channel', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, arg1, arg2) => {
            expect(m).toEqual(module);
            expect(arg1).toEqual(a1);
            expect(arg2).toEqual(a2);
        });

        LogService.setLevel(LogLevel.TRACE);
        LogService.setLogger({info: null, warn: null, error: null, debug: null, trace: logSpy});
        LogService.trace(module, a1, a2);
        expect(logSpy.callCount).toBe(1);
    });

    it('should not log to the TRACE channel when the log level is higher', () => {
        const module = "Testing Module";
        const a1 = "This is a message";
        const a2 = {hello: "world"};

        const logSpy = simple.stub().callFn((m, arg1, arg2) => {
            expect(m).toEqual(module);
            expect(arg1).toEqual(a1);
            expect(arg2).toEqual(a2);
        });

        LogService.setLogger({info: null, warn: null, error: null, debug: null, trace: logSpy});
        LogService.setLevel(LogLevel.DEBUG);
        LogService.trace(module, a1, a2);
        expect(logSpy.callCount).toBe(0);
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

        LogService.setLogger({info: null, warn: null, error: null, debug: logSpy, trace: null});
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

        LogService.setLogger({info: logSpy, warn: null, error: null, debug: null, trace: null});
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

        LogService.setLogger({info: null, warn: logSpy, error: null, debug: null, trace: null});
        LogService.setLevel(LogLevel.ERROR);
        LogService.warn(module, a1, a2);
        expect(logSpy.callCount).toBe(0);
    });

    it('should mute the requested modules', () => {
        const mutedModule = "Mute Me";
        const unmutedModule = "Hello World";

        const logSpy = simple.stub().callFn((m) => {
            expect(m).toEqual(unmutedModule);
        });

        LogService.setLogger({info: logSpy, warn: logSpy, error: logSpy, debug: logSpy, trace: logSpy});
        LogService.setLevel(LogLevel.TRACE);
        LogService.muteModule(mutedModule);

        LogService.trace(mutedModule, "test");
        LogService.debug(mutedModule, "test");
        LogService.info(mutedModule, "test");
        LogService.warn(mutedModule, "test");
        LogService.error(mutedModule, "test");

        LogService.trace(unmutedModule, "test");
        LogService.debug(unmutedModule, "test");
        LogService.info(unmutedModule, "test");
        LogService.warn(unmutedModule, "test");
        LogService.error(unmutedModule, "test");

        expect(logSpy.callCount).toBe(5);
    });
});

import * as expect from "expect";
import * as simple from "simple-mock";
import { timedMatrixClientFunctionCall, timedIntentFunctionCall, Metrics } from "../../src";

class InterceptedClass {
    constructor(private metrics: Metrics, private interceptedFn: (i: number) => number) {
        this.client = { userId: 5678 };
    }

    @timedMatrixClientFunctionCall()
    async matrixClientIntercepted(i: number): Promise<number> {
        return this.interceptedFn(i);
    }

    @timedIntentFunctionCall()
    async intentIntercepted(i: number) : Promise<number> {
        return this.interceptedFn(i);
    }
}

// Not a fan of this but the promise with metrics chained isn't returned, just the original before the metrics were chained
// I think this is deliberate so that metrics slow down any promises that later get chained
// If we could return the promise with metrics chained this can go away.
const waitingPromise = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('decorators', () => {
    describe('timedMatrixClientFunctionCall', () => {
        it('should call the intercepted method with provided args', async () => {
            const amount = 1234;
            const interceptedFn = simple.stub().callFn((i: number) => {
                expect(i).toBe(amount);
                return -1;
            });

            const interceptedClass = new InterceptedClass(new Metrics(), interceptedFn);
            await interceptedClass.matrixClientIntercepted(amount);

            expect(interceptedFn.callCount).toBe(1);
        });

        it('should return the result of the intercepted method', async () => {
            const amount = 1234;

            const interceptedClass = new InterceptedClass(new Metrics(), (i) => amount);
            const result = await interceptedClass.matrixClientIntercepted(amount * 2);

            expect(result).toBe(amount);
        });

        it('should expose errors from the intercepted method', async () => {
            const reason = "Bad things";
            const interceptedClass = new InterceptedClass(new Metrics(), () => {
                throw new Error(reason);
            });

            await expect(interceptedClass.matrixClientIntercepted(1234)).rejects.toThrow(reason);
        });

        it('should call start on metrics with function name before calling intercepted method', async () => {
            const metrics = new Metrics();
            simple.mock(metrics, "start");

            const interceptedFn = simple.stub().callFn((i: number) => {
                expect(metrics.start.callCount).toBe(1);
                expect(metrics.start.lastCall.args[0]).toBe("matrix_client_function_call");
                expect(metrics.start.lastCall.args[1]).toHaveProperty("functionName", "matrixClientIntercepted");
                return -1;
            });

            const interceptedClass = new InterceptedClass(metrics, interceptedFn);
            await interceptedClass.matrixClientIntercepted(1234);
        });

        it('should call end on metrics with function name after calling intercepted method', async () => {
            const metrics = new Metrics();
            simple.mock(metrics, "end");

            const interceptedFn = simple.stub().callFn((i: number) => {
                expect(metrics.end.callCount).toBe(0);
                return -1;
            });

            const interceptedClass = new InterceptedClass(metrics, interceptedFn);
            await interceptedClass.matrixClientIntercepted(1234).then(waitingPromise);

            expect(metrics.end.callCount).toBe(1);
            expect(metrics.end.lastCall.args[0]).toBe("matrix_client_function_call");
            expect(metrics.end.lastCall.args[1]).toHaveProperty("functionName", "matrixClientIntercepted");
        });

        it('should increment the successful counter on returning a result', async () => {
            const metrics = new Metrics();
            simple.mock(metrics, "increment");

            const interceptedFn = simple.stub().callFn((i: number) => {
                expect(metrics.increment.callCount).toBe(0);
                return -1;
            });

            const interceptedClass = new InterceptedClass(metrics, interceptedFn);
            await interceptedClass.matrixClientIntercepted(1234).then(waitingPromise);

            expect(metrics.increment.callCount).toBe(1);
            expect(metrics.increment.lastCall.args[0]).toBe("matrix_client_successful_function_call");
            expect(metrics.increment.lastCall.args[1]).toHaveProperty("functionName", "matrixClientIntercepted");
        });

        it('should increment the failure counter on throwing', async () => {
            const metrics = new Metrics();
            simple.mock(metrics, "increment");

            const interceptedFn = simple.stub().callFn((i: number) => {
                expect(metrics.increment.callCount).toBe(0);
                throw new Error("Bad things");
            });

            const interceptedClass = new InterceptedClass(metrics, interceptedFn);
            await interceptedClass.matrixClientIntercepted(1234).catch(waitingPromise);

            expect(metrics.increment.callCount).toBe(1);
            expect(metrics.increment.lastCall.args[0]).toBe("matrix_client_failed_function_call");
            expect(metrics.increment.lastCall.args[1]).toHaveProperty("functionName", "matrixClientIntercepted");
        });
    });

    describe('timedIntentFunctionCall', () => {
        it('should call the intercepted method with provided args', async () => {
            const amount = 1234;
            const interceptedFn = simple.stub().callFn((i: number) => {
                expect(i).toBe(amount);
                return -1;
            });

            const interceptedClass = new InterceptedClass(new Metrics(), interceptedFn);
            await interceptedClass.intentIntercepted(amount);

            expect(interceptedFn.callCount).toBe(1);
        });

        it('should return the result of the intercepted method', async () => {
            const amount = 1234;

            const interceptedClass = new InterceptedClass(new Metrics(), (i) => amount);
            const result = await interceptedClass.intentIntercepted(amount * 2);

            expect(result).toBe(amount);
        });

        it('should expose errors from the intercepted method', async () => {
            const reason = "Bad things";
            const interceptedClass = new InterceptedClass(new Metrics(), () => {
                throw new Error(reason);
            });

            await expect(interceptedClass.intentIntercepted(1234)).rejects.toThrow(reason);
        });

        it('should call start on metrics with function name before calling intercepted method', async () => {
            const metrics = new Metrics();
            simple.mock(metrics, "start");

            const interceptedFn = simple.stub().callFn((i: number) => {
                expect(metrics.start.callCount).toBe(1);
                expect(metrics.start.lastCall.args[0]).toBe("intent_function_call");
                expect(metrics.start.lastCall.args[1]).toHaveProperty("functionName", "intentIntercepted");
                return -1;
            });

            const interceptedClass = new InterceptedClass(metrics, interceptedFn);
            await interceptedClass.intentIntercepted(1234);
        });

        it('should call end on metrics with function name after calling intercepted method', async () => {
            const metrics = new Metrics();
            simple.mock(metrics, "end");

            const interceptedFn = simple.stub().callFn((i: number) => {
                expect(metrics.end.callCount).toBe(0);
                return -1;
            });

            const interceptedClass = new InterceptedClass(metrics, interceptedFn);
            await interceptedClass.intentIntercepted(1234).then(waitingPromise);

            expect(metrics.end.callCount).toBe(1);
            expect(metrics.end.lastCall.args[0]).toBe("intent_function_call");
            expect(metrics.end.lastCall.args[1]).toHaveProperty("functionName", "intentIntercepted");
        });

        it('should increment the successful counter on returning a result', async () => {
            const metrics = new Metrics();
            simple.mock(metrics, "increment");

            const interceptedFn = simple.stub().callFn((i: number) => {
                expect(metrics.increment.callCount).toBe(0);
                return -1;
            });

            const interceptedClass = new InterceptedClass(metrics, interceptedFn);
            await interceptedClass.intentIntercepted(1234).then(waitingPromise);

            expect(metrics.increment.callCount).toBe(1);
            expect(metrics.increment.lastCall.args[0]).toBe("intent_successful_function_call");
            expect(metrics.increment.lastCall.args[1]).toHaveProperty("functionName", "intentIntercepted");
        });

        it('should increment the failure counter on throwing', async () => {
            const metrics = new Metrics();
            simple.mock(metrics, "increment");

            const interceptedFn = simple.stub().callFn((i: number) => {
                expect(metrics.increment.callCount).toBe(0);
                throw new Error("Bad things");
            });

            const interceptedClass = new InterceptedClass(metrics, interceptedFn);
            await interceptedClass.intentIntercepted(1234).catch(waitingPromise);

            expect(metrics.increment.callCount).toBe(1);
            expect(metrics.increment.lastCall.args[0]).toBe("intent_failed_function_call");
            expect(metrics.increment.lastCall.args[1]).toHaveProperty("functionName", "intentIntercepted");
        });
    });
});

import * as expect from "expect";
import * as simple from "simple-mock";
import { requiresCrypto, requiresReady } from "../../src";

class InterceptedClass {
    constructor(private interceptedFn: (i: number) => number, public crypto: any) {
    }

    public get isReady() {
        return this.crypto;
    }

    @requiresCrypto()
    async reqCryptoIntercepted(i: number): Promise<number> {
        return this.interceptedFn(i);
    }

    @requiresReady()
    async reqReadyIntercepted(i: number): Promise<number> {
        return this.interceptedFn(i);
    }
}

describe('decorators', () => {
    describe('requiresCrypto', () => {
        it('should call the intercepted method with provided args', async () => {
            const amount = 1234;
            const interceptedFn = simple.stub().callFn((i: number) => {
                expect(i).toBe(amount);
                return -1;
            });

            const interceptedClass = new InterceptedClass(interceptedFn, true);
            await interceptedClass.reqCryptoIntercepted(amount);

            expect(interceptedFn.callCount).toBe(1);
        });

        it('should return the result of the intercepted method', async () => {
            const amount = 1234;

            const interceptedClass = new InterceptedClass((i) => amount, true);
            const result = await interceptedClass.reqCryptoIntercepted(amount * 2);

            expect(result).toBe(amount);
        });

        it('should throw if there is no crypto member', async () => {
            const amount = 1234;

            const interceptedClass = new InterceptedClass((i) => amount, false);

            try {
                await interceptedClass.reqCryptoIntercepted(amount * 2);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to throw");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption is not enabled");
            }
        });

        it('should throw if the function throws', async () => {
            const reason = "Bad things";
            const interceptedClass = new InterceptedClass(() => {
                throw new Error(reason);
            }, true);

            await expect(interceptedClass.reqCryptoIntercepted(1234)).rejects.toThrow(reason);
        });
    });

    describe('requiresReady', () => {
        it('should call the intercepted method with provided args', async () => {
            const amount = 1234;
            const interceptedFn = simple.stub().callFn((i: number) => {
                expect(i).toBe(amount);
                return -1;
            });

            const interceptedClass = new InterceptedClass(interceptedFn, true);
            await interceptedClass.reqReadyIntercepted(amount);

            expect(interceptedFn.callCount).toBe(1);
        });

        it('should return the result of the intercepted method', async () => {
            const amount = 1234;

            const interceptedClass = new InterceptedClass((i) => amount, true);
            const result = await interceptedClass.reqReadyIntercepted(amount * 2);

            expect(result).toBe(amount);
        });

        it('should throw if not ready', async () => {
            const amount = 1234;

            const interceptedClass = new InterceptedClass((i) => amount, false);

            try {
                await interceptedClass.reqReadyIntercepted(amount * 2);

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to throw");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should throw if the function throws', async () => {
            const reason = "Bad things";
            const interceptedClass = new InterceptedClass(() => {
                throw new Error(reason);
            }, true);

            await expect(interceptedClass.reqReadyIntercepted(1234)).rejects.toThrow(reason);
        });
    });
});

import { SimpleRetryJoinStrategy } from "../../src";
import * as expect from "expect";
import * as simple from "simple-mock";

describe('SimpleRetryJoinStrategy', () => {
    it('should retry joins when they fail', async () => {
        const strategy = new SimpleRetryJoinStrategy();

        const schedule = [0, 10, 20];
        (<any>strategy).schedule = schedule;

        const roomId = "!somewhere:example.org";
        const userId = "@someone:example.org";

        let attempt = 0;
        const apiCallSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(roomId);
            attempt++;
            if (attempt === schedule.length) {
                return true;
            } else {
                throw new Error("Simulated failure");
            }
        });

        await strategy.joinRoom(roomId, userId, apiCallSpy);
        expect(apiCallSpy.callCount).toBe(schedule.length);
    });

    it('should retry joins on a schedule', async () => {
        const strategy = new SimpleRetryJoinStrategy();

        const schedule = [0, 500, 750];
        (<any>strategy).schedule = schedule;

        const roomId = "!somewhere:example.org";
        const userId = "@someone:example.org";
        const tolerance = 100;

        let attempt = 0;
        let joinStarted = new Date().getTime();
        const apiCallSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(roomId);

            const deltaTime = (new Date().getTime()) - joinStarted;
            joinStarted = new Date().getTime();
            const expectedVal = schedule[attempt];
            expect(deltaTime).toBeGreaterThan(expectedVal - tolerance);
            expect(deltaTime).toBeLessThan(expectedVal + tolerance);

            attempt++;
            if (attempt === schedule.length) {
                return true;
            } else {
                throw new Error("Simulated failure");
            }
        });

        await strategy.joinRoom(roomId, userId, apiCallSpy);
        expect(apiCallSpy.callCount).toBe(schedule.length);
    });

    it('should fail if all attempts fail', async () => {
        const strategy = new SimpleRetryJoinStrategy();

        const schedule = [0, 10, 20];
        (<any>strategy).schedule = schedule;

        const roomId = "!somewhere:example.org";
        const userId = "@someone:example.org";

        const apiCallSpy = simple.stub().callFn((rid) => {
            expect(rid).toEqual(roomId);
            throw new Error("Simulated failure");
        });

        try {
            await strategy.joinRoom(roomId, userId, apiCallSpy);

            // noinspection ExceptionCaughtLocallyJS
            throw new Error("Join succeeded when it should have failed");
        } catch (e) {
            expect(e.message).toEqual("Simulated failure");
        }

        expect(apiCallSpy.callCount).toBe(schedule.length);
    });
});

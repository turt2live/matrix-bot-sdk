import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { EncryptionEvent, RoomEncryptionAlgorithm } from "../../../src";

describe("EncryptionEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev.content['algorithm'] = RoomEncryptionAlgorithm.MegolmV1AesSha2;
        ev.content['rotation_period_ms'] = 12;
        ev.content['rotation_period_msgs'] = 14;
        const obj = new EncryptionEvent(ev);

        expect(obj.algorithm).toEqual(ev.content['algorithm']);
        expect(obj.rotationPeriodMs).toEqual(ev.content['rotation_period_ms']);
        expect(obj.rotationPeriodMessages).toEqual(ev.content['rotation_period_msgs']);
    });

    it("should default to a rotation period of 1 week", () => {
        const ev = createMinimalEvent();
        const obj = new EncryptionEvent(ev);

        expect(obj.rotationPeriodMs).toEqual(604800000); // 1 week
    });

    it("should default to a rotation period of 100 messages", () => {
        const ev = createMinimalEvent();
        const obj = new EncryptionEvent(ev);

        expect(obj.rotationPeriodMessages).toEqual(100);
    });
});

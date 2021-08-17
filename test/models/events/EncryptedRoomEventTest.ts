import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { EncryptedRoomEvent, RoomEncryptionAlgorithm } from "../../../src";

describe("EncryptedRoomEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev.content['algorithm'] = RoomEncryptionAlgorithm.MegolmV1AesSha2;
        ev.content['rotation_period_ms'] = 12;
        ev.content['rotation_period_msgs'] = 14;
        const obj = new EncryptedRoomEvent(ev);

        expect(obj.algorithm).toEqual(ev.content['algorithm']);
        expect(obj.megolmProperties).toBe(ev.content); // XXX: implementation detail that we know about
    });
});

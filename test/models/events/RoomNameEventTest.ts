import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { RoomNameEvent } from "../../../src";

describe("RoomNameEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev.content['name'] = '#one:example.org';
        const obj = new RoomNameEvent(ev);

        expect(obj.name).toEqual(ev.content['name']);
    });
});

import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { RoomTopicEvent } from "../../../src";

describe("RoomTopicEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev.content['topic'] = '#one:example.org';
        const obj = new RoomTopicEvent(ev);

        expect(obj.topic).toEqual(ev.content['topic']);
    });
});

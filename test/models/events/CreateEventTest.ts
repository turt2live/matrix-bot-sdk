import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { CreateEvent } from "../../../src";

describe("CreateEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev.content['creator'] = '@bob:example.org';
        ev.content['m.federate'] = false;
        ev.content['room_version'] = '4';
        const obj = new CreateEvent(ev);

        expect(obj.creator).toEqual(ev.content['creator']);
        expect(obj.federated).toEqual(ev.content['m.federate']);
        expect(obj.version).toEqual(ev.content['room_version']);
    });

    it("should default to the sender if the creator is not specified", () => {
        const ev = createMinimalEvent();
        const obj = new CreateEvent(ev);

        expect(obj.creator).toEqual(ev.sender);
    });

    it("should default to room version 1", () => {
        const ev = createMinimalEvent();
        const obj = new CreateEvent(ev);

        expect(obj.version).toEqual("1");
    });

    it("should assume the room is federated", () => {
        const ev = createMinimalEvent();
        const obj = new CreateEvent(ev);

        expect(obj.federated).toEqual(true);
    });
});

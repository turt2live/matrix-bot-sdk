import { MessageEvent, RoomEvent, StateEvent, wrapRoomEvent } from "../../../src";
import { createMinimalEvent } from "./EventTest";
import { expectInstanceOf } from "../../TestUtils";
import { MembershipEvent } from "../../../src/models/events/MembershipEvent";

describe("Event Converter", () => {
    it("should return generic room events", () => {
        const ev = createMinimalEvent();
        const obj = wrapRoomEvent(ev);

        expectInstanceOf(RoomEvent, obj);
    });

    it("should return generic state events", () => {
        const ev = createMinimalEvent();
        ev['state_key'] = 'test';
        const obj = wrapRoomEvent(ev);

        expectInstanceOf(StateEvent, obj);
    });

    it("should return membership events", () => {
        const ev = createMinimalEvent();
        ev['state_key'] = 'test';
        ev['type'] = 'm.room.member';
        const obj = wrapRoomEvent(ev);

        expectInstanceOf(MembershipEvent, obj);
    });

    it("should return message events", () => {
        const ev = createMinimalEvent();
        ev['type'] = 'm.room.message';
        const obj = wrapRoomEvent(ev);

        expectInstanceOf(MessageEvent, obj);
    });
});

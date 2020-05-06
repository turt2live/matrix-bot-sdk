import {
    MessageEvent,
    MessageEventContent,
    RoomEvent,
    RoomEventContent,
    StateEvent,
    wrapRoomEvent
} from "../../../src";
import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { expectInstanceOf } from "../../TestUtils";
import { MembershipEvent } from "../../../src/models/events/MembershipEvent";

describe("Event Converter", () => {
    it("should return generic room events", () => {
        const ev = createMinimalEvent();
        const obj = wrapRoomEvent(ev);
        expect(obj.content).toBeDefined();
        expectInstanceOf(RoomEvent, obj);
    });

    it("should return generic state events", () => {
        const ev = createMinimalEvent();
        ev['state_key'] = 'test';
        const obj = <StateEvent<RoomEventContent>>wrapRoomEvent(ev);
        expect(obj.stateKey).toEqual(ev['state_key']);
        expectInstanceOf(StateEvent, obj);
    });

    it("should return membership events", () => {
        const ev = createMinimalEvent({membership: "join"});
        ev['state_key'] = 'test';
        ev['type'] = 'm.room.member';
        const obj = <MembershipEvent>wrapRoomEvent(ev);
        expect(obj.membership).toEqual(ev['content']['membership']);
        expectInstanceOf(MembershipEvent, obj)
    });

    it("should return message events", () => {
        const ev = createMinimalEvent({msgtype: "m.text"});
        ev['type'] = 'm.room.message';
        const obj = <MessageEvent<MessageEventContent>>wrapRoomEvent(ev);
        expect(obj.messageType).toEqual(ev['content']['msgtype']);
        expectInstanceOf(MessageEvent, obj)
    });
});

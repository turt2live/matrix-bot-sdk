import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { PowerLevelsEvent } from "../../../src";

describe("PowerLevelsEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev.content['ban'] = 75;
        ev.content['events_default'] = 76;
        ev.content['invite'] = 77;
        ev.content['kick'] = 78;
        ev.content['redact'] = 79;
        ev.content['state_default'] = 80;
        ev.content['users_default'] = 81;
        ev.content['notifications'] = {room: 82};
        const obj = new PowerLevelsEvent(ev);

        expect(obj.banLevel).toEqual(ev.content['ban']);
        expect(obj.inviteLevel).toEqual(ev.content['invite']);
        expect(obj.kickLevel).toEqual(ev.content['kick']);
        expect(obj.redactLevel).toEqual(ev.content['redact']);
        expect(obj.notifyWholeRoomLevel).toEqual(ev.content['notifications']['room']);
        expect(obj.defaultUserLevel).toEqual(ev.content['users_default']);
        expect(obj.defaultStateEventLevel).toEqual(ev.content['state_default']);
        expect(obj.defaultEventLevel).toEqual(ev.content['events_default']);
    });

    it("should return the default values if they aren't specified", () => {
        const ev = createMinimalEvent();
        const obj = new PowerLevelsEvent(ev);

        expect(obj.banLevel).toEqual(50);
        expect(obj.inviteLevel).toEqual(50);
        expect(obj.kickLevel).toEqual(50);
        expect(obj.redactLevel).toEqual(50);
        expect(obj.notifyWholeRoomLevel).toEqual(50);
        expect(obj.defaultUserLevel).toEqual(0);
        expect(obj.defaultStateEventLevel).toEqual(50);
        expect(obj.defaultEventLevel).toEqual(50);
    });
});

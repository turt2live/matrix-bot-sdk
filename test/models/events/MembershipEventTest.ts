import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { MembershipEvent } from "../../../src/models/events/MembershipEvent";

describe("MembershipEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev['state_key'] = '@bob:example.org';
        ev.content['membership'] = 'join';
        const obj = new MembershipEvent(ev);

        expect(obj.membershipFor).toEqual(ev['state_key']);
        expect(obj.membership).toEqual(ev.content['membership']);
    });
});

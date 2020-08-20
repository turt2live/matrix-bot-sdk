import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { MembershipEvent } from "../../../src";

describe("MembershipEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev['state_key'] = '@bob:example.org';
        ev.content['membership'] = 'join';
        const obj = new MembershipEvent(ev);

        expect(obj.membershipFor).toEqual(ev['state_key']);
        expect(obj.membership).toEqual(ev.content['membership']);
        expect(obj.ownMembership).toEqual(false);
        expect(obj.effectiveMembership).toEqual("join");
    });

    it("should return true for ownMembership when required", () => {
        const ev = createMinimalEvent();
        ev['state_key'] = ev['sender'];
        ev.content['membership'] = 'join';
        const obj = new MembershipEvent(ev);

        expect(obj.membershipFor).toEqual(ev['state_key']);
        expect(obj.membership).toEqual(ev.content['membership']);
        expect(obj.ownMembership).toEqual(true);
    });

    it("should return an effective membership of join for joins", () => {
        const ev = createMinimalEvent();
        ev['state_key'] = '@bob:example.org';
        ev.content['membership'] = 'join';
        const obj = new MembershipEvent(ev);

        expect(obj.effectiveMembership).toEqual("join");
    });

    it("should return an effective membership of invite for invites", () => {
        const ev = createMinimalEvent();
        ev['state_key'] = '@bob:example.org';
        ev.content['membership'] = 'invite';
        const obj = new MembershipEvent(ev);

        expect(obj.effectiveMembership).toEqual("invite");
    });

    it("should return an effective membership of leave for parts", () => {
        const ev = createMinimalEvent();
        ev['state_key'] = ev['sender'];
        ev.content['membership'] = 'leave';
        const obj = new MembershipEvent(ev);

        expect(obj.effectiveMembership).toEqual("leave");
    });

    it("should return an effective membership of leave for kicks", () => {
        const ev = createMinimalEvent();
        ev['state_key'] = '@bob-otherperson:example.org';
        ev.content['membership'] = 'leave';
        const obj = new MembershipEvent(ev);

        expect(obj.effectiveMembership).toEqual("leave");
    });

    it("should return an effective membership of leave for bans", () => {
        const ev = createMinimalEvent();
        ev['state_key'] = '@bob:example.org';
        ev.content['membership'] = 'ban';
        const obj = new MembershipEvent(ev);

        expect(obj.effectiveMembership).toEqual("leave");
    });
});

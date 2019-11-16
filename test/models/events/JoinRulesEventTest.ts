import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { JoinRulesEvent } from "../../../src";

describe("JoinRulesEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev.content['join_rule'] = 'private';
        const obj = new JoinRulesEvent(ev);

        expect(obj.rule).toEqual(ev.content['join_rule']);
    });
});

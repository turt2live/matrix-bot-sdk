import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { CanonicalAliasEvent } from "../../../src";

describe("CanonicalAliasEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev.content['alias'] = '#one:example.org';
        const obj = new CanonicalAliasEvent(ev);

        expect(obj.aliases).toEqual(ev.content['alias']);
    });
});

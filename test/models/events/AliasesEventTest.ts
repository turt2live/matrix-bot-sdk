import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { AliasesEvent } from "../../../src";
import { expectArrayEquals } from "../../TestUtils";

describe("AliasesEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev['state_key'] = 'example.org';
        ev.content['aliases'] = ['#one:example.org', '#two:example.org'];
        const obj = new AliasesEvent(ev);

        expect(obj.forDomain).toEqual(ev['state_key']);
        expectArrayEquals(ev.content['aliases'], obj.aliases);
    });
});

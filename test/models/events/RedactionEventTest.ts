import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { RedactionEvent } from "../../../src";
import { expectArrayEquals } from "../../TestUtils";

describe("RedactionEvent", () => {
    it("should support CS-v2 format redactions", () => {
        const ev = createMinimalEvent();
        ev['redacts'] = '$example';
        const obj = new RedactionEvent(ev);

        expect(obj.redactsEventId).toEqual(ev['redacts']);
        expectArrayEquals([ev['redacts']], obj.redactsEventIds);
    });

    it("should support MSC2174 format redactions", () => {
        const ev = createMinimalEvent();
        ev.content['redacts'] = '$example';
        const obj = new RedactionEvent(ev);

        expect(obj.redactsEventId).toEqual(ev.content['redacts']);
        expectArrayEquals([ev.content['redacts']], obj.redactsEventIds);
    });

    it("should support MSC2244 format redactions", () => {
        const ev = createMinimalEvent();
        ev.content['redacts'] = ['$example', '$another'];
        const obj = new RedactionEvent(ev);

        expect(obj.redactsEventId).toEqual(ev.content['redacts'][0]);
        expectArrayEquals(ev.content['redacts'], obj.redactsEventIds);
    });
});

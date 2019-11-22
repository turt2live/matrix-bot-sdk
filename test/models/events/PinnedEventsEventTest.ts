import { createMinimalEvent } from "./EventTest";
import { expectArrayEquals } from "../../TestUtils";
import { PinnedEventsEvent } from "../../../src";

describe("PinnedEventsEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev.content['pinned'] = ['$one:example.org', '$two:example.org'];
        const obj = new PinnedEventsEvent(ev);

        expectArrayEquals(ev.content['pinned'], obj.pinnedEventIds);
    });
});

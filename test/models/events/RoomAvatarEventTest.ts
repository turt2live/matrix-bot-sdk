import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { RoomAvatarEvent } from "../../../src";

describe("RoomAvatarEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev.content['url'] = 'mxc://example.org/abc123';
        const obj = new RoomAvatarEvent(ev);

        expect(obj.avatarUrl).toEqual(ev.content['url']);
    });
});

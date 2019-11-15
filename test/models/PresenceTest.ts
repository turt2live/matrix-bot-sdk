import { Presence, PresenceEventContent } from "../../src";
import * as expect from "expect";

describe("Presence", () => {
    it("should return the right fields", () => {
        const presence: PresenceEventContent = {
            status_msg: "Testing",
            currently_active: true,
            presence: "online",
            last_active_ago: 1234,
        };

        const obj = new Presence(presence);

        expect(obj.currentlyActive).toEqual(presence.currently_active);
        expect(obj.statusMessage).toEqual(presence.status_msg);
        expect(obj.lastActiveAgo).toEqual(presence.last_active_ago);
        expect(obj.state).toEqual(presence.presence);
    });
});

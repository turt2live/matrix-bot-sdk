import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { SpaceChildEvent } from "../../../src";

describe("SpaceChildEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev.content['via'] = ['example.org'];
        ev.content['order'] = 'test';
        ev.content['suggested'] = true;
        ev['state_key'] = '!room:example.org';
        const obj = new SpaceChildEvent(ev);

        expect(obj.viaServers).toEqual(ev.content['via']);
        expect(obj.order).toEqual(ev.content['order']);
        expect(obj.suggested).toEqual(ev.content['suggested']);
        expect(obj.entityRoomId).toEqual(ev['state_key']);
        expect(obj.isActiveChild).toEqual(true);
    });

    it("should consider the child inactive when missing via", () => {
        const ev = createMinimalEvent();
        //ev.content['via'] = ['example.org'];
        ev.content['order'] = 'test';
        ev.content['suggested'] = true;
        ev['state_key'] = '!room:example.org';
        const obj = new SpaceChildEvent(ev);

        expect(obj.viaServers).toBeFalsy();
        expect(obj.isActiveChild).toEqual(false);
    });

    it("should handle lack of optional fields", () => {
        const ev = createMinimalEvent();
        ev.content['via'] = ['example.org'];
        ev['state_key'] = '!room:example.org';
        const obj = new SpaceChildEvent(ev);

        expect(obj.viaServers).toEqual(ev.content['via']);
        expect(obj.isActiveChild).toEqual(true);
        expect(obj.order).toBeFalsy();
        expect(obj.suggested).toBeFalsy();
    });
});

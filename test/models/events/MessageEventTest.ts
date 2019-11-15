import * as expect from "expect";
import { createMinimalEvent } from "./EventTest";
import { EventRedactedError, MessageEvent, MessageEventContent } from "../../../src";

describe("MessageEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        ev.content['body'] = 'hello world';
        ev.content['msgtype'] = 'm.notice';
        const obj = new MessageEvent<MessageEventContent>(ev);

        expect(obj.isRedacted).toEqual(false);
        expect(obj.messageType).toEqual(ev.content['msgtype']);
        expect(obj.textBody).toEqual(ev.content['body']);
    });

    it("should return the right fields when redacted", () => {
        const ev = createMinimalEvent();
        // ev.content['body'] = 'hello world'; // missing counts as redacted
        // ev.content['msgtype'] = 'm.notice'; // missing counts as redacted
        const obj = new MessageEvent<MessageEventContent>(ev);

        expect(obj.isRedacted).toEqual(true);

        try {
            let _ = obj.messageType;
            throw new Error("Expected a throw but there was none");
        } catch (e) {
            if (!(e instanceof EventRedactedError)) {
                throw new Error("Wrong error thrown");
            } // else valid error
        }

        try {
            let _ = obj.textBody;
            throw new Error("Expected a throw but there was none");
        } catch (e) {
            if (!(e instanceof EventRedactedError)) {
                throw new Error("Wrong error thrown");
            } // else valid error
        }
    });
});

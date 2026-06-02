import { RichReply } from "../../src";

describe('RichReply', () => {
    it('should return a well-formatted reply', () => {
        const inputEvent = {
            content: {
                body: "*Hello World*",
                formatted_body: "<i>Hello World</i>",
            },
            sender: "@abc:example.org",
            event_id: "$abc:example.org",
        };
        const inputRoomId = "!abc:example.org";
        const replyText = "**Testing 1234**";
        const replyHtml = "<b>Testing 1234</b>";

        const reply = RichReply.createFor(inputRoomId, inputEvent, replyText, replyHtml);

        const expectedReply = {
            "m.relates_to": {
                "m.in_reply_to": {
                    "event_id": inputEvent.event_id,
                },
            },
            "msgtype": "m.text",
            "body": replyText,
            "format": "org.matrix.custom.html",
            "formatted_body": replyHtml,
        };

        expect(reply).toMatchObject(expectedReply);
    });

    it('should return a well-formatted multiline reply', () => {
        const inputEvent = {
            content: {
                body: "*Hello World*\nHow are you?",
                formatted_body: "<i>Hello World</i><br />How are you?",
            },
            sender: "@abc:example.org",
            event_id: "$abc:example.org",
        };
        const inputRoomId = "!abc:example.org";
        const replyText = "**Testing 1234**\nThis is a test";
        const replyHtml = "<b>Testing 1234</b><br />This is a test";

        const reply = RichReply.createFor(inputRoomId, inputEvent, replyText, replyHtml);

        const expectedReply = {
            "m.relates_to": {
                "m.in_reply_to": {
                    "event_id": inputEvent.event_id,
                },
            },
            "msgtype": "m.text",
            "body": replyText,
            "format": "org.matrix.custom.html",
            "formatted_body": replyHtml,
        };

        expect(reply).toMatchObject(expectedReply);
    });

    it('should be able to reply to plaintext events', () => {
        const inputEvent = {
            content: {
                body: "*Hello World*",
            },
            sender: "@abc:example.org",
            event_id: "$abc:example.org",
        };
        const inputRoomId = "!abc:example.org";
        const replyText = "**Testing 1234**";

        const reply = RichReply.createFor(inputRoomId, inputEvent, replyText);

        const expectedReply = {
            "m.relates_to": {
                "m.in_reply_to": {
                    "event_id": inputEvent.event_id,
                },
            },
            "msgtype": "m.text",
            "body": replyText,
        };

        expect(reply).toMatchObject(expectedReply);
    });
});

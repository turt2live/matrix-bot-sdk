import { EventKind, RichRepliesPreprocessor } from "../../src";
import * as expect from "expect";
import * as simple from "simple-mock";
import { createTestClient } from "../MatrixClientTest";

describe('RichRepliesPreprocessor', () => {
    it('should only process room events', async () => {
        const processor = new RichRepliesPreprocessor();
        const {client} = createTestClient();
        const originalEventId = "$original:example.org";
        const originalUserId = "@alice:example.org";
        const originalPlainText = "Hello world, this is text";
        const originalHtml = "<b>Hello world, this is text</b>";
        const originalRoomId = "!somewhere:example.org";
        const replyPlainText = "This is the reply";
        const replyHtml = "<i>This is the reply text</i>";
        const event1 = {
            content: {
                "m.relates_to": {
                    "m.in_reply_to": {
                        event_id: originalEventId,
                    },
                },
                format: "org.matrix.custom.html",
                body: `> <${originalUserId}> ${originalPlainText}\n\n${replyPlainText}`,
                formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/${originalRoomId}/${originalEventId}">In reply to</a> <a href="https://matrix.to/#/${originalUserId}">${originalUserId}</a><br />${originalHtml}</blockquote></mx-reply>${replyHtml}`,
            },
        };
        const event2 = {
            content: {
                "m.relates_to": {
                    "m.in_reply_to": {
                        event_id: originalEventId,
                    },
                },
                format: "org.matrix.custom.html",
                body: `> <${originalUserId}> ${originalPlainText}\n\n${replyPlainText}`,
                formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/${originalRoomId}/${originalEventId}">In reply to</a> <a href="https://matrix.to/#/${originalUserId}">${originalUserId}</a><br />${originalHtml}</blockquote></mx-reply>${replyHtml}`,
            },
        };
        let result = await processor.processEvent(event1, client, EventKind.EphemeralEvent);
        expect(result).toBeUndefined();

        result = await processor.processEvent(event1, client);
        expect(result).toMatchObject({
            mx_richreply: {
                wasLenient: false,
                parentEventId: originalEventId,
                fallbackPlainBody: `<${originalUserId}> ${originalPlainText}`,
                fallbackHtmlBody: originalHtml,
                fallbackSender: originalUserId,
                realEvent: null,
            },
            content: {
                "m.relates_to": {
                    "m.in_reply_to": {
                        event_id: originalEventId,
                    },
                },
                format: "org.matrix.custom.html",
                body: replyPlainText,
                formatted_body: replyHtml,
            },
        });

        result = await processor.processEvent(event2, client, EventKind.RoomEvent);
        expect(result).toMatchObject({
            mx_richreply: {
                wasLenient: false,
                parentEventId: originalEventId,
                fallbackPlainBody: `<${originalUserId}> ${originalPlainText}`,
                fallbackHtmlBody: originalHtml,
                fallbackSender: originalUserId,
                realEvent: null,
            },
            content: {
                "m.relates_to": {
                    "m.in_reply_to": {
                        event_id: originalEventId,
                    },
                },
                format: "org.matrix.custom.html",
                body: replyPlainText,
                formatted_body: replyHtml,
            },
        });
    });

    it('should parse single-line events', async () => {
        const {client} = createTestClient();

        const originalEventId = "$original:example.org";
        const originalUserId = "@alice:example.org";
        const originalPlainText = "Hello world, this is text";
        const originalHtml = "<b>Hello world, this is text</b>";
        const originalRoomId = "!somewhere:example.org";
        const replyPlainText = "This is the reply";
        const replyHtml = "<i>This is the reply text</i>";
        const event = {
            content: {
                "m.relates_to": {
                    "m.in_reply_to": {
                        event_id: originalEventId,
                    },
                },
                format: "org.matrix.custom.html",
                body: `> <${originalUserId}> ${originalPlainText}\n\n${replyPlainText}`,
                formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/${originalRoomId}/${originalEventId}">In reply to</a> <a href="https://matrix.to/#/${originalUserId}">${originalUserId}</a><br />${originalHtml}</blockquote></mx-reply>${replyHtml}`,
            },
        };

        const processor = new RichRepliesPreprocessor();
        const result = await processor.processEvent(event, client, EventKind.RoomEvent);
        expect(result).toMatchObject({
            mx_richreply: {
                wasLenient: false,
                parentEventId: originalEventId,
                fallbackPlainBody: `<${originalUserId}> ${originalPlainText}`,
                fallbackHtmlBody: originalHtml,
                fallbackSender: originalUserId,
                realEvent: null,
            },
            content: {
                "m.relates_to": {
                    "m.in_reply_to": {
                        event_id: originalEventId,
                    },
                },
                format: "org.matrix.custom.html",
                body: replyPlainText,
                formatted_body: replyHtml,
            },
        });
    });

    it('should parse multi-line events', async () => {
        const {client} = createTestClient();

        const originalEventId = "$original:example.org";
        const originalUserId = "@alice:example.org";
        const originalPlainText = "Hello world, this is text\nTesting line 2";
        const originalHtml = "<b>Hello world, this is text</b><br /><p>Testing line 2</p>";
        const originalRoomId = "!somewhere:example.org";
        const replyPlainText = "This is the reply\nWith two lines";
        const replyHtml = "<i>This is the reply text</i><br /><p>With two lines</p>";
        const event = {
            content: {
                "m.relates_to": {
                    "m.in_reply_to": {
                        event_id: originalEventId,
                    },
                },
                format: "org.matrix.custom.html",
                body: `> <${originalUserId}> ${originalPlainText.split('\n').join('\n> ')}\n\n${replyPlainText}`,
                formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/${originalRoomId}/${originalEventId}">In reply to</a> <a href="https://matrix.to/#/${originalUserId}">${originalUserId}</a><br />${originalHtml}</blockquote></mx-reply>${replyHtml}`,
            },
        };

        const processor = new RichRepliesPreprocessor();
        const result = await processor.processEvent(event, client);
        expect(result).toMatchObject({
            mx_richreply: {
                wasLenient: false,
                parentEventId: originalEventId,
                fallbackPlainBody: `<${originalUserId}> ${originalPlainText}`,
                fallbackHtmlBody: originalHtml,
                fallbackSender: originalUserId,
                realEvent: null,
            },
            content: {
                "m.relates_to": {
                    "m.in_reply_to": {
                        event_id: originalEventId,
                    },
                },
                format: "org.matrix.custom.html",
                body: replyPlainText,
                formatted_body: replyHtml,
            },
        });
    });

    it('should only support messages', () => {
        const processor = new RichRepliesPreprocessor();
        const types = processor.getSupportedEventTypes();
        expect(types.length).toBe(1);
        expect(types).toContain("m.room.message");
    });

    it('should fetch the real message when instructed', async () => {
        const {client} = createTestClient();

        const realEvent = {hello: "world"};

        const originalEventId = "$original:example.org";
        const originalUserId = "@alice:example.org";
        const originalPlainText = "Hello world, this is text\nTesting line 2";
        const originalHtml = "<b>Hello world, this is text</b><br /><p>Testing line 2</p>";
        const originalRoomId = "!somewhere:example.org";
        const replyPlainText = "This is the reply\nWith two lines";
        const replyHtml = "<i>This is the reply text</i><br /><p>With two lines</p>";
        const roomId = "!abc123:example.org";
        const event = {
            content: {
                "m.relates_to": {
                    "m.in_reply_to": {
                        event_id: originalEventId,
                    },
                },
                format: "org.matrix.custom.html",
                body: `> <${originalUserId}> ${originalPlainText.split('\n').join('\n> ')}\n\n${replyPlainText}`,
                formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/${originalRoomId}/${originalEventId}">In reply to</a> <a href="https://matrix.to/#/${originalUserId}">${originalUserId}</a><br />${originalHtml}</blockquote></mx-reply>${replyHtml}`,
            },

            // TODO: Pre-processors need to be able to support events without room_id set
            room_id: roomId,
        };

        const getEventSpy = simple.mock(client, "getEvent").callFn((rid, evId) => {
            expect(rid).toEqual(roomId);
            expect(evId).toEqual(originalEventId);
            return realEvent;
        });

        let processor, result;

        processor = new RichRepliesPreprocessor();
        result = await processor.processEvent(event, client);
        expect(getEventSpy.callCount).toBe(0);
        expect(result["mx_richreply"]["realEvent"]).toBeNull();

        processor = new RichRepliesPreprocessor(true);
        result = await processor.processEvent(event, client);
        expect(getEventSpy.callCount).toBe(1);
        expect(result["mx_richreply"]["realEvent"]).toMatchObject(realEvent);
    });
});

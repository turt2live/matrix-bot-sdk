import * as sanitizeHtml from "sanitize-html";

/**
 * Helper for creating rich replies.
 * @category Utilities
 */
export class RichReply {
    private constructor() {
    }

    /**
     * Generates the event content required to reply to the provided event with the
     * provided text.
     * @param {string} roomId the room ID the event being replied to resides in
     * @param {any} event the event to reply to
     * @param {string} withText the plain text to reply with
     * @param {string} withHtml the HTML to reply with. Optional.
     * @returns {any} the content of the event representing the reply
     */
    public static createFor(roomId: string, event: any, withText: string, withHtml: string = null): any {
        return {
            "m.relates_to": {
                "m.in_reply_to": {
                    "event_id": event["event_id"],
                },
            },
            "msgtype": "m.text", // for those who just want to send the reply as-is
            "body": withText,
            ...(withHtml && {
                "format": "org.matrix.custom.html",
                "formatted_body": withHtml,
            }),
        };
    }
}

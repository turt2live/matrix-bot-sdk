import { MatrixClient } from "../MatrixClient";
import { IPreprocessor } from "./IPreprocessor";
import { EventKind, LogService } from "..";

/**
 * Metadata for a rich reply. Usually stored under the "mx_richreply"
 * field of an event (at the top level).
 * @category Preprocessors
 * @see RichRepliesPreprocessor
 */
export interface IRichReplyMetadata {
    /**
     * If true, the preprocessor found some inconsistencies in the reply
     * information that does not match the specification. For example,
     * this may indicate that a reply was sent without an HTML component.
     */
    wasLenient: boolean;

    /**
     * The event ID the event references. May be an empty string if
     * wasLenient is true.
     */
    parentEventId: string;

    /**
     * The fallback plain text the preprocessor found. May be an empty
     * string if wasLenient is true. The prefix characters to indicate
     * this is a fallback will have already been removed.
     */
    fallbackPlainBody: string;

    /**
     * The fallback HTML the processor found. May be an empty string if
     * wasLenient is true. The fallback structure will have already been
     * removed, leaving just the original assumed HTML.
     */
    fallbackHtmlBody: string;

    /**
     * The user ID that sent the parent event, as determined by the fallback
     * text. This should not be relied upon for anything serious, and instead
     * the preprocessor should be configured to fetch the real event to
     * populate the realEvent property. May be an empty string if wasLenient
     * is true.
     */
    fallbackSender: string;

    /**
     * If the preprocessor is configured to fetch event content, this field
     * will contain the event as reported by the homeserver. May be null if
     * wasLenient is true.
     */
    realEvent: any;
}

/**
 * Processes rich replies found in events. This automatically strips
 * the fallback representation from events, providing the information
 * as a top level "mx_richreply" key. The "mx_richreply" property may
 * be casted to the type IRichReplyMetadata.
 * @category Preprocessors
 */
export class RichRepliesPreprocessor implements IPreprocessor {

    /**
     * Creates a new rich replies preprocessor.
     * @param fetchRealEventContents If enabled, this preprocessor will
     * attempt to get the real event contents and append them to the event
     * information.
     */
    public constructor(private fetchRealEventContents = false) {
    }

    public getSupportedEventTypes(): string[] {
        return ["m.room.message"];
    }

    public async processEvent(event: any, client: MatrixClient, kind?: EventKind): Promise<any> {
        if (kind && kind !== EventKind.RoomEvent) return;

        if (!event["content"]) return;
        if (!event["content"]["m.relates_to"]) return;
        if (!event["content"]["m.relates_to"]["m.in_reply_to"]) return;

        const parentEventId = event["content"]["m.relates_to"]["m.in_reply_to"]["event_id"];
        if (!parentEventId) return;

        let fallbackHtml = "";
        let fallbackText = "";
        let fallbackSender = "";
        let realHtml = event["content"]["formatted_body"];
        let realText = event["content"]["body"];
        let lenient = false;

        if (event["content"]["format"] !== "org.matrix.custom.html" || !event["content"]["formatted_body"]) {
            lenient = true; // Not safe to parse: probably not HTML
        } else {
            const formattedBody = event["content"]["formatted_body"];
            if (!formattedBody.startsWith("<mx-reply>") || formattedBody.indexOf("</mx-reply>") === -1) {
                lenient = true; // Doesn't look like a reply
            } else {
                const parts = formattedBody.split("</mx-reply>");
                const fbHtml = parts[0];
                realHtml = parts[1];

                const results = fbHtml.match(/<br[ ]*[\/]{0,2}>(.*)<\/blockquote>\s*$/i);
                if (!results) {
                    lenient = true;
                } else {
                    fallbackHtml = results[1];
                }
            }
        }

        let lastLine = "";
        let processedFallback = false;
        const body = event["content"]["body"] || "";
        for (const line of body.split("\n")) {
            if (line.startsWith("> ") && !processedFallback) {
                fallbackText += line.substring(2) + "\n";
                lastLine = line;
            } else if (!processedFallback) {
                lastLine = line;
                realText = "";
                processedFallback = true;
            } else {
                realText += line + "\n";
            }
        }

        const firstFallbackLine = fallbackText.split("\n")[0];
        const matches = firstFallbackLine.match(/<(@.*:.*)>/);
        if (!matches) {
            lenient = true;
        } else {
            fallbackSender = matches[1];
        }

        const metadata: IRichReplyMetadata = {
            wasLenient: lenient,
            fallbackHtmlBody: fallbackHtml ? fallbackHtml.trim() : "",
            fallbackPlainBody: fallbackText ? fallbackText.trim() : "",
            fallbackSender: fallbackSender ? fallbackSender.trim() : "",
            parentEventId: parentEventId ? parentEventId.trim() : "",
            realEvent: null,
        };

        if (this.fetchRealEventContents) {
            try {
                metadata.realEvent = await client.getEvent(event["room_id"], parentEventId);
            } catch (e) {
                LogService.error("RichRepliesPreprocessor", "Failed to fetch real event:");
                LogService.error("RichRepliesPreprocessor", e);
                metadata.wasLenient = true; // failed to fetch event
            }
        }

        event["mx_richreply"] = metadata;
        event["content"]["body"] = realText.trim();
        event["content"]["formatted_body"] = realHtml.trim();
        return event;
    }
}

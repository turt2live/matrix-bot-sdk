import { RoomEvent } from "./RoomEvent";
import { EventRedactedError } from "./InvalidEventError";

/**
 * The types of messages that are valid in Matrix.
 */
export type MessageType =
    "m.text"
    | "m.emote"
    | "m.notice"
    | "m.image"
    | "m.file"
    | "m.audio"
    | "m.location"
    | "m.video"
    | string;

/**
 * Information about a file in Matrix
 */
export interface FileInfo {
    /**
     * The size of the file in bytes.
     */
    size?: number;

    /**
     * The type of file.
     */
    mimetype?: string;
}

export interface ThumbnailInfo {
    /**
     * The size of the thumbnail in bytes.
     */
    size?: number;

    /**
     * The type of thumbnail.
     */
    mimetype?: string;

    /**
     * The intended height of the thumbnail in pixels.
     */
    h: number;

    /**
     * The intended width of the thumbnail in pixels.
     */
    w: number;
}

/**
 * Information about a file's thumbnail.
 */
export interface ThumbnailedFileInfo {
    /**
     * A URL to a thumbnail for the file.
     */
    thumbnail_url?: string;

    /**
     * Information about the thumbnail. Optionally included if a thumbnail_url is specified.
     */
    thumbnail_info?: ThumbnailInfo;
}

/**
 * Information about a file that has a thumbnail
 */
export interface FileWithThumbnailInfo extends FileInfo, ThumbnailedFileInfo {
}

/**
 * Information about a file that has a width and height.
 */
export interface DimensionalFileInfo extends FileWithThumbnailInfo {
    /**
     * The intended height of the media in pixels.
     */
    h: number;

    /**
     * The intended width of the media in pixels.
     */
    w: number;
}

/**
 * Information about a file that has a time dimension.
 */
export interface TimedFileInfo extends FileInfo {
    /**
     * The duration of the media in milliseconds.
     */
    duration: number;
}

/**
 * Information about a video file.
 */
export interface VideoFileInfo extends DimensionalFileInfo, TimedFileInfo {
    // No new properties.
}

/**
 * The content definition for m.room.message events with a type of m.audio
 */
export interface AudioMessageEventContent extends FileMessageEventContent {
    /**
     * Information about the file.
     */
    info?: TimedFileInfo;
}

/**
 * The content definition for m.room.message events with a type of m.video
 */
export interface VideoMessageEventContent extends FileMessageEventContent {
    /**
     * Information about the file.
     */
    info?: VideoFileInfo;
}

/**
 * The content definition for m.room.message events with a type of m.image
 */
export interface ImageMessageEventContent extends FileMessageEventContent {
    /**
     * Information about the file.
     */
    info?: DimensionalFileInfo;
}

/**
 * The content definition for m.room.message events with a type of m.file
 */
export interface FileMessageEventContent extends MessageEventContent {
    /**
     * Information about the file.
     */
    info?: FileWithThumbnailInfo;

    /**
     * URL to the file.
     */
    url: string;
}

/**
 * The content definition for m.room.message events with a type of m.location
 */
export interface LocationMessageEventContent extends MessageEventContent {
    /**
     * Information about the location.
     */
    info?: ThumbnailedFileInfo;

    /**
     * A geo URI of the location.
     */
    geo_uri?: string;
}

/**
 * The content definition for m.room.message events with types of m.text, m.emote, and m.notice
 */
export interface TextualMessageEventContent extends MessageEventContent {
    format?: string;
    formatted_body?: string;
}

/**
 * The content definition for m.room.message events
 */
export interface MessageEventContent {
    body: string;
    msgtype: MessageType;
}

/**
 * Represents an m.room.message room event
 */
export class MessageEvent<T extends MessageEventContent> extends RoomEvent<T> {
    constructor(event: any) {
        super(event);
    }

    public get isRedacted(): boolean {
        // Presume the event redacted if we're missing a body or message type
        const noContent = !this.content.body && this.content.body !== "";
        const noMsgtype = !this.content.msgtype && this.content.msgtype !== "";
        return noContent || noMsgtype;
    }

    public get messageType(): MessageType {
        const type = this.content.msgtype;
        if (!type && type !== "") throw new EventRedactedError("missing msgtype");
        return type;
    }

    public get textBody(): string {
        const body = this.content.body;
        if (!body && body !== "") throw new EventRedactedError("missing body");
        return body;
    }
}

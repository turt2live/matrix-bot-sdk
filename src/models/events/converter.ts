import { MembershipEvent } from "./MembershipEvent";
import { RoomEvent, StateEvent } from "./RoomEvent";
import {
    AudioMessageEventContent,
    ImageMessageEventContent,
    LocationMessageEventContent,
    MessageEvent,
    MessageEventContent,
    TextualMessageEventContent,
    VideoMessageEventContent
} from "./MessageEvent";

/**
 * Wraps a room event into a more suitable container.
 * @param {any} event The event object to wrap.
 * @returns {RoomEvent<any>} An instance of the most suitable container for the event.
 * @category Matrix events
 */
export function wrapRoomEvent(event: any): RoomEvent<any> {
    if (!event) return null;

    if (typeof(event['state_key']) === 'string') {
        if (event['type'] === 'm.room.member') {
            return new MembershipEvent(event);
        } else {
            return new StateEvent<any>(event);
        }
    } else if (event['type'] === 'm.room.message') {
        const content = event['content'];
        const msgtype = content ? content['msgtype'] : null;
        if (msgtype === "m.text" || msgtype === "m.notice" || msgtype === "m.emote") {
            return new MessageEvent<TextualMessageEventContent>(event);
        } else if (msgtype === "m.audio") {
            return new MessageEvent<AudioMessageEventContent>(event);
        } else if (msgtype === "m.video") {
            return new MessageEvent<VideoMessageEventContent>(event);
        } else if (msgtype === "m.image") {
            return new MessageEvent<ImageMessageEventContent>(event);
        } else if (msgtype === "m.location") {
            return new MessageEvent<LocationMessageEventContent>(event);
        } else {
            return new MessageEvent<MessageEventContent>(event);
        }
    } else {
        return new RoomEvent<any>(event)
    }
}

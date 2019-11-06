import * as expect from "expect";
import { PermalinkParts, Permalinks } from "../src";


describe('Permalinks', () => {

    describe('forRoom', () => {

        it('should generate a URL for a room ID', () => {
            const roomId = "!test:example.org";
            const expected = `https://matrix.to/#/${roomId}`;
            expect(Permalinks.forRoom(roomId)).toBe(expected);
        });


        it('should generate a URL for a room alias', () => {
            const roomAlias = "#test:example.org";
            const expected = `https://matrix.to/#/${roomAlias}`;
            expect(Permalinks.forRoom(roomAlias)).toBe(expected);
        });


        it('should generate a URL for a room ID with via', () => {
            const roomId = "!test:example.org";
            const via = ['one.example.org', 'two.example.org'];
            const expected = `https://matrix.to/#/${roomId}?via=${via.join("via=")}`;
            expect(Permalinks.forRoom(roomId, via)).toBe(expected);
        });


        it('should generate a URL for a room alias with via', () => {
            const roomAlias = "#test:example.org";
            const via = ['one.example.org', 'two.example.org'];
            const expected = `https://matrix.to/#/${roomAlias}?via=${via.join("via=")}`;
            expect(Permalinks.forRoom(roomAlias, via)).toBe(expected);
        });
    });


    describe('forEvent', () => {

        it('should generate a URL for an event ID with room ID', () => {
            const roomId = "!test:example.org";
            const eventId = "$test:example.org";
            const expected = `https://matrix.to/#/${roomId}/${eventId}`;
            expect(Permalinks.forEvent(roomId, eventId)).toBe(expected);
        });


        it('should generate a URL for an event ID with room alias', () => {
            const roomAlias = "#test:example.org";
            const eventId = "$test:example.org";
            const expected = `https://matrix.to/#/${roomAlias}/${eventId}`;
            expect(Permalinks.forEvent(roomAlias, eventId)).toBe(expected);
        });


        it('should generate a URL for an event ID with room ID with via', () => {
            const roomId = "!test:example.org";
            const eventId = "$test:example.org";
            const via = ['one.example.org', 'two.example.org'];
            const expected = `https://matrix.to/#/${roomId}/${eventId}?via=${via.join("via=")}`;
            expect(Permalinks.forEvent(roomId, eventId, via)).toBe(expected);
        });


        it('should generate a URL for an event ID with room alias with via', () => {
            const roomAlias = "#test:example.org";
            const eventId = "$test:example.org";
            const via = ['one.example.org', 'two.example.org'];
            const expected = `https://matrix.to/#/${roomAlias}/${eventId}?via=${via.join("via=")}`;
            expect(Permalinks.forEvent(roomAlias, eventId, via)).toBe(expected);
        });
    });


    describe('forUser', () => {

        it('should generate a URL for a user ID', () => {
            const userId = "@test:example.org";
            const expected = `https://matrix.to/#/${userId}`;
            expect(Permalinks.forUser(userId)).toBe(expected);
        });
    });


    describe('parseUrl', () => {

        it('should parse user URLs', () => {
            const userId = "@test:example.org";
            const expected: PermalinkParts = {userId, roomIdOrAlias: undefined, viaServers: undefined, eventId: undefined};
            const parsed = Permalinks.parseUrl(`https://matrix.to/#/${userId}`);

            expect(parsed).toMatchObject(<any>expected);
        });


        it('should parse room alias URLs', () => {
            const roomId = "#test:example.org";
            const expected: PermalinkParts = {userId: undefined, roomIdOrAlias: roomId, viaServers: [], eventId: undefined};
            const parsed = Permalinks.parseUrl(`https://matrix.to/#/${roomId}`);

            expect(parsed).toMatchObject(<any>expected);
        });


        it('should parse room ID URLs', () => {
            const roomId = "!test:example.org";
            const expected: PermalinkParts = {userId: undefined, roomIdOrAlias: roomId, viaServers: [], eventId: undefined};
            const parsed = Permalinks.parseUrl(`https://matrix.to/#/${roomId}`);

            expect(parsed).toMatchObject(<any>expected);
        });


        it('should parse room alias permalink URLs', () => {
            const roomId = "#test:example.org";
            const eventId = "$ev:example.org";
            const expected: PermalinkParts = {userId: undefined, roomIdOrAlias: roomId, viaServers: [], eventId};
            const parsed = Permalinks.parseUrl(`https://matrix.to/#/${roomId}/${eventId}`);

            expect(parsed).toMatchObject(<any>expected);
        });


        it('should parse room ID permalink URLs', () => {
            const roomId = "!test:example.org";
            const eventId = "$ev:example.org";
            const expected: PermalinkParts = {userId: undefined, roomIdOrAlias: roomId, viaServers: [], eventId};
            const parsed = Permalinks.parseUrl(`https://matrix.to/#/${roomId}/${eventId}`);

            expect(parsed).toMatchObject(<any>expected);
        });


        it('should parse room alias permalink URLs with via servers', () => {
            const roomId = "#test:example.org";
            const eventId = "$ev:example.org";
            const via = ["one.example.org", "two.example.org"];
            const expected: PermalinkParts = {userId: undefined, roomIdOrAlias: roomId, viaServers: via, eventId};
            const parsed = Permalinks.parseUrl(`https://matrix.to/#/${roomId}/${eventId}?via=${via.join("via=")}`);

            expect(parsed).toMatchObject(<any>expected);
        });


        it('should parse room ID permalink URLs with via servers', () => {
            const roomId = "!test:example.org";
            const eventId = "$ev:example.org";
            const via = ["one.example.org", "two.example.org"];
            const expected: PermalinkParts = {userId: undefined, roomIdOrAlias: roomId, viaServers: via, eventId};
            const parsed = Permalinks.parseUrl(`https://matrix.to/#/${roomId}/${eventId}?via=${via.join("via=")}`);

            expect(parsed).toMatchObject(<any>expected);
        });
    });
});

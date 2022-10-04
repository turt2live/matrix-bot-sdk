import HttpBackend from 'matrix-mock-request';

import { IStorageProvider, MatrixClient, MSC2380MediaInfo, UnstableApis } from "../src";
import { createTestClient } from "./TestUtils";

export function createTestUnstableClient(
    storage: IStorageProvider = null,
): {
    client: UnstableApis;
    mxClient: MatrixClient;
    http: HttpBackend;
    hsUrl: string;
    accessToken: string;
} {
    const result = createTestClient(storage);
    const mxClient = result.client;
    const client = new UnstableApis(mxClient);

    delete result.client;

    return { ...result, client, mxClient };
}

describe('UnstableApis', () => {
    describe('getRoomAliases', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const aliases = ["#test:example.org", "#test2:example.org"];
            const roomId = "!room:example.org";

            http.when("GET", "/_matrix/client/unstable/org.matrix.msc2432/rooms").respond(200, (path, content) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/org.matrix.msc2432/rooms/${encodeURIComponent(roomId)}/aliases`);
                return { aliases: aliases };
            });

            const [result] = await Promise.all([client.getRoomAliases(roomId), http.flushAllExpected()]);
            expect(result).toMatchObject(aliases);
        });
    });

    describe('addReactionToEvent', () => {
        it('should send an m.reaction event', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const roomId = "!test:example.org";
            const originalEventId = "$orig:example.org";
            const newEventId = "$new:example.org";
            const emoji = "😀";
            const expectedReaction = {
                "m.relates_to": {
                    event_id: originalEventId,
                    key: emoji,
                    rel_type: "m.annotation",
                },
            };

            http.when("PUT", "/_matrix/client/v3/rooms").respond(200, (path, content) => {
                const idx = path.indexOf(`${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.reaction/`);
                expect(idx).toBe(0);
                expect(content).toMatchObject(expectedReaction);
                return { event_id: newEventId };
            });

            const [result] = await Promise.all([client.addReactionToEvent(roomId, originalEventId, emoji), http.flushAllExpected()]);
            expect(result).toEqual(newEventId);
        });
    });

    describe('getRelationsForEvent', () => {
        test.each([
            [null, null],
            ['org.example.relation', null],
            ['org.example.relation', 'org.example.event_type'],
        ])("should call the right endpoint for rel=%p and type=%p", async (relType, eventType) => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const roomId = "!room:example.org";
            const eventId = "$event";
            const response = {
                chunk: [
                    { eventContents: true },
                    { eventContents: true },
                    { eventContents: true },
                ],
            };

            http.when("GET", "/_matrix/client/unstable/rooms").respond(200, (path, content) => {
                const relTypeComponent = relType ? `/${encodeURIComponent(relType)}` : '';
                const eventTypeComponent = eventType ? `/${encodeURIComponent(eventType)}` : '';
                // eslint-disable-next-line max-len
                const idx = path.indexOf(`${hsUrl}/_matrix/client/unstable/rooms/${encodeURIComponent(roomId)}/relations/${encodeURIComponent(eventId)}${relTypeComponent}${eventTypeComponent}`);
                expect(idx).toBe(0);
                return response;
            });

            const [result] = await Promise.all([client.getRelationsForEvent(roomId, eventId, relType, eventType), http.flushAllExpected()]);
            expect(result).toEqual(response);
        });
    });

    describe('getMediaInfo', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const domain = "example.org";
            const mediaId = "abc123";
            const mxc = `mxc://${domain}/${mediaId}`;
            const response: MSC2380MediaInfo = {
                content_type: "image/png",
                size: 12,
            };

            http.when("GET", "/_matrix/media/unstable/info").respond(200, (path, content) => {
                const idx = path.indexOf(`${hsUrl}/_matrix/media/unstable/info/${encodeURIComponent(domain)}/${encodeURIComponent(mediaId)}`);
                expect(idx).toBe(0);
                return response;
            });

            const [result] = await Promise.all([client.getMediaInfo(mxc), http.flushAllExpected()]);
            expect(result).toEqual(response);
        });

        test.each([
            ["invalid", "'mxcUrl' does not begin with mxc://"],
            ["mxc://", "Missing domain or media ID"],
            ["mxc://domainonly", "Missing domain or media ID"],
            ["mxc://emptymedia/", "Missing domain or media ID"],
        ])("should fail if the MXC URI is invalid: %p / %p", async (val, err) => {
            const { client } = createTestUnstableClient();

            await expect(client.getMediaInfo(val)).rejects.toThrow(err);
        });
    });
});

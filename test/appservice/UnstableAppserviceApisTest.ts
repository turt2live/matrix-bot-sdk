import HttpBackend from 'matrix-mock-request';

import { IStorageProvider, MatrixClient, MSC2716BatchSendResponse, UnstableAppserviceApis } from "../../src";
import { createTestClient } from "../TestUtils";

export function createTestUnstableClient(
    storage: IStorageProvider = null,
): {
    client: UnstableAppserviceApis;
    mxClient: MatrixClient;
    http: HttpBackend;
    hsUrl: string;
    accessToken: string;
} {
    const result = createTestClient(storage);
    const mxClient = result.client;
    const client = new UnstableAppserviceApis(mxClient);

    delete result.client;

    return { ...result, client, mxClient };
}

describe('UnstableAppserviceApis', () => {
    describe('sendHistoricalEventBatch', () => {
        it('should call the right endpoint', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const events = [{ foo: 5 }, { bar: 10 }];
            const stateEvents = [{ baz: 20 }, { pong: 30 }];
            const roomId = "!room:example.org";
            const prevEventId = "$prevEvent:example.org";
            const prevChunkId = "chunkychunkyids";
            const expectedResponse = {
                state_events: ["$stateEv1:example.org", "$stateEv2:example.org"],
                events: ["$event1:example.org", "$event2:example.org"],
                next_chunk_id: "evenchunkierid",
            } as MSC2716BatchSendResponse;

            http.when("POST", `/_matrix/client/unstable/org.matrix.msc2716/rooms/`).respond(200, (path, content, req) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/org.matrix.msc2716/rooms/${encodeURIComponent(roomId)}/batch_send`);
                expect(req.queryParams).toMatchObject({
                    prev_event: prevEventId,
                    chunk_id: prevChunkId,
                });
                expect(content).toMatchObject({
                    events: events,
                    state_events_at_start: stateEvents,
                });

                return expectedResponse;
            });

            const [result] = await Promise.all([
                client.sendHistoricalEventBatch(roomId, prevEventId, events, stateEvents, prevChunkId),
                http.flushAllExpected(),
            ]);
            expect(result).toEqual(expectedResponse);
        });
    });

    describe('sendEventWithTimestamp', () => {
        it('should call the right endpoint with a timestamp', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const roomId = "!testing:example.org";
            const eventId = "$something:example.org";
            const eventType = "io.t2bot.test";
            const eventContent = {
                testing: "hello world",
                sample: true,
            };
            const ts = 5000;

            http.when("PUT", "/_matrix/client/v3/rooms").respond(200, (path, content, req) => {
                const idx = path.indexOf(`${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(eventType)}/`);
                expect(idx).toBe(0);
                expect(content).toMatchObject(eventContent);
                expect(req.queryParams).toMatchObject({ ts });
                return { event_id: eventId };
            });

            const [result] = await Promise.all([client.sendEventWithTimestamp(roomId, eventType, eventContent, ts), http.flushAllExpected()]);
            expect(result).toEqual(eventId);
        });
    });

    describe('sendStateEvent', () => {
        it('should call the right endpoint with a timestamp', async () => {
            const { client, http, hsUrl } = createTestUnstableClient();

            const roomId = "!testing:example.org";
            const eventId = "$something:example.org";
            const stateKey = "testing";
            const eventType = "m.room.message";
            const eventContent = {
                body: "Hello World",
                msgtype: "m.text",
                sample: true,
            };
            const ts = 5000;

            http.when("PUT", "/_matrix/client/v3/rooms").respond(200, (path, content, req) => {
                const idx = path.indexOf(`${hsUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/`);
                expect(idx).toBe(0);
                expect(content).toMatchObject(eventContent);
                expect(req.queryParams).toMatchObject({ ts });
                return { event_id: eventId };
            });

            const [result] = await Promise.all([client.sendStateEventWithTimestamp(roomId, eventType, stateKey, eventContent, ts), http.flushAllExpected()]);
            expect(result).toEqual(eventId);
        });
    });
});

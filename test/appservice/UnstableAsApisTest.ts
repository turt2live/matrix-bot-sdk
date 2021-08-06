import * as expect from "expect";
import { MatrixClient } from "../../src/MatrixClient";
import * as MockHttpBackend from 'matrix-mock-request';
import * as simple from "simple-mock";
import { IStorageProvider, MSC2716BatchSendResponse, UnstableApis, UnstableAsApis } from "../../src";
import { createTestClient } from "../MatrixClientTest";

export function createTestUnstableClient(storage: IStorageProvider = null): { client: UnstableAsApis, mxClient: MatrixClient, http: MockHttpBackend, hsUrl: string, accessToken: string } {
    const result = createTestClient(storage);
    const mxClient = result.client;
    const client = new UnstableAsApis(mxClient);

    delete result.client;

    return {...result, client, mxClient};
}

describe('UnstableApis', () => {
    describe('sendHistoricalEventBatch', () => {
        it('should call the right endpoint', async () => {
            const {client, http, hsUrl} = createTestUnstableClient();

            const events = [{foo: 5}, {bar: 10}];
            const stateEvents = [{baz: 20}, {pong: 30}];
            const roomId = "!room:example.org";
            const prevEventId = "$prevEvent:example.org";
            const prevChunkId = "chunkychunkyids";
            const expectedResponse = {
                state_events: ["$stateEv1:example.org", "$stateEv2:example.org"],
                events: ["$event1:example.org", "$event2:example.org"],
                next_chunk_id: "evenchunkierid",
            } as MSC2716BatchSendResponse;

            http.when("POST", `/_matrix/client/unstable/org.matrix.msc2716/rooms/${encodeURIComponent(roomId)}/batch_send`).respond(200, (path, content, {opts}) => {
                expect(path).toEqual(`${hsUrl}/_matrix/client/unstable/org.matrix.msc2716/rooms/${encodeURIComponent(roomId)}/batch_send`);
                expect(opts.qs).toEqual({
                    prev_event: prevEventId,
                    chunk_id: prevChunkId,
                })
                expect(content).toEqual({
                    events: events,
                    state_events_at_start: stateEvents,
                });

                return expectedResponse;
            });

            http.flushAllExpected();
            const result = await client.sendHistoricalEventBatch(roomId, prevEventId, events, stateEvents, prevChunkId);
            expect(result).toEqual(expectedResponse);
        });
    });
});

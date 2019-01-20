import { AutojoinRoomsMixin } from "../../src";
import * as expect from "expect";
import * as simple from "simple-mock";
import { createTestClient } from "../MatrixClientTest";

// @ts-ignore
describe('AutojoinRoomsMixin', () => {
    // @ts-ignore
    it('should join rooms for regular invites', () => {
        const {client} = createTestClient();

        const roomId = "!test:example.org";

        const joinSpy = simple.mock(client, "joinRoom").callFn((rid) => {
            expect(rid).toEqual(roomId);
        });

        AutojoinRoomsMixin.setupOnClient(client);
        client.emit("room.invite", roomId, {});
        expect(joinSpy.callCount).toBe(1);
    });
});

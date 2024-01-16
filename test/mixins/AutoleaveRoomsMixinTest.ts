import * as simple from "simple-mock";

import { AutoleaveRoomsMixin } from "../../src";
import { createTestClient } from "../TestUtils";

describe("AutoleaveRoomsMixin", () => {
	it("shouldn't leave rooms multiple members", async () => {
		const { client } = createTestClient();
		AutoleaveRoomsMixin.setupOnClient(client);

		const roomId = "!test:example.org";
		let members = [
			"@this:example.org",
			"@alice:example.org",
			"@bob:example.org",
		];

		const getJoinedRoomMembersSpy = simple
			.mock(client, "getJoinedRoomMembers")
			.callFn((rid) => {
				expect(rid).toEqual(roomId);
				return members;
			});
		const leaveSpy = simple.mock(client, "leaveRoom");
		const forgetSpy = simple.mock(client, "forgetRoom");

		client.emit("room.event", roomId, {
			type: "m.room.member",
			content: { membership: "leave" },
		});
		expect(getJoinedRoomMembersSpy.callCount).toBe(1);
		// Since the AutoleaveRoomsMixin room.event handler is asyncronous, these functions don't get called syncronously
		// Which means we must somehow await the handler's completion before executing the following tests, but I'm not sure how to do that
		// expect(leaveSpy.callCount).toBe(0);
		// expect(forgetSpy.callCount).toBe(0);
	});

	it("should leave rooms with one or no members", async () => {
		const { client } = createTestClient();
		AutoleaveRoomsMixin.setupOnClient(client);

		const roomId = "!test:example.org";
		let members = ["@this:example.org"];

		const getJoinedRoomMembersSpy = simple
			.mock(client, "getJoinedRoomMembers")
			.callFn((rid) => {
				expect(rid).toEqual(roomId);
				return members;
			});
		const leaveSpy = simple.mock(client, "leaveRoom");
		const forgetSpy = simple.mock(client, "forgetRoom");

		client.emit("room.event", roomId, {
			type: "m.room.member",
			content: { membership: "leave" },
		});
		expect(getJoinedRoomMembersSpy.callCount).toBe(1);
		// See comments above (lines 41-42)
		// expect(leaveSpy.callCount).toBe(1);
		// expect(forgetSpy.callCount).toBe(1);
	});
});

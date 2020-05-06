import { MatrixEvent } from "../../../src";
import * as expect from "expect";

export function createMinimalEvent(content: any = {hello: "world"}) {
    return {
        sender: "@alice:example.org",
        type: "org.example.test",
        content: {...content},
    };
}

describe("MatrixEvent", () => {
    it("should return the right fields", () => {
        const ev = createMinimalEvent();
        const obj = new MatrixEvent<any>(ev);

        expect(obj.sender).toEqual(ev.sender);
        expect(obj.type).toEqual(ev.type);
        expect(obj.content).toMatchObject(ev.content);
        expect(obj.raw).toBe(ev);
    });
});

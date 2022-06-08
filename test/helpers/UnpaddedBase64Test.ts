import { UnpaddedBase64 } from "../../src";

describe('UnpaddedBase64', () => {
    it('should encode buffers', () => {
        expect(UnpaddedBase64.encodeBuffer(Buffer.from(""))).toEqual("");
        expect(UnpaddedBase64.encodeBuffer(Buffer.from("f"))).toEqual("Zg");
        expect(UnpaddedBase64.encodeBuffer(Buffer.from("fo"))).toEqual("Zm8");
        expect(UnpaddedBase64.encodeBuffer(Buffer.from("foo"))).toEqual("Zm9v");
        expect(UnpaddedBase64.encodeBuffer(Buffer.from("foob"))).toEqual("Zm9vYg");
        expect(UnpaddedBase64.encodeBuffer(Buffer.from("fooba"))).toEqual("Zm9vYmE");
        expect(UnpaddedBase64.encodeBuffer(Buffer.from("foobar"))).toEqual("Zm9vYmFy");
    });

    it('should encode strings', () => {
        expect(UnpaddedBase64.encodeString("")).toEqual("");
        expect(UnpaddedBase64.encodeString("f")).toEqual("Zg");
        expect(UnpaddedBase64.encodeString("fo")).toEqual("Zm8");
        expect(UnpaddedBase64.encodeString("foo")).toEqual("Zm9v");
        expect(UnpaddedBase64.encodeString("foob")).toEqual("Zm9vYg");
        expect(UnpaddedBase64.encodeString("fooba")).toEqual("Zm9vYmE");
        expect(UnpaddedBase64.encodeString("foobar")).toEqual("Zm9vYmFy");
    });
    it('should encode buffers (url safe)', () => {
        expect(UnpaddedBase64.encodeBufferUrlSafe(Buffer.from("😄😄🎉👀👷‍♂️👼"))).toEqual("8J-YhPCfmITwn46J8J-RgPCfkbfigI3imYLvuI_wn5G8");
    });

    it('should encode strings (url safe)', () => {
        expect(UnpaddedBase64.encodeStringUrlSafe("😄😄🎉👀👷‍♂️👼")).toEqual("8J-YhPCfmITwn46J8J-RgPCfkbfigI3imYLvuI_wn5G8");
    });
});

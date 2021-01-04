import * as expect from "expect";
import { UnpaddedBase64 } from "../../src";

describe('UnpaddedBase64', () => {
    it('should encode buffers', () => {
        expect(UnpaddedBase64.encodeBuffer(new Buffer(""))).toEqual("");
        expect(UnpaddedBase64.encodeBuffer(new Buffer("f"))).toEqual("Zg");
        expect(UnpaddedBase64.encodeBuffer(new Buffer("fo"))).toEqual("Zm8");
        expect(UnpaddedBase64.encodeBuffer(new Buffer("foo"))).toEqual("Zm9v");
        expect(UnpaddedBase64.encodeBuffer(new Buffer("foob"))).toEqual("Zm9vYg");
        expect(UnpaddedBase64.encodeBuffer(new Buffer("fooba"))).toEqual("Zm9vYmE");
        expect(UnpaddedBase64.encodeBuffer(new Buffer("foobar"))).toEqual("Zm9vYmFy");
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
        expect(UnpaddedBase64.encodeBufferUrlSafe(new Buffer("😄😄🎉👀👷‍♂️👼"))).toEqual("8J-YhPCfmITwn46J8J-RgPCfkbfigI3imYLvuI_wn5G8");
    });

    it('should encode strings (url safe)', () => {
        expect(UnpaddedBase64.encodeStringUrlSafe("😄😄🎉👀👷‍♂️👼")).toEqual("8J-YhPCfmITwn46J8J-RgPCfkbfigI3imYLvuI_wn5G8");
    });
});

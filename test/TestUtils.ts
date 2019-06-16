import * as expect from "expect";

export function expectArrayEquals(expected: any[], actual: any[]) {
    expect(expected).toBeDefined();
    expect(actual).toBeDefined();
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < actual.length; i++) {
        expect(actual[i]).toEqual(expected[i]);
    }
}
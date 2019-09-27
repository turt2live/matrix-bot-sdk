import * as expect from "expect";
import { PermalinkParts, Permalinks } from "../src";
import { MatrixGlob } from "../src/MatrixGlob";

// @ts-ignore
describe('MatrixGlob', () => {
    // @ts-ignore
    it('should work with no glob characters', () => {
        const glob = "example.org";
        const passingTest = "example.org";
        const failingTest = "notexample.org";

        const mtxGlob = new MatrixGlob(glob);
        expect(mtxGlob.test(passingTest)).toBe(true);
        expect(mtxGlob.test(failingTest)).toBe(false);
    });

    // @ts-ignore
    it('should work with leading glob characters: *', () => {
        const glob = "*example.org";
        const passingTest = "123.example.org";
        const failingTest = "example.orgnot";

        const mtxGlob = new MatrixGlob(glob);
        expect(mtxGlob.test(passingTest)).toBe(true);
        expect(mtxGlob.test(failingTest)).toBe(false);
    });

    // @ts-ignore
    it('should work with trailing glob characters: *', () => {
        const glob = "example.org*";
        const passingTest = "example.org.123";
        const failingTest = "notexample.org";

        const mtxGlob = new MatrixGlob(glob);
        expect(mtxGlob.test(passingTest)).toBe(true);
        expect(mtxGlob.test(failingTest)).toBe(false);
    });

    // @ts-ignore
    it('should work with middle glob characters: *', () => {
        const glob = "example*.org";
        const passingTest = "example123.org";
        const failingTest = "notexample.org";

        const mtxGlob = new MatrixGlob(glob);
        expect(mtxGlob.test(passingTest)).toBe(true);
        expect(mtxGlob.test(failingTest)).toBe(false);
    });

    // @ts-ignore
    it('should work with leading glob characters: ?', () => {
        const glob = "?example.org";
        const passingTest = "1example.org";
        const failingTest = "12example.org";

        const mtxGlob = new MatrixGlob(glob);
        expect(mtxGlob.test(passingTest)).toBe(true);
        expect(mtxGlob.test(failingTest)).toBe(false);
    });

    // @ts-ignore
    it('should work with trailing glob characters: ?', () => {
        const glob = "example.org?";
        const passingTest = "example.org1";
        const failingTest = "example.org12";

        const mtxGlob = new MatrixGlob(glob);
        expect(mtxGlob.test(passingTest)).toBe(true);
        expect(mtxGlob.test(failingTest)).toBe(false);
    });

    // @ts-ignore
    it('should work with middle glob characters: ?', () => {
        const glob = "example?.org";
        const passingTest = "example1.org";
        const failingTest = "example12.org";

        const mtxGlob = new MatrixGlob(glob);
        expect(mtxGlob.test(passingTest)).toBe(true);
        expect(mtxGlob.test(failingTest)).toBe(false);
    });
});

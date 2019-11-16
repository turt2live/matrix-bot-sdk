import { UserID } from "../../src";
import * as expect from "expect";
import { MatrixProfile, MatrixProfileInfo } from "../../src/models/MatrixProfile";

describe("MatrixProfile", () => {
    it("should return the right fields", () => {
        const profile: MatrixProfileInfo = {
            displayname: "test",
            avatar_url: "mxc://example.org/abc123",
        };
        const userId = new UserID("@alice:example.org");
        const obj = new MatrixProfile(userId.toString(), profile);

        expect(obj.displayName).toEqual(profile.displayname);
        expect(obj.avatarUrl).toEqual(profile.avatar_url);
        expect(obj.mention).toBeDefined();
    });

    it("should return the localpart if there's no display name", () => {
        const profile: MatrixProfileInfo = {
            //displayname: "test",
            avatar_url: "mxc://example.org/abc123",
        };
        const userId = new UserID("@alice:example.org");
        const obj = new MatrixProfile(userId.toString(), profile);

        expect(obj.displayName).toEqual(userId.localpart);
        expect(obj.avatarUrl).toEqual(profile.avatar_url);
        expect(obj.mention).toBeDefined();
    });

    it("should convert empty avatar URLs to null", () => {
        const profile: MatrixProfileInfo = {
            displayname: "test",
            avatar_url: "",
        };
        const userId = new UserID("@alice:example.org");
        const obj = new MatrixProfile(userId.toString(), profile);

        expect(obj.displayName).toEqual(profile.displayname);
        expect(obj.avatarUrl).toEqual(null);
        expect(obj.mention).toBeDefined();
    });
});

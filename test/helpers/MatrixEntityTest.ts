import * as expect from "expect";
import { MatrixEntity, RoomAlias, UserID } from "../../src";

describe('MatrixEntity', () => {
    it('should parse arbitrary IDs', () => {
        const localpart = 'test';
        const domain = 'example.org';

        const entity = new MatrixEntity(`*${localpart}:${domain}`);

        expect(entity.localpart).toEqual(localpart);
        expect(entity.domain).toEqual(domain);
    });

    it('should parse arbitrary IDs with ports in the server name', () => {
        const localpart = 'test';
        const domain = 'example.org:8448';

        const entity = new MatrixEntity(`*${localpart}:${domain}`);

        expect(entity.localpart).toEqual(localpart);
        expect(entity.domain).toEqual(domain);
    });
});

describe('UserID', () => {
    it('should parse user IDs', () => {
        const localpart = 'test';
        const domain = 'example.org';

        const entity = new UserID(`@${localpart}:${domain}`);

        expect(entity.localpart).toEqual(localpart);
        expect(entity.domain).toEqual(domain);
    });
});

describe('RoomAlias', () => {
    it('should parse room aliases', () => {
        const localpart = 'test';
        const domain = 'example.org';

        const entity = new RoomAlias(`#${localpart}:${domain}`);

        expect(entity.localpart).toEqual(localpart);
        expect(entity.domain).toEqual(domain);
    });
});

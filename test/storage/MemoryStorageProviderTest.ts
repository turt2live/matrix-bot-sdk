import { IFilterInfo, MemoryStorageProvider } from "../../src";
import * as expect from "expect";

describe('MemoryStorageProvider', () => {
    it('should return the right sync token', async () => {
        const provider = new MemoryStorageProvider();

        const value = "testing";
        expect(await provider.getSyncToken()).toBeFalsy();
        await provider.setSyncToken(value);
        expect(await provider.getSyncToken()).toEqual(value);
    });

    it('should return the right filter object', async () => {
        const provider = new MemoryStorageProvider();

        const value: IFilterInfo = {id: 12, filter: {hello: "world"}};
        expect(await provider.getFilter()).toBeFalsy();
        await provider.setFilter(value);
        expect(await provider.getFilter()).toMatchObject(<any>value);
    });

    it('should track registered users', async () => {
        const provider = new MemoryStorageProvider();

        const userIdA = "@first:example.org";
        const userIdB = "@second:example.org";

        expect(await provider.isUserRegistered(userIdA)).toBeFalsy();
        expect(await provider.isUserRegistered(userIdB)).toBeFalsy();
        await provider.addRegisteredUser(userIdA);
        expect(await provider.isUserRegistered(userIdA)).toBeTruthy();
        expect(await provider.isUserRegistered(userIdB)).toBeFalsy();
        await provider.addRegisteredUser(userIdA); // duplicated to make sure it is safe to do so
        expect(await provider.isUserRegistered(userIdA)).toBeTruthy();
        expect(await provider.isUserRegistered(userIdB)).toBeFalsy();
        await provider.addRegisteredUser(userIdB);
        expect(await provider.isUserRegistered(userIdA)).toBeTruthy();
        expect(await provider.isUserRegistered(userIdB)).toBeTruthy();
    });

    it('should track completed transactions', async () => {
        const provider = new MemoryStorageProvider();

        const txnA = "@first:example.org";
        const txnB = "@second:example.org";

        expect(await provider.isTransactionCompleted(txnA)).toBeFalsy();
        expect(await provider.isTransactionCompleted(txnB)).toBeFalsy();
        await provider.setTransactionCompleted(txnA);
        expect(await provider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(await provider.isTransactionCompleted(txnB)).toBeFalsy();
        await provider.setTransactionCompleted(txnA); // duplicated to make sure it is safe to do so
        expect(await provider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(await provider.isTransactionCompleted(txnB)).toBeFalsy();
        await provider.setTransactionCompleted(txnB);
        expect(await provider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(await provider.isTransactionCompleted(txnB)).toBeTruthy();
    });

    it('should track arbitrary key value pairs', async () => {
        const provider = new MemoryStorageProvider();

        const key = "test";
        const value = "example";

        expect(await provider.readValue(key)).toBeFalsy();
        await provider.storeValue(key, value);
        expect(await provider.readValue(key)).toEqual(value);
    });

    describe('namespacing', () => {
        it('should return the right sync token', async () => {
            const provider = new MemoryStorageProvider();

            const value = "testing";
            const namespace = "@user:example.org";

            const nsProvider = provider.storageForUser(namespace);
            expect(nsProvider).toBeDefined();

            expect(await provider.getSyncToken()).toBeFalsy();
            expect(await nsProvider.getSyncToken()).toBeFalsy();
            await nsProvider.setSyncToken(value);
            expect(await provider.getSyncToken()).toBeFalsy();
            expect(await nsProvider.getSyncToken()).toEqual(value);
        });

        it('should return the right filter object', async () => {
            const provider = new MemoryStorageProvider();

            const value: IFilterInfo = {id: 12, filter: {hello: "world"}};
            const namespace = "@user:example.org";

            const nsProvider = provider.storageForUser(namespace);
            expect(nsProvider).toBeDefined();

            expect(await provider.getFilter()).toBeFalsy();
            expect(await nsProvider.getFilter()).toBeFalsy();
            await nsProvider.setFilter(value);
            expect(await provider.getFilter()).toBeFalsy();
            expect(await nsProvider.getFilter()).toMatchObject(<any>value);
        });

        it('should track arbitrary key value pairs', async () => {
            const provider = new MemoryStorageProvider();

            const key = "test";
            const value = "example";
            const namespace = "@user:example.org";

            const nsProvider = provider.storageForUser(namespace);
            expect(nsProvider).toBeDefined();

            expect(await provider.readValue(key)).toBeFalsy();
            expect(await nsProvider.readValue(key)).toBeFalsy();
            await nsProvider.storeValue(key, value);
            expect(await provider.readValue(key)).toBeFalsy();
            expect(await nsProvider.readValue(key)).toEqual(value);
        });
    });
});

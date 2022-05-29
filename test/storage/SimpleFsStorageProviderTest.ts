import { IFilterInfo, SimpleFsStorageProvider } from "../../src";
import * as tmp from "tmp";

tmp.setGracefulCleanup();

function createSimpleFsStorageProvider(inMemory = false, maxMemTransactions = 20) {
    const tmpFile = tmp.fileSync();
    const writeProvider = new SimpleFsStorageProvider(tmpFile.name, inMemory, maxMemTransactions);
    const readProviderFn = () => new SimpleFsStorageProvider(tmpFile.name, inMemory, maxMemTransactions);

    return { tmpFile, writeProvider, readProviderFn };
}

describe('SimpleFsStorageProvider', () => {
    it('should return the right sync token', async () => {
        const { writeProvider, readProviderFn } = createSimpleFsStorageProvider();

        const value = "testing";
        expect(await writeProvider.getSyncToken()).toBeFalsy();
        await writeProvider.setSyncToken(value);
        expect(await writeProvider.getSyncToken()).toEqual(value);
        expect(await readProviderFn().getSyncToken()).toEqual(value);
    });

    it('should return the right filter object', async () => {
        const { writeProvider, readProviderFn } = createSimpleFsStorageProvider();

        const value: IFilterInfo = { id: 12, filter: { hello: "world" } };
        expect(await writeProvider.getFilter()).toBeFalsy();
        await writeProvider.setFilter(value);
        expect(await writeProvider.getFilter()).toMatchObject(<any>value);
        expect(await readProviderFn().getFilter()).toMatchObject(<any>value);
    });

    it('should track registered users', async () => {
        const { writeProvider, readProviderFn } = createSimpleFsStorageProvider();

        const userIdA = "@first:example.org";
        const userIdB = "@second:example.org";

        expect(await writeProvider.isUserRegistered(userIdA)).toBeFalsy();
        expect(await writeProvider.isUserRegistered(userIdB)).toBeFalsy();
        await writeProvider.addRegisteredUser(userIdA);
        expect(await writeProvider.isUserRegistered(userIdA)).toBeTruthy();
        expect(await writeProvider.isUserRegistered(userIdB)).toBeFalsy();
        expect(await readProviderFn().isUserRegistered(userIdA)).toBeTruthy();
        expect(await readProviderFn().isUserRegistered(userIdB)).toBeFalsy();
        await writeProvider.addRegisteredUser(userIdA); // duplicated to make sure it is safe to do so
        expect(await writeProvider.isUserRegistered(userIdA)).toBeTruthy();
        expect(await writeProvider.isUserRegistered(userIdB)).toBeFalsy();
        expect(await readProviderFn().isUserRegistered(userIdA)).toBeTruthy();
        expect(await readProviderFn().isUserRegistered(userIdB)).toBeFalsy();
        await writeProvider.addRegisteredUser(userIdB);
        expect(await writeProvider.isUserRegistered(userIdA)).toBeTruthy();
        expect(await writeProvider.isUserRegistered(userIdB)).toBeTruthy();
        expect(await readProviderFn().isUserRegistered(userIdA)).toBeTruthy();
        expect(await readProviderFn().isUserRegistered(userIdB)).toBeTruthy();
    });

    it('should track completed transactions', async () => {
        const { writeProvider, readProviderFn } = createSimpleFsStorageProvider();

        const txnA = "@first:example.org";
        const txnB = "@second:example.org";

        expect(await writeProvider.isTransactionCompleted(txnA)).toBeFalsy();
        expect(await writeProvider.isTransactionCompleted(txnB)).toBeFalsy();
        await writeProvider.setTransactionCompleted(txnA);
        expect(await writeProvider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(await writeProvider.isTransactionCompleted(txnB)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnA)).toBeTruthy();
        expect(await readProviderFn().isTransactionCompleted(txnB)).toBeFalsy();
        await writeProvider.setTransactionCompleted(txnA); // duplicated to make sure it is safe to do so
        expect(await writeProvider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(await writeProvider.isTransactionCompleted(txnB)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnA)).toBeTruthy();
        expect(await readProviderFn().isTransactionCompleted(txnB)).toBeFalsy();
        await writeProvider.setTransactionCompleted(txnB);
        expect(await writeProvider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(await writeProvider.isTransactionCompleted(txnB)).toBeTruthy();
        expect(await readProviderFn().isTransactionCompleted(txnA)).toBeTruthy();
        expect(await readProviderFn().isTransactionCompleted(txnB)).toBeTruthy();
    });

    it('should track a limited number of completed transactions in memory', async () => {
        const maxTransactions = 2;
        const { writeProvider, readProviderFn } = createSimpleFsStorageProvider(true, maxTransactions);

        const txnA = "@first:example.org";
        const txnB = "@second:example.org";
        const txnC = "@third:example.org";

        // The read provider results should always be falsey because the write provider
        // should not be writing to disk.

        expect(await writeProvider.isTransactionCompleted(txnA)).toBeFalsy();
        expect(await writeProvider.isTransactionCompleted(txnB)).toBeFalsy();
        expect(await writeProvider.isTransactionCompleted(txnC)).toBeFalsy();
        await writeProvider.setTransactionCompleted(txnA);
        expect(await writeProvider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(await writeProvider.isTransactionCompleted(txnB)).toBeFalsy();
        expect(await writeProvider.isTransactionCompleted(txnC)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnA)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnB)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnC)).toBeFalsy();
        await writeProvider.setTransactionCompleted(txnA); // duplicated to make sure it is safe to do so
        expect(await writeProvider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(await writeProvider.isTransactionCompleted(txnB)).toBeFalsy();
        expect(await writeProvider.isTransactionCompleted(txnC)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnA)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnB)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnC)).toBeFalsy();
        await writeProvider.setTransactionCompleted(txnB);
        expect(await writeProvider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(await writeProvider.isTransactionCompleted(txnB)).toBeTruthy();
        expect(await writeProvider.isTransactionCompleted(txnC)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnA)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnB)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnC)).toBeFalsy();
        await writeProvider.setTransactionCompleted(txnC);
        expect(await writeProvider.isTransactionCompleted(txnA)).toBeFalsy(); // No longer in memory
        expect(await writeProvider.isTransactionCompleted(txnB)).toBeTruthy();
        expect(await writeProvider.isTransactionCompleted(txnC)).toBeTruthy();
        expect(await readProviderFn().isTransactionCompleted(txnA)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnB)).toBeFalsy();
        expect(await readProviderFn().isTransactionCompleted(txnC)).toBeFalsy();
    });

    it('should track arbitrary key value pairs', async () => {
        const { writeProvider, readProviderFn } = createSimpleFsStorageProvider();

        const key = "test";
        const value = "testing";

        expect(writeProvider.readValue(key)).toBeFalsy();
        writeProvider.storeValue(key, value);
        expect(writeProvider.readValue(key)).toEqual(value);
        expect(readProviderFn().readValue(key)).toEqual(value);
    });

    describe('namespacing', () => {
        it('should return the right sync token', async () => {
            const { writeProvider, readProviderFn } = createSimpleFsStorageProvider();

            const value = "testing";
            const namespace = "@user:example.org";

            const nsWriter = writeProvider.storageForUser(namespace);
            expect(nsWriter).toBeDefined();

            expect(await writeProvider.getSyncToken()).toBeFalsy();
            expect(await nsWriter.getSyncToken()).toBeFalsy();
            await nsWriter.setSyncToken(value);
            expect(await nsWriter.getSyncToken()).toEqual(value);
            expect(await writeProvider.getSyncToken()).toBeFalsy();
            expect(await readProviderFn().storageForUser(namespace).getSyncToken()).toEqual(value);
            expect(await readProviderFn().getSyncToken()).toBeFalsy();
        });

        it('should return the right filter object', async () => {
            const { writeProvider, readProviderFn } = createSimpleFsStorageProvider();

            const value: IFilterInfo = { id: 12, filter: { hello: "world" } };
            const namespace = "@user:example.org";

            const nsWriter = writeProvider.storageForUser(namespace);
            expect(nsWriter).toBeDefined();

            expect(await writeProvider.getFilter()).toBeFalsy();
            expect(await nsWriter.getFilter()).toBeFalsy();
            await nsWriter.setFilter(value);
            expect(await nsWriter.getFilter()).toMatchObject(<any>value);
            expect(await writeProvider.getFilter()).toBeFalsy();
            expect(await readProviderFn().storageForUser(namespace).getFilter()).toMatchObject(<any>value);
            expect(await readProviderFn().getFilter()).toBeFalsy();
        });

        it('should track arbitrary key value pairs', async () => {
            const { writeProvider, readProviderFn } = createSimpleFsStorageProvider();

            const key = "test";
            const value = "testing";
            const namespace = "@user:example.org";
            const nsKey = `${namespace}_kv_${key}`;

            const nsWriter = writeProvider.storageForUser(namespace);
            expect(nsWriter).toBeDefined();

            expect(await nsWriter.readValue(key)).toBeFalsy();
            expect(await writeProvider.readValue(nsKey)).toBeFalsy();
            await nsWriter.storeValue(key, value);
            expect(await nsWriter.readValue(key)).toEqual(value);
            expect(await writeProvider.readValue(nsKey)).toEqual(value);
            expect(await readProviderFn().storageForUser(namespace).readValue(key)).toEqual(value);
            expect(await readProviderFn().readValue(nsKey)).toEqual(value);
        });
    });
});

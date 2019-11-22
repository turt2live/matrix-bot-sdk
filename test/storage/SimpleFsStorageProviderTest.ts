import { IFilterInfo, SimpleFsStorageProvider } from "../../src";
import * as expect from "expect";
import * as tmp from "tmp";

tmp.setGracefulCleanup();

function createSimpleFsStorageProvider(inMemory = false, maxMemTransactions = 20) {
    const tmpFile = tmp.fileSync();
    const writeProvider = new SimpleFsStorageProvider(tmpFile.name, inMemory, maxMemTransactions);
    const readProviderFn = () => new SimpleFsStorageProvider(tmpFile.name, inMemory, maxMemTransactions);

    return {tmpFile, writeProvider, readProviderFn};
}

describe('SimpleFsStorageProvider', () => {
    it('should return the right sync token', async () => {
        const {writeProvider, readProviderFn} = createSimpleFsStorageProvider();

        const value = "testing";
        expect(writeProvider.getSyncToken()).toBeFalsy();
        writeProvider.setSyncToken(value);
        expect(writeProvider.getSyncToken()).toEqual(value);
        expect(readProviderFn().getSyncToken()).toEqual(value);
    });

    it('should return the right filter object', async () => {
        const {writeProvider, readProviderFn} = createSimpleFsStorageProvider();

        const value: IFilterInfo = {id: 12, filter: {hello: "world"}};
        expect(writeProvider.getFilter()).toBeFalsy();
        writeProvider.setFilter(value);
        expect(writeProvider.getFilter()).toMatchObject(<any>value);
        expect(readProviderFn().getFilter()).toMatchObject(<any>value);
    });

    it('should track registered users', async () => {
        const {writeProvider, readProviderFn} = createSimpleFsStorageProvider();

        const userIdA = "@first:example.org";
        const userIdB = "@second:example.org";

        expect(writeProvider.isUserRegistered(userIdA)).toBeFalsy();
        expect(writeProvider.isUserRegistered(userIdB)).toBeFalsy();
        writeProvider.addRegisteredUser(userIdA);
        expect(writeProvider.isUserRegistered(userIdA)).toBeTruthy();
        expect(writeProvider.isUserRegistered(userIdB)).toBeFalsy();
        expect(readProviderFn().isUserRegistered(userIdA)).toBeTruthy();
        expect(readProviderFn().isUserRegistered(userIdB)).toBeFalsy();
        writeProvider.addRegisteredUser(userIdA); // duplicated to make sure it is safe to do so
        expect(writeProvider.isUserRegistered(userIdA)).toBeTruthy();
        expect(writeProvider.isUserRegistered(userIdB)).toBeFalsy();
        expect(readProviderFn().isUserRegistered(userIdA)).toBeTruthy();
        expect(readProviderFn().isUserRegistered(userIdB)).toBeFalsy();
        writeProvider.addRegisteredUser(userIdB);
        expect(writeProvider.isUserRegistered(userIdA)).toBeTruthy();
        expect(writeProvider.isUserRegistered(userIdB)).toBeTruthy();
        expect(readProviderFn().isUserRegistered(userIdA)).toBeTruthy();
        expect(readProviderFn().isUserRegistered(userIdB)).toBeTruthy();
    });

    it('should track completed transactions', async () => {
        const {writeProvider, readProviderFn} = createSimpleFsStorageProvider();

        const txnA = "@first:example.org";
        const txnB = "@second:example.org";

        expect(writeProvider.isTransactionCompleted(txnA)).toBeFalsy();
        expect(writeProvider.isTransactionCompleted(txnB)).toBeFalsy();
        writeProvider.setTransactionCompleted(txnA);
        expect(writeProvider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(writeProvider.isTransactionCompleted(txnB)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnA)).toBeTruthy();
        expect(readProviderFn().isTransactionCompleted(txnB)).toBeFalsy();
        writeProvider.setTransactionCompleted(txnA); // duplicated to make sure it is safe to do so
        expect(writeProvider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(writeProvider.isTransactionCompleted(txnB)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnA)).toBeTruthy();
        expect(readProviderFn().isTransactionCompleted(txnB)).toBeFalsy();
        writeProvider.setTransactionCompleted(txnB);
        expect(writeProvider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(writeProvider.isTransactionCompleted(txnB)).toBeTruthy();
        expect(readProviderFn().isTransactionCompleted(txnA)).toBeTruthy();
        expect(readProviderFn().isTransactionCompleted(txnB)).toBeTruthy();
    });

    it('should track a limited number of completed transactions in memory', async () => {
        const maxTransactions = 2;
        const {writeProvider, readProviderFn} = createSimpleFsStorageProvider(true, maxTransactions);

        const txnA = "@first:example.org";
        const txnB = "@second:example.org";
        const txnC = "@third:example.org";

        // The read provider results should always be falsey because the write provider
        // should not be writing to disk.

        expect(writeProvider.isTransactionCompleted(txnA)).toBeFalsy();
        expect(writeProvider.isTransactionCompleted(txnB)).toBeFalsy();
        expect(writeProvider.isTransactionCompleted(txnC)).toBeFalsy();
        writeProvider.setTransactionCompleted(txnA);
        expect(writeProvider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(writeProvider.isTransactionCompleted(txnB)).toBeFalsy();
        expect(writeProvider.isTransactionCompleted(txnC)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnA)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnB)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnC)).toBeFalsy();
        writeProvider.setTransactionCompleted(txnA); // duplicated to make sure it is safe to do so
        expect(writeProvider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(writeProvider.isTransactionCompleted(txnB)).toBeFalsy();
        expect(writeProvider.isTransactionCompleted(txnC)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnA)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnB)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnC)).toBeFalsy();
        writeProvider.setTransactionCompleted(txnB);
        expect(writeProvider.isTransactionCompleted(txnA)).toBeTruthy();
        expect(writeProvider.isTransactionCompleted(txnB)).toBeTruthy();
        expect(writeProvider.isTransactionCompleted(txnC)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnA)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnB)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnC)).toBeFalsy();
        writeProvider.setTransactionCompleted(txnC);
        expect(writeProvider.isTransactionCompleted(txnA)).toBeFalsy(); // No longer in memory
        expect(writeProvider.isTransactionCompleted(txnB)).toBeTruthy();
        expect(writeProvider.isTransactionCompleted(txnC)).toBeTruthy();
        expect(readProviderFn().isTransactionCompleted(txnA)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnB)).toBeFalsy();
        expect(readProviderFn().isTransactionCompleted(txnC)).toBeFalsy();
    });

    it('should track arbitrary key value pairs', async () => {
        const {writeProvider, readProviderFn} = createSimpleFsStorageProvider();

        const key = "test";
        const value = "testing";

        expect(writeProvider.readValue(key)).toBeFalsy();
        writeProvider.storeValue(key, value);
        expect(writeProvider.readValue(key)).toEqual(value);
        expect(readProviderFn().readValue(key)).toEqual(value);
    });
});

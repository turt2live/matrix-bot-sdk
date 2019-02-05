import { IFilterInfo, SimpleFsStorageProvider } from "../../src";
import * as expect from "expect";
import * as tmp from "tmp";

tmp.setGracefulCleanup();

function createSimpleFsStorageProvider() {
    const tmpFile = tmp.fileSync();
    const writeProvider = new SimpleFsStorageProvider(tmpFile.name);
    const readProviderFn = () => new SimpleFsStorageProvider(tmpFile.name);

    return {tmpFile, writeProvider, readProviderFn};
}

// @ts-ignore
describe('SimpleFsStorageProvider', () => {
    // @ts-ignore
    it('should return the right sync token', async () => {
        const {writeProvider, readProviderFn} = createSimpleFsStorageProvider();

        const value = "testing";
        expect(writeProvider.getSyncToken()).toBeFalsy();
        writeProvider.setSyncToken(value);
        expect(writeProvider.getSyncToken()).toEqual(value);
        expect(readProviderFn().getSyncToken()).toEqual(value);
    });

    // @ts-ignore
    it('should return the right filter object', async () => {
        const {writeProvider, readProviderFn} = createSimpleFsStorageProvider();

        const value: IFilterInfo = {id: 12, filter: {hello: "world"}};
        expect(writeProvider.getFilter()).toBeFalsy();
        writeProvider.setFilter(value);
        expect(writeProvider.getFilter()).toMatchObject(value);
        expect(readProviderFn().getFilter()).toMatchObject(value);
    });

    // @ts-ignore
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

    // @ts-ignore
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
});

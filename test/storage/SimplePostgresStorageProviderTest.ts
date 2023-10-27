import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";

import { IFilterInfo, SimplePostgresStorageProvider } from "../../src";

function createSimplePostgresStorageProvider(connectionString: string, inMemory = false, maxMemTransactions = 20) {
    const writeProvider = new SimplePostgresStorageProvider(connectionString, inMemory, maxMemTransactions);
    const readProviderFn = () => new SimplePostgresStorageProvider(connectionString, inMemory, maxMemTransactions);

    return { writeProvider, readProviderFn };
}

describe('SimplePostgresStorageProvider', () => {
    let postgresContainer: StartedPostgreSqlContainer;

    beforeAll(async () => {
        postgresContainer = await new PostgreSqlContainer()
            .withLogConsumer(async s => {
                for await (const chunk of s) {
                    console.log("[PSQL] " + Buffer.from(chunk).toString("utf-8")); // eslint-disable-line no-console
                }
            })
            .withCommand(["postgres", "-c", "max_connections=1000"])
            .start();
    }, 60000);

    afterAll(async () => {
        await postgresContainer.stop();
    }, 60000);

    it('should return the right sync token', async () => {
        const { writeProvider, readProviderFn } = createSimplePostgresStorageProvider(postgresContainer.getConnectionUri());

        const value = "testing";
        expect(await writeProvider.getSyncToken()).toBeFalsy();
        await writeProvider.setSyncToken(value);
        expect(await writeProvider.getSyncToken()).toEqual(value);
        expect(await readProviderFn().getSyncToken()).toEqual(value);

        await writeProvider.setSyncToken(null);
        expect(await writeProvider.getSyncToken()).toBeFalsy();
        expect(await readProviderFn().getSyncToken()).toBeFalsy();
    });

    it('should return the right filter object', async () => {
        const { writeProvider, readProviderFn } = createSimplePostgresStorageProvider(postgresContainer.getConnectionUri());

        const value: IFilterInfo = { id: 12, filter: { hello: "world" } };
        expect(await writeProvider.getFilter()).toBeFalsy();
        await writeProvider.setFilter(value);
        expect(await writeProvider.getFilter()).toMatchObject(<any>value);
        expect(await readProviderFn().getFilter()).toMatchObject(<any>value);

        await writeProvider.setFilter(null);
        expect(await writeProvider.getFilter()).toBeFalsy();
        expect(await readProviderFn().getFilter()).toBeFalsy();
    });

    it('should track registered users', async () => {
        const { writeProvider, readProviderFn } = createSimplePostgresStorageProvider(postgresContainer.getConnectionUri());

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
        const { writeProvider, readProviderFn } = createSimplePostgresStorageProvider(postgresContainer.getConnectionUri());

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
        const { writeProvider, readProviderFn } = createSimplePostgresStorageProvider(postgresContainer.getConnectionUri(), true, maxTransactions);

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
        const { writeProvider, readProviderFn } = createSimplePostgresStorageProvider(postgresContainer.getConnectionUri());

        const key = "test";
        const value = "testing";

        expect(await writeProvider.readValue(key)).toBeFalsy();
        await writeProvider.storeValue(key, value);
        expect(await writeProvider.readValue(key)).toEqual(value);
        expect(await readProviderFn().readValue(key)).toEqual(value);

        await writeProvider.storeValue(key, null);
        expect(await writeProvider.readValue(key)).toBeFalsy();
        expect(await readProviderFn().readValue(key)).toBeFalsy();
    });

    describe('namespacing', () => {
        it('should return the right sync token', async () => {
            const { writeProvider, readProviderFn } = createSimplePostgresStorageProvider(postgresContainer.getConnectionUri());

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

            await nsWriter.setSyncToken(null);
            expect(await writeProvider.getSyncToken()).toBeFalsy();
            expect(await nsWriter.getSyncToken()).toBeFalsy();
        });

        it('should return the right filter object', async () => {
            const { writeProvider, readProviderFn } = createSimplePostgresStorageProvider(postgresContainer.getConnectionUri());

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

            await nsWriter.setFilter(null);
            expect(await writeProvider.getFilter()).toBeFalsy();
            expect(await nsWriter.getFilter()).toBeFalsy();
        });

        it('should track arbitrary key value pairs', async () => {
            const { writeProvider, readProviderFn } = createSimplePostgresStorageProvider(postgresContainer.getConnectionUri());

            const key = "test";
            const value = "testing";
            const namespace = "@user:example.org";
            const nsKey = `${namespace}_internal_kv_${key}`;

            const nsWriter = writeProvider.storageForUser(namespace);
            expect(nsWriter).toBeDefined();

            expect(await nsWriter.readValue(key)).toBeFalsy();
            expect(await writeProvider.readValue(nsKey)).toBeFalsy();
            await nsWriter.storeValue(key, value);
            expect(await nsWriter.readValue(key)).toEqual(value);
            expect(await writeProvider.readValue(nsKey)).toEqual(value);
            expect(await readProviderFn().storageForUser(namespace).readValue(key)).toEqual(value);
            expect(await readProviderFn().readValue(nsKey)).toEqual(value);

            await nsWriter.storeValue(key, null);
            expect(await nsWriter.readValue(key)).toBeFalsy();
            expect(await writeProvider.readValue(nsKey)).toBeFalsy();
        });
    });
});

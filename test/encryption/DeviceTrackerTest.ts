import * as expect from "expect";
import * as simple from "simple-mock";
import { EncryptionAlgorithm, UserDevice } from "../../src";
import { createTestClient, TEST_DEVICE_ID } from "../MatrixClientTest";
import { DeviceTracker } from "../../src/e2ee/DeviceTracker";

const STATIC_TEST_USER = "@ping:localhost";
export const STATIC_TEST_DEVICES = {
    "NTTFKSVBSI": {
        "algorithms": [EncryptionAlgorithm.OlmV1Curve25519AesSha2, EncryptionAlgorithm.MegolmV1AesSha2],
        "device_id": "NTTFKSVBSI",
        "keys": {
            "curve25519:NTTFKSVBSI": "zPsrUlEM3DKRcBYKMHgZTLmYJU1FJDzBRnH6DsTxHH8",
            "ed25519:NTTFKSVBSI": "2tVcG/+sE7hq4z+E/x6UrMuVEAzc4CknYIGbg3cQg/4",
        },
        "signatures": {
            "@ping:localhost": {
                "ed25519:NTTFKSVBSI": "CLm1TOPFFIygs68amMsnywQoLz2evo/O28BVQGPKC986yFt0OpDKcyMUTsRFiRcdLstqtWkhy1p+UTW2/FPEDw",
                "ed25519:7jeU3P5Fb8wS+LmhXNhiDSBrPMBI+uBZItlRJnpoHtE": "vx1bb8n1xWIJ+5ZkOrQ91msZbEU/p2wZGdxbnQAQDr/ZhZqwKwvY6G5bkhjvtQTdVRspPC/mFKyH0UW9D30IDA",
            },
        },
        "user_id": "@ping:localhost",
        "unsigned": { "device_display_name": "localhost:8080 (Edge, Windows)" },
    },
    "HCDJLDXQHQ": {
        "algorithms": [EncryptionAlgorithm.OlmV1Curve25519AesSha2, EncryptionAlgorithm.MegolmV1AesSha2],
        "device_id": "HCDJLDXQHQ",
        "keys": {
            "curve25519:HCDJLDXQHQ": "c20OI51bT8iiX9t40g5g7FcBCHORIbep+6SbkrD3FRU",
            "ed25519:HCDJLDXQHQ": "hTxK3DSJit7N7eqGuOnuDIeAdj4P7S57DOMKj6ruQok",
        },
        "signatures": {
            "@ping:localhost": {
                "ed25519:HCDJLDXQHQ": "2CzR6Vfru6wZYaeF9MuHNrHuOh5iZ/jaw0dgRmyuMOsJwmuWZEeyit/csjg53oY10H3xfC4tOTKXc5SU5NIdBQ",
            },
        },
        "user_id": "@ping:localhost",
        "unsigned": { "device_display_name": "localhost:8080 (Edge, Windows)" },
    },
};

describe('DeviceTracker', () => {
    describe('updateUsersDeviceLists', () => {
        it('should perform updates', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            client.getUserDevices = async (userIds) => {
                expect(userIds).toMatchObject([STATIC_TEST_USER]);
                return {
                    device_keys: {
                        [userIds[0]]: STATIC_TEST_DEVICES,
                        ["@should_be_ignored:example.org"]: STATIC_TEST_DEVICES,
                    },
                    failures: {},
                };
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                return [];
            };

            const storeSpy = simple.stub().callFn(async (uid, validated) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                expect(validated).toMatchObject([
                    STATIC_TEST_DEVICES["NTTFKSVBSI"],
                    STATIC_TEST_DEVICES["HCDJLDXQHQ"],
                ]);
                expect(validated.length).toBe(2);
            });
            client.cryptoStore.setActiveUserDevices = storeSpy;

            const tracker = new DeviceTracker(client);
            await tracker.updateUsersDeviceLists([STATIC_TEST_USER]);
            expect(storeSpy.callCount).toBe(1);
        });

        it('should wait for existing requests to complete first', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const fetchedOrder: string[] = [];

            client.getUserDevices = async (userIds) => {
                expect(userIds).toMatchObject(fetchedOrder.length === 0 ? [STATIC_TEST_USER, "@other:example.org"] : [STATIC_TEST_USER, "@another:example.org"]);
                fetchedOrder.push(...userIds);
                return {
                    device_keys: {
                        [userIds[0]]: STATIC_TEST_DEVICES,
                        ["@should_be_ignored:example.org"]: STATIC_TEST_DEVICES,
                    },
                    failures: {},
                };
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                return [];
            };

            const storeSpy = simple.stub().callFn(async (uid, validated) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                expect(validated).toMatchObject([
                    STATIC_TEST_DEVICES["NTTFKSVBSI"],
                    STATIC_TEST_DEVICES["HCDJLDXQHQ"],
                ]);
                expect(validated.length).toBe(2);
            });
            client.cryptoStore.setActiveUserDevices = storeSpy;

            const tracker = new DeviceTracker(client);
            tracker.updateUsersDeviceLists([STATIC_TEST_USER, "@other:example.org"]).then(() => fetchedOrder.push("----"));
            await tracker.updateUsersDeviceLists([STATIC_TEST_USER, "@another:example.org"]);
            expect(storeSpy.callCount).toBe(2);
            expect(fetchedOrder).toMatchObject([
                STATIC_TEST_USER,
                "@other:example.org",
                "----", // inserted by finished call to update device lists
                STATIC_TEST_USER,
                "@another:example.org",
            ]);
        });

        it('should check for servers changing device IDs', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            client.getUserDevices = async (userIds) => {
                expect(userIds).toMatchObject([STATIC_TEST_USER]);
                return {
                    device_keys: {
                        [userIds[0]]: {
                            "HCDJLDXQHQ": {
                                device_id: "WRONG_DEVICE",
                                ...STATIC_TEST_DEVICES['HCDJLDXQHQ'],
                            },
                            ...STATIC_TEST_DEVICES,
                        },
                        ["@should_be_ignored:example.org"]: STATIC_TEST_DEVICES,
                    },
                    failures: {},
                };
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                return [];
            };

            const storeSpy = simple.stub().callFn(async (uid, validated) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                expect(validated).toMatchObject([
                    STATIC_TEST_DEVICES["NTTFKSVBSI"],
                    //STATIC_TEST_DEVICES["HCDJLDXQHQ"], // falsified by server
                ]);
                expect(validated.length).toBe(1);
            });
            client.cryptoStore.setActiveUserDevices = storeSpy;

            const tracker = new DeviceTracker(client);
            await tracker.updateUsersDeviceLists([STATIC_TEST_USER]);
            expect(storeSpy.callCount).toBe(1);
        });

        it('should check for servers changing user IDs', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            client.getUserDevices = async (userIds) => {
                expect(userIds).toMatchObject([STATIC_TEST_USER]);
                return {
                    device_keys: {
                        [userIds[0]]: {
                            "HCDJLDXQHQ": {
                                user_id: "@wrong:example.org",
                                ...STATIC_TEST_DEVICES['HCDJLDXQHQ'],
                            },
                            ...STATIC_TEST_DEVICES,
                        },
                        ["@should_be_ignored:example.org"]: STATIC_TEST_DEVICES,
                    },
                    failures: {},
                };
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                return [];
            };

            const storeSpy = simple.stub().callFn(async (uid, validated) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                expect(validated).toMatchObject([
                    STATIC_TEST_DEVICES["NTTFKSVBSI"],
                    //STATIC_TEST_DEVICES["HCDJLDXQHQ"], // falsified by server
                ]);
                expect(validated.length).toBe(1);
            });
            client.cryptoStore.setActiveUserDevices = storeSpy;

            const tracker = new DeviceTracker(client);
            await tracker.updateUsersDeviceLists([STATIC_TEST_USER]);
            expect(storeSpy.callCount).toBe(1);
        });

        it('should ensure all devices have Curve25519 keys', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            client.getUserDevices = async (userIds) => {
                expect(userIds).toMatchObject([STATIC_TEST_USER]);
                return {
                    device_keys: {
                        [userIds[0]]: {
                            "HCDJLDXQHQ": {
                                keys: {
                                    "ed25519:HCDJLDXQHQ": "hTxK3DSJit7N7eqGuOnuDIeAdj4P7S57DOMKj6ruQok",
                                    // no curve25519 key for test
                                },
                                ...STATIC_TEST_DEVICES['HCDJLDXQHQ'],
                            },
                            ...STATIC_TEST_DEVICES,
                        },
                        ["@should_be_ignored:example.org"]: STATIC_TEST_DEVICES,
                    },
                    failures: {},
                };
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                return [];
            };

            const storeSpy = simple.stub().callFn(async (uid, validated) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                expect(validated).toMatchObject([
                    STATIC_TEST_DEVICES["NTTFKSVBSI"],
                    //STATIC_TEST_DEVICES["HCDJLDXQHQ"], // falsified by server
                ]);
                expect(validated.length).toBe(1);
            });
            client.cryptoStore.setActiveUserDevices = storeSpy;

            const tracker = new DeviceTracker(client);
            await tracker.updateUsersDeviceLists([STATIC_TEST_USER]);
            expect(storeSpy.callCount).toBe(1);
        });

        it('should ensure all devices have Ed25519 keys', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            client.getUserDevices = async (userIds) => {
                expect(userIds).toMatchObject([STATIC_TEST_USER]);
                return {
                    device_keys: {
                        [userIds[0]]: {
                            "HCDJLDXQHQ": {
                                keys: {
                                    "curve25519:HCDJLDXQHQ": "c20OI51bT8iiX9t40g5g7FcBCHORIbep+6SbkrD3FRU",
                                    // no ed25519 key for test
                                },
                                ...STATIC_TEST_DEVICES['HCDJLDXQHQ'],
                            },
                            ...STATIC_TEST_DEVICES,
                        },
                        ["@should_be_ignored:example.org"]: STATIC_TEST_DEVICES,
                    },
                    failures: {},
                };
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                return [];
            };

            const storeSpy = simple.stub().callFn(async (uid, validated) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                expect(validated).toMatchObject([
                    STATIC_TEST_DEVICES["NTTFKSVBSI"],
                    //STATIC_TEST_DEVICES["HCDJLDXQHQ"], // falsified by server
                ]);
                expect(validated.length).toBe(1);
            });
            client.cryptoStore.setActiveUserDevices = storeSpy;

            const tracker = new DeviceTracker(client);
            await tracker.updateUsersDeviceLists([STATIC_TEST_USER]);
            expect(storeSpy.callCount).toBe(1);
        });

        it('should ensure all devices have signatures', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            client.getUserDevices = async (userIds) => {
                expect(userIds).toMatchObject([STATIC_TEST_USER]);
                return {
                    device_keys: {
                        [userIds[0]]: {
                            "HCDJLDXQHQ": {
                                signatures: {},
                                ...STATIC_TEST_DEVICES['HCDJLDXQHQ'],
                            },
                            ...STATIC_TEST_DEVICES,
                        },
                        ["@should_be_ignored:example.org"]: STATIC_TEST_DEVICES,
                    },
                    failures: {},
                };
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                return [];
            };

            const storeSpy = simple.stub().callFn(async (uid, validated) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                expect(validated).toMatchObject([
                    STATIC_TEST_DEVICES["NTTFKSVBSI"],
                    //STATIC_TEST_DEVICES["HCDJLDXQHQ"], // falsified by server
                ]);
                expect(validated.length).toBe(1);
            });
            client.cryptoStore.setActiveUserDevices = storeSpy;

            const tracker = new DeviceTracker(client);
            await tracker.updateUsersDeviceLists([STATIC_TEST_USER]);
            expect(storeSpy.callCount).toBe(1);
        });

        it('should ensure all devices have device signatures', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            client.getUserDevices = async (userIds) => {
                expect(userIds).toMatchObject([STATIC_TEST_USER]);
                return {
                    device_keys: {
                        [userIds[0]]: {
                            "HCDJLDXQHQ": {
                                signatures: {
                                    "@ping:localhost": {
                                        "ed25519:NOT_THIS_DEVICE": "2CzR6Vfru6wZYaeF9MuHNrHuOh5iZ/jaw0dgRmyuMOsJwmuWZEeyit/csjg53oY10H3xfC4tOTKXc5SU5NIdBQ",
                                    },
                                },
                                ...STATIC_TEST_DEVICES['HCDJLDXQHQ'],
                            },
                            ...STATIC_TEST_DEVICES,
                        },
                        ["@should_be_ignored:example.org"]: STATIC_TEST_DEVICES,
                    },
                    failures: {},
                };
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                return [];
            };

            const storeSpy = simple.stub().callFn(async (uid, validated) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                expect(validated).toMatchObject([
                    STATIC_TEST_DEVICES["NTTFKSVBSI"],
                    //STATIC_TEST_DEVICES["HCDJLDXQHQ"], // falsified by server
                ]);
                expect(validated.length).toBe(1);
            });
            client.cryptoStore.setActiveUserDevices = storeSpy;

            const tracker = new DeviceTracker(client);
            await tracker.updateUsersDeviceLists([STATIC_TEST_USER]);
            expect(storeSpy.callCount).toBe(1);
        });

        it('should validate the signature of a device', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            client.getUserDevices = async (userIds) => {
                expect(userIds).toMatchObject([STATIC_TEST_USER]);
                return {
                    device_keys: {
                        [userIds[0]]: {
                            "HCDJLDXQHQ": {
                                signatures: {
                                    "@ping:localhost": {
                                        "ed25519:HCDJLDXQHQ": "WRONG",
                                    },
                                },
                                ...STATIC_TEST_DEVICES['HCDJLDXQHQ'],
                            },
                            ...STATIC_TEST_DEVICES,
                        },
                        ["@should_be_ignored:example.org"]: STATIC_TEST_DEVICES,
                    },
                    failures: {},
                };
            };

            client.cryptoStore.getActiveUserDevices = async (uid) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                return [];
            };

            const storeSpy = simple.stub().callFn(async (uid, validated) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                expect(validated).toMatchObject([
                    STATIC_TEST_DEVICES["NTTFKSVBSI"],
                    //STATIC_TEST_DEVICES["HCDJLDXQHQ"], // falsified by server
                ]);
                expect(validated.length).toBe(1);
            });
            client.cryptoStore.setActiveUserDevices = storeSpy;

            const tracker = new DeviceTracker(client);
            await tracker.updateUsersDeviceLists([STATIC_TEST_USER]);
            expect(storeSpy.callCount).toBe(1);
        });

        it('should protect against device reuse', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            client.getUserDevices = async (userIds) => {
                expect(userIds).toMatchObject([STATIC_TEST_USER]);
                return {
                    device_keys: {
                        [userIds[0]]: STATIC_TEST_DEVICES,
                        ["@should_be_ignored:example.org"]: STATIC_TEST_DEVICES,
                    },
                    failures: {},
                };
            };

            client.cryptoStore.getAllUserDevices = async (uid) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                return [{
                    device_id: "HCDJLDXQHQ",
                    user_id: STATIC_TEST_USER,
                    algorithms: [EncryptionAlgorithm.OlmV1Curve25519AesSha2, EncryptionAlgorithm.MegolmV1AesSha2],
                    keys: {
                        "curve25519:HCDJLDXQHQ": "LEGACY_KEY",
                        "ed25519:HCDJLDXQHQ": "LEGACY_KEY",
                    },
                    signatures: {
                        "@ping:localhost": {
                            "ed25519:HCDJLDXQHQ": "FAKE_SIGNED",
                        },
                    },
                    unsigned: {
                        device_display_name: "Injected Device",
                        bsdkIsActive: false, // specifically inactive to test that the code doesn't care
                    },
                }];
            };

            const storeSpy = simple.stub().callFn(async (uid, validated) => {
                expect(uid).toEqual(STATIC_TEST_USER);
                expect(validated).toMatchObject([
                    STATIC_TEST_DEVICES["NTTFKSVBSI"],
                    //STATIC_TEST_DEVICES["HCDJLDXQHQ"], // falsified by server
                ]);
                expect(validated.length).toBe(1);
            });
            client.cryptoStore.setActiveUserDevices = storeSpy;

            const tracker = new DeviceTracker(client);
            await tracker.updateUsersDeviceLists([STATIC_TEST_USER]);
            expect(storeSpy.callCount).toBe(1);
        });
    });

    describe('flagUsersOutdated', () => {
        it('should flag devices as outdated appropriately', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            const targetUserIds = ["@one:example.org", "@two:example.org"];

            const flagSpy = simple.stub().callFn(async (uids) => {
                expect(uids).toMatchObject(targetUserIds);
                expect(uids.length).toBe(targetUserIds.length);
            });
            client.cryptoStore.flagUsersOutdated = flagSpy;

            const deviceTracker = new DeviceTracker(client);

            const updateSpy = simple.stub().callFn(async (uids) => {
                expect(uids).toMatchObject(targetUserIds);
                expect(uids.length).toBe(targetUserIds.length);
            });
            deviceTracker.updateUsersDeviceLists = updateSpy;

            await deviceTracker.flagUsersOutdated(targetUserIds, false);
            expect(updateSpy.callCount).toBe(0);
            expect(flagSpy.callCount).toBe(1);
        });

        it('should resync the devices if requested', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            const targetUserIds = ["@one:example.org", "@two:example.org"];

            const flagSpy = simple.stub().callFn(async (uids) => {
                expect(uids).toMatchObject(targetUserIds);
                expect(uids.length).toBe(targetUserIds.length);
            });
            client.cryptoStore.flagUsersOutdated = flagSpy;

            const deviceTracker = new DeviceTracker(client);

            const updateSpy = simple.stub().callFn(async (uids) => {
                expect(uids).toMatchObject(targetUserIds);
                expect(uids.length).toBe(targetUserIds.length);
            });
            deviceTracker.updateUsersDeviceLists = updateSpy;

            await deviceTracker.flagUsersOutdated(targetUserIds, true);
            expect(updateSpy.callCount).toBe(1);
            expect(flagSpy.callCount).toBe(1);
        });
    });

    describe('getDevicesFor', () => {
        it('should update devices if needed', async () => {
            const userId = "@user:example.org";
            const { client } = createTestClient(null, userId, true);
            const targetUserIds = ["@one:example.org", "@two:example.org", "@three:example.org", "@four:example.org"];
            const fakeOutdatedUsers = ["@two:example.org", "@three:example.org"];
            const deviceMaps = {
                [targetUserIds[0]]: [{device: 1}, {device: 2}] as any as UserDevice[],
                [targetUserIds[1]]: [{device: 33}, {device: 44}] as any as UserDevice[],
                [targetUserIds[2]]: [{device: "A"}, {device: "B"}] as any as UserDevice[],
                [targetUserIds[3]]: [{device: "B1"}, {device: "C1"}] as any as UserDevice[],
            };

            const checkSpy = simple.stub().callFn(async (uid) => {
                expect(uid).toEqual(targetUserIds[checkSpy.callCount - 1]);
                return fakeOutdatedUsers.includes(uid);
            });
            client.cryptoStore.isUserOutdated = checkSpy;

            const getSpy = simple.stub().callFn(async (uid) => {
                expect(updateSpy.callCount).toBe(1);
                expect(uid).toEqual(targetUserIds[getSpy.callCount - 1]);
                return deviceMaps[uid];
            });
            client.cryptoStore.getActiveUserDevices = getSpy;

            const deviceTracker = new DeviceTracker(client);

            const updateSpy = simple.stub().callFn(async (uids) => {
                expect(checkSpy.callCount).toBe(targetUserIds.length);
                expect(uids).toMatchObject(fakeOutdatedUsers);
                expect(uids.length).toBe(fakeOutdatedUsers.length);
            });
            deviceTracker.updateUsersDeviceLists = updateSpy;

            const results = await deviceTracker.getDevicesFor(targetUserIds);
            expect(checkSpy.callCount).toBe(targetUserIds.length);
            expect(updateSpy.callCount).toBe(1);
            expect(getSpy.callCount).toBe(targetUserIds.length);
            expect(results).toMatchObject(deviceMaps);
        });
    });
});

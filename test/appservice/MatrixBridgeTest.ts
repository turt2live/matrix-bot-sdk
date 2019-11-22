import {
    Appservice,
    IAppserviceOptions,
    Intent,
    MatrixBridge,
    REMOTE_ROOM_INFO_ACCOUNT_DATA_EVENT_TYPE,
    REMOTE_ROOM_MAP_ACCOUNT_DATA_EVENT_TYPE_PREFIX,
    REMOTE_USER_INFO_ACCOUNT_DATA_EVENT_TYPE,
    REMOTE_USER_MAP_ACCOUNT_DATA_EVENT_TYPE_PREFIX
} from "../../src";
import * as expect from "expect";
import * as simple from "simple-mock";

describe('MatrixBridge', () => {
    describe('getRemoteUserInfo', () => {
        it('should get remote user information', async () => {
            const userId = "@someone:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{botUserId: userId};
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                registration: {
                    as_token: asToken,
                },
            };
            const remoteObject = {id: "TESTING_1234", extraKey: true};

            const intent = new Intent(options, userId, appservice);
            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });

            const accountDataSpy = simple.stub().callFn((eventType) => {
                expect(eventType).toEqual(REMOTE_USER_INFO_ACCOUNT_DATA_EVENT_TYPE);
                return Promise.resolve(remoteObject);
            });
            intent.underlyingClient.getAccountData = accountDataSpy;

            const bridge = new MatrixBridge(appservice);

            const result = await bridge.getRemoteUserInfo(intent);
            expect(result).toBeDefined();
            expect(result).toMatchObject(remoteObject);
            expect(registeredSpy.callCount).toBe(1);
            expect(accountDataSpy.callCount).toBe(1);
        });
    });

    describe('setRemoteUserInfo', () => {
        it('should set remote user information', async () => {
            const userId = "@someone:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{botUserId: userId};
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                registration: {
                    as_token: asToken,
                },
            };
            const remoteObject = {id: "TESTING_1234", extraKey: true};

            const intent = new Intent(options, userId, appservice);
            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });

            const accountDataSpy = simple.stub().callFn((eventType, c) => {
                expect(eventType).toEqual(REMOTE_USER_INFO_ACCOUNT_DATA_EVENT_TYPE);
                expect(c).toMatchObject(remoteObject);
                return Promise.resolve();
            });
            intent.underlyingClient.setAccountData = accountDataSpy;

            const botIntent = new Intent(options, "@bot:example.org", appservice);
            (<any>appservice).botIntent = botIntent; // Workaround for using a fake appservice

            const botRegisteredSpy = simple.mock(botIntent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });

            const botAccountDataSpy = simple.stub().callFn((eventType, c) => {
                expect(eventType).toEqual(REMOTE_USER_MAP_ACCOUNT_DATA_EVENT_TYPE_PREFIX + "." + remoteObject.id);
                expect(c).toMatchObject({id: userId});
                return Promise.resolve();
            });
            appservice.botIntent.underlyingClient.setAccountData = botAccountDataSpy;

            const bridge = new MatrixBridge(appservice);

            await bridge.setRemoteUserInfo(intent, remoteObject);
            expect(registeredSpy.callCount).toBe(1);
            expect(accountDataSpy.callCount).toBe(1);
            expect(botRegisteredSpy.callCount).toBe(1);
            expect(botAccountDataSpy.callCount).toBe(1);
        });
    });

    describe('getRemoteRoomInfo', () => {
        it('should get remote room information', async () => {
            const userId = "@someone:example.org";
            const roomId = "!a:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{botUserId: userId};
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                registration: {
                    as_token: asToken,
                },
            };
            const remoteObject = {id: "TESTING_1234", extraKey: true};

            const intent = new Intent(options, userId, appservice);
            (<any>appservice).botIntent = intent; // Workaround for using a fake appservice

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });

            const accountDataSpy = simple.stub().callFn((eventType, rid) => {
                expect(eventType).toEqual(REMOTE_ROOM_INFO_ACCOUNT_DATA_EVENT_TYPE);
                expect(rid).toEqual(roomId);
                return Promise.resolve(remoteObject);
            });
            intent.underlyingClient.getRoomAccountData = accountDataSpy;

            const bridge = new MatrixBridge(appservice);

            const result = await bridge.getRemoteRoomInfo(roomId);
            expect(result).toBeDefined();
            expect(result).toMatchObject(remoteObject);
            expect(registeredSpy.callCount).toBe(1);
            expect(accountDataSpy.callCount).toBe(1);
        });
    });

    describe('setRemoteRoomInfo', () => {
        it('should set remote room information', async () => {
            const userId = "@someone:example.org";
            const roomId = "!a:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{botUserId: userId};
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                registration: {
                    as_token: asToken,
                },
            };
            const remoteObject = {id: "TESTING_1234", extraKey: true};

            const intent = new Intent(options, userId, appservice);
            (<any>appservice).botIntent = intent; // Workaround for using a fake appservice

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });

            const roomAccountDataSpy = simple.stub().callFn((eventType, rid, c) => {
                expect(eventType).toEqual(REMOTE_ROOM_INFO_ACCOUNT_DATA_EVENT_TYPE);
                expect(rid).toEqual(roomId);
                expect(c).toMatchObject(remoteObject);
                return Promise.resolve();
            });
            intent.underlyingClient.setRoomAccountData = roomAccountDataSpy;

            const accountDataSpy = simple.stub().callFn((eventType, c) => {
                expect(eventType).toEqual(REMOTE_ROOM_MAP_ACCOUNT_DATA_EVENT_TYPE_PREFIX + "." + remoteObject.id);
                expect(c).toMatchObject({id: roomId});
                return Promise.resolve();
            });
            intent.underlyingClient.setAccountData = accountDataSpy;

            const bridge = new MatrixBridge(appservice);

            await bridge.setRemoteRoomInfo(roomId, remoteObject);
            expect(registeredSpy.callCount).toBe(2);
            expect(roomAccountDataSpy.callCount).toBe(1);
            expect(accountDataSpy.callCount).toBe(1);
        });
    });

    describe('getMatrixRoomIdForRemote', () => {
        it('should return the right room ID', async () => {
            const userId = "@someone:example.org";
            const roomId = "!a:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{botUserId: userId};
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                registration: {
                    as_token: asToken,
                },
            };
            const remoteId = "TESTING_1234";

            const intent = new Intent(options, userId, appservice);
            (<any>appservice).botIntent = intent; // Workaround for using a fake appservice

            const registeredSpy = simple.mock(intent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });

            const accountDataSpy = simple.stub().callFn((eventType) => {
                expect(eventType).toEqual(REMOTE_ROOM_MAP_ACCOUNT_DATA_EVENT_TYPE_PREFIX + "." + remoteId);
                return Promise.resolve({id: roomId});
            });
            intent.underlyingClient.getAccountData = accountDataSpy;

            const bridge = new MatrixBridge(appservice);

            const result = await bridge.getMatrixRoomIdForRemote(remoteId);
            expect(result).toEqual(roomId);
            expect(registeredSpy.callCount).toBe(1);
            expect(accountDataSpy.callCount).toBe(1);
        });
    });

    describe('getIntentForRemote', () => {
        it('should return the right user intent', async () => {
            const userId = "@someone:example.org";
            const asToken = "s3cret";
            const hsUrl = "https://localhost";
            const appservice = <Appservice>{botUserId: userId};
            const options = <IAppserviceOptions>{
                homeserverUrl: hsUrl,
                registration: {
                    as_token: asToken,
                },
            };
            const remoteId = "TESTING_1234";
            const intent = new Intent(options, userId, appservice);

            const botIntent = new Intent(options, "@bot:example.org", appservice);
            (<any>appservice).botIntent = botIntent; // Workaround for using a fake appservice

            const registeredSpy = simple.mock(botIntent, "ensureRegistered").callFn(() => {
                return Promise.resolve();
            });

            const accountDataSpy = simple.stub().callFn((eventType) => {
                expect(eventType).toEqual(REMOTE_USER_MAP_ACCOUNT_DATA_EVENT_TYPE_PREFIX + "." + remoteId);
                return Promise.resolve({id: userId});
            });
            botIntent.underlyingClient.getAccountData = accountDataSpy;

            const getIntentSpy = simple.mock(appservice, "getIntentForUserId").callFn((uid) => {
                expect(uid).toEqual(userId);
                return intent;
            });

            const bridge = new MatrixBridge(appservice);

            const result = await bridge.getIntentForRemote(remoteId);
            expect(result).toEqual(intent);
            expect(registeredSpy.callCount).toBe(1);
            expect(accountDataSpy.callCount).toBe(1);
            expect(getIntentSpy.callCount).toBe(1);
        });
    });
});

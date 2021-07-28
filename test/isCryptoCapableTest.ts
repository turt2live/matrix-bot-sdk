import * as expect from "expect";
import { isCryptoCapable } from "../src";

export const IS_CRYPTO_TEST_ENV = !process.env.BOTSDK_NO_CRYPTO_TESTS;
export const cryptoDescribe = (IS_CRYPTO_TEST_ENV ? describe : describe.skip);
export const cryptoIt = (IS_CRYPTO_TEST_ENV ? it : it.skip);
export const notCryptoDescribe = (!IS_CRYPTO_TEST_ENV ? describe : describe.skip);
export const notCryptoIt = (!IS_CRYPTO_TEST_ENV ? it : it.skip);

describe('isCryptoCapable', () => {
    cryptoIt('should return true', () => {
        expect(isCryptoCapable()).toEqual(true);
    });
    notCryptoIt('should return false', () => {
        expect(isCryptoCapable()).toEqual(false);
    });
});

import { ICryptoSecureStorageProvider } from "./ICryptoSecureStorageProvider";
import { Cryptex, CryptexOpts } from "cryptex";

/**
 * A storage provider for secure information relating to crypto, stored using Cryptex.
 * Requires `cryptex` package to be installed.
 *
 * The pickle key is stored as the "pickle_key" secret.
 * @category Storage providers
 * @see https://github.com/TomFrost/Cryptex
 */
export class CryptexCryptoSecureStorageProvider implements ICryptoSecureStorageProvider {
    private cryptex: Cryptex;

    constructor(opts?: CryptexOpts) {
        this.cryptex = new Cryptex(opts);
    }

    public async getPickleKey(): Promise<string> {
        return this.cryptex.getSecret("pickle_key");
    }

    public async setPickleKey(pickleKey: string): Promise<void> {
        throw new Error("Cannot set keys with Cryptex - ensure that the secret is set up prior to running");
    }
}

import { LogService } from "./logging/LogService";

let hasDependency: boolean = null;

/**
 * Determines if the project is capable of running end-to-end encryption, aside
 * from solutions like Pantalaimon.
 * @category Encryption
 */
export function isCryptoCapable(): boolean {
    if (hasDependency !== null) return hasDependency;

    try {
        require("@matrix-org/olm");
        hasDependency = true;
    } catch (e) {
        LogService.error("isCryptoCapable", "Failed check: ", e);
        hasDependency = false;
    }

    return hasDependency;
}

import { OlmEngine, OlmMachine } from "@turt2live/matrix-sdk-crypto-nodejs";

/**
 * @internal
 */
export class InternalOlmMachineFactory {
    public static FACTORY_OVERRIDE: (userId: string, deviceId: string, engine: OlmEngine, storagePath: string) => OlmMachine;

    constructor(private userId: string, private deviceId: string, private engine: OlmEngine, private storagePath: string) {
    }

    public build(): OlmMachine {
        if (InternalOlmMachineFactory.FACTORY_OVERRIDE) {
            return InternalOlmMachineFactory.FACTORY_OVERRIDE(this.userId, this.deviceId, this.engine, this.storagePath);
        }
        return OlmMachine.withSledBackend(this.userId, this.deviceId, this.engine, this.storagePath);
    }
}

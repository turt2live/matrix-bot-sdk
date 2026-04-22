import HttpBackend from "matrix-mock-request";

import { OTKAlgorithm } from "../../src";

export function bindNullEngine(http: HttpBackend) {
    http.when("POST", "/keys/upload").respond(200, (path, obj) => {
        expect(obj).toMatchObject({

        });
        return {
            one_time_key_counts: {
                // Enough to trick the OlmMachine into thinking it has enough keys
                [OTKAlgorithm.Signed]: 1000,
            },
        };
    });
    // Some oddity with the rust-sdk bindings during setup
    http.when("POST", "/keys/query").respond(200, (path, obj) => {
        return {};
    });
}

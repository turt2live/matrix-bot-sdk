/**
 * This is the response format documented in
 * https://matrix.org/docs/spec/application_service/r0.1.2#get-matrix-app-v1-thirdparty-protocol-protocol
 * @category Application services
 */
export interface IApplicationServiceProtocol {
    user_fields: string[];
    location_fields: string[];
    icon: string;
    field_types: { [field: string]: IFieldType };
    instances: { [name: string]: IProtocolInstance };
}

interface IFieldType {
    regexp: string;
    placeholder: string;
}

interface IProtocolInstance {
    desc: string;
    icon: string;
    fields: { [field: string]: string };
    network_id: string;
}

/**
 * This is the response format for an MSC3983 `/keys/claim` request.
 * See https://github.com/matrix-org/matrix-spec-proposals/pull/3983
 * @deprecated This can be removed at any time without notice as it is unstable functionality.
 * @category Application services
 */
export interface MSC3983KeyClaimResponse {
    [userId: string]: {
        [deviceId: string]: {
            [keyId: string]: {
                // for signed_curve25519 keys
                key: string;
                signatures: {
                    [userId: string]: {
                        [keyId: string]: string;
                    };
                };
            };
        };
    };
}

/**
 * This is the response format for an MSC3984 `/keys/query` request.
 * See https://github.com/matrix-org/matrix-spec-proposals/pull/3984
 * @deprecated This can be removed at any time without notice as it is unstable functionality.
 * @category Application services
 */
export interface MSC3984KeyQueryResponse {
    device_keys: {
        [userId: string]: {
            [deviceId: string]: {
                algorithms: string[];
                device_id: string;
                user_id: string;
                keys: {
                    [keyId: string]: string;
                };
                signatures: {
                    [userId: string]: {
                        [keyId: string]: string;
                    };
                };
                unsigned?: {
                    [key: string]: any;
                };
            };
        };
    };

    // TODO: Cross-signing support
}

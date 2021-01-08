/**
 * Information about the policies (terms of service) a server may have.
 * @category Models
 */
export interface Policies {
    policies: {
        [id: string]: Policy;
    };
}

/**
 * Information about a policy (terms of service) a server may have.
 * @category Models
 */
export interface Policy {
    version: string;

    [language: string]: TranslatedPolicy | string; // "|string" is required for `version` to work
}

/**
 * Information about a (translated) policy (terms of service).
 * @category Models
 */
export interface TranslatedPolicy {
    name: string;
    url: string;
}

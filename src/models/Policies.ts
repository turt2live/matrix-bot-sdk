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
    // @ts-ignore
    version: string;
    [language: string]: {
        name: string;
        url: string;
    };
}

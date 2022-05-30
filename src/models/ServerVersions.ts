/**
 * Representation of the server's supported specification versions and unstable feature flags.
 * @category Models
 */
export type ServerVersions = {
    unstable_features?: Record<string, boolean>;
    versions: string[];
};

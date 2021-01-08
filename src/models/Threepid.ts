/**
 * A Third Party Identifier (3PID or threepid)
 * @category Models
 */
export interface Threepid {
    kind: "email" | "msisdn" | string;
    address: string;
}

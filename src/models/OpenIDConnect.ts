/**
 * An OpenID Connect token from the homeserver.
 * @category Models
 */
export interface OpenIDConnectToken {
    access_token: string;
    expires_in: number;
    matrix_server_name: string;
    token_type: 'Bearer';
}

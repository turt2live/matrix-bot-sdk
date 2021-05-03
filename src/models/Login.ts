export enum LoginFlowsType {
    Password = "m.login.password",
    Token = "m.login.token",
    SSO = "m.login.sso",
    EmailIdentity = "m.login.email.identity",
    MSISDN = "m.login.msisdn",
    Dummy = "m.login.dummy",
    MSC2778LoginApplicationService = "uk.half-shot.msc2778.login.application_service",
}

interface LoginIdentityProvider {
    id: string;
    name: string;
    icon?: string;
    brand?: string;
}

interface LoginFlow {
    type: LoginFlowsType;
    "org.matrix.msc2858.identity_providers"?: [LoginIdentityProvider];
}

export interface LoginFlows {
    flows: [LoginFlow];
}

export interface LoginResponse {
    access_token: string;
    device_id: string;
    user_id: string;
    well_known?: {
        "m.homeserver": {
            base_url: string;
        }
        "m.identity_server"?: {
            base_url: string;
        }
    }
}
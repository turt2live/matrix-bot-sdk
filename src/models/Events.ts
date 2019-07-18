export interface MatrixRoomEvent {
    room_id: string;
    event_id: string;
    type: string;
    origin_server_ts: number;
    sender: string;
    content: any;
    unsigned?: any;
}

export interface MatrixRoomStateEvent extends MatrixRoomEvent {
    state_key: string;
    prev_content?: any;
}

export type MembershipEnum = "join"|"leave"|"ban"|"invite";

export interface MatrixRoomMemberEventContent {
    avatar_url?: string;
    displayname?: string;
    membership: MembershipEnum;
    is_direct?: boolean;
    unsigned?: any;
    third_party_invite?: {
        display_name: string;
        signed: any;
    };
}

export interface MatrixRoomMemberEvent extends MatrixRoomStateEvent {
    content: MatrixRoomMemberEventContent;
    prev_content?: MatrixRoomMemberEventContent;
}

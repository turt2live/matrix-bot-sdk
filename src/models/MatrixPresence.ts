export interface MatrixPresence {
    presence: "online" | "offline" | "unavailable";
    last_active_ago?: number;
    status_message?: string;
    currently_active?: boolean;
}

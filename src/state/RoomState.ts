export class RoomState {

    // A map of state events indexed first by state type and then state keys.
    private stateByType: Map<string, Map<string, any>> = new Map();

    constructor(public readonly roomId: string) {
    }

    /**
     * Store this state event as part of the active room state.
     * @param stateType The event type e.g. m.room.policy.user.
     * @param stateKey The state key e.g. rule:@bad:matrix.org
     * @param event A state event to store.
     */
    private setState(stateType: string, stateKey: string, event: any): void {
        let typeTable = this.stateByType.get(stateType);
        if (typeTable) {
            typeTable.set(stateKey, event);
        } else {
            this.stateByType.set(stateType, new Map().set(stateKey, event));
        }
    }

    /**
     * Lookup the current state cached for the room.
     * @param stateType The event type e.g. m.policy.rule.user.
     * @param stateKey The state key e.g. rule:@bad:matrix.org
     * @returns A state event if present or undefined.
     */
    public getStateEvent(stateType: string, stateKey: string) {
        return this.stateByType.get(stateType)?.get(stateKey);
    }

    /**
     * @returns All of the state events within the room or undefined.
     */
    public getRoomState(): any[] {
        const stateKeyMaps = Array.from(this.stateByType.values());
        return [...stateKeyMaps.map(stateKeyMap => Array.from(stateKeyMap.values()))];
    }

    /**
     * Update the room state for a new state event.
     * @param event A new state event from the `state` response of `/sync`.
     */
    public updateForEvent(event: any): void {
        this.setState(event.type, event.state_key, event);
    }
}

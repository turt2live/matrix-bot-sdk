import { MSC3401CallEvent, MSC3401CallEventContent } from "../models/events/MSC3401CallEvent";
import { randomUUID } from "crypto";
import { MatrixClient } from "../MatrixClient";
import { MSC3401CallMemberEvent, MSC3401CallMemberEventContent } from "../models/events/MSC3401CallMemberEvent";

// TODO: Wire this up to sync + demo
// TODO: Wire up to appservices
// TODO: Support to-device channel for communications
// TODO: Support defining (external) media streams. Media is not anticipated to be handled in JS.
// TODO: Support negotiating a write-only mode
// TODO: Test against Element Call

/**
 * An experimental implementation of MSC3401 for calls over Matrix.
 *
 * The API surface offered by this class can break at any point without warning.
 *
 * @category VoIP
 */
export class MSC3401Call {
    public readonly callEvent: MSC3401CallEvent;

    private members: MSC3401CallMemberEvent[];
    private inCall = false;

    public constructor(client: MatrixClient, roomId: string, callName: string);
    public constructor(client: MatrixClient, roomId: string, callEvent: MSC3401CallEvent);
    public constructor(private client: MatrixClient, private roomId: string, nameOrEvent: string | MSC3401CallEvent) {
        if (typeof nameOrEvent === 'string') {
            this.callEvent = new MSC3401CallEvent({
                type: "org.matrix.msc3401.call",
                state_key: randomUUID(),
                content: <MSC3401CallEventContent>{
                    "m.intent": "m.prompt", // TODO: Expose as option
                    "m.name": nameOrEvent,
                    "m.terminated": false,
                    "m.type": "m.voice", // TODO: Expose as option
                },
            });
        } else {
            this.callEvent = nameOrEvent;
        }

        if (!this.client.crypto) {
            throw new Error("Crypto is required for VoIP");
        }
    }

    private async getSelfMember(): Promise<MSC3401CallMemberEvent> {
        const userId = await this.client.getUserId();
        return this.members.find(m => m.forUserId === userId);
    }

    public async terminate() {
        this.callEvent.content["m.terminated"] = true;
        return this.client.sendStateEvent(this.roomId, this.callEvent.type, this.callEvent.stateKey, this.callEvent.content);
    }

    public async join() {
        const ev = new MSC3401CallMemberEvent({
            type: "org.matrix.msc3401.call.member",
            state_key: await this.client.getUserId(),
            content: <MSC3401CallMemberEventContent>{
                "m.calls": [{
                    "m.call_id": this.callEvent.callId,
                    "m.devices": [{
                        device_id: this.client.crypto.clientDeviceId,
                        session_id: randomUUID(),
                        feeds: [{
                            purpose: "m.usermedia",
                        }],
                    }],
                }],
            },
        });
        await this.client.sendStateEvent(this.roomId, ev.type, ev.stateKey, ev.content);
        await this.scanMembers();
        await this.broadcastCallAnswer();
    }

    public async scanMembers() {
        this.members = [];
        const members = await this.client.getJoinedRoomMembers(this.roomId);
        for (const member of members) {
            try {
                const callMember = await this.client.getRoomStateEvent(this.roomId, "org.matrix.msc3401.call.member", member);
                if (callMember) {
                    await this.handleMember(callMember);
                }
            } catch (e) {
                // ignore error - not joined to call
            }
        }
    }

    public async handleMember(member: MSC3401CallMemberEvent) {
        this.members = [
            ...this.members.filter(m => m.forUserId !== member.forUserId),
            member,
        ];

        const myUserId = await this.client.getUserId();
        this.inCall = this.members.some(m => m.forUserId === myUserId);

        if (this.inCall) {
            this.establishSessions();
        }
    }

    private establishSessions() {
        // TODO: Establish call sessions with whoever we haven't yet
        // TODO: Establish olm sessions too
    }

    private async broadcastCallAnswer() {
        const selfUserId = await this.client.getUserId();
        const joinedMembers = this.members.filter(m => m.isInCall && m.forUserId !== selfUserId);

        // TODO: Hook up to wrtc library somehow?
    }
}

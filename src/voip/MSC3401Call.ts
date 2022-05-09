import { MSC3401CallEvent, MSC3401CallEventContent } from "../models/events/MSC3401CallEvent";
import { randomUUID } from "crypto";
import { MatrixClient } from "../MatrixClient";
import { MSC3401CallMemberEvent, MSC3401CallMemberEventContent } from "../models/events/MSC3401CallMemberEvent";
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from "wrtc";
import { LogService } from "../logging/LogService";

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
    private rtc = new RTCPeerConnection({
        iceServers: [{
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
        }],
        iceCandidatePoolSize: 10,
    });
    private rtcCallId: string;

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

        this.client.on("edu", async (edu) => {console.log(edu);
            if (edu["type"] === "m.call.invite" && edu["content"]?.["conf_id"] === this.callEvent.callId) {
                LogService.info("MSC3401Call", `${this.callEvent.callId} offer received`);
                this.rtcCallId = edu["content"]["call_id"];
                this.rtc.setRemoteDescription(new RTCSessionDescription(edu.content.offer));
                await this.broadcastCallAnswer();
            } else if (edu["type"] === "m.call.candidates" && edu["content"]?.["conf_id"] === this.callEvent.callId) {
                for (const candidate of edu["content"]["candidates"]) {
                    console.log(candidate);
                    this.rtc.addIceCandidate(new RTCIceCandidate(candidate));
                }
            }
        });
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
    }

    public async scanMembers() {
        this.members = [];
        const members = await this.client.getJoinedRoomMembers(this.roomId);
        for (const member of members) {
            try {
                const callMember = await this.client.getRoomStateEvent(this.roomId, "org.matrix.msc3401.call.member", member, 'event');
                if (callMember) {
                    await this.handleMember(new MSC3401CallMemberEvent(callMember));
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
        const selfDeviceId = this.client.crypto.clientDeviceId;
        console.log(this.members);
        const joinedMembers = this.members.filter(m => m.isInCall && m.forUserId !== selfUserId);
        const selfMember = this.members.find(m => m.isInCall && m.forUserId === selfUserId);

        const answer = await this.rtc.createAnswer();
        await this.rtc.setLocalDescription(answer);

        const answerMessage = {
            answer: {
                sdp: answer.sdp,
                type: answer.type,
            },
            conf_id: this.callEvent.callId,
            seq: 0,
            version: 1,
            capabilities: {
                "m.call.transferee": false,
                "m.call.dtmf": false,
            },
            sender_session_id: selfMember.deviceIdSessions[selfDeviceId],
            call_id: this.rtcCallId,
        };

        const messages = {};
        for (const target of joinedMembers) {
            if (!messages[target.forUserId]) messages[target.forUserId] = {};

            const userMap = messages[target.forUserId];
            for (const [deviceId, sessionId] of Object.entries(target.deviceIdSessions)) {
                userMap[deviceId] = {
                    ...answerMessage,
                    party_id: deviceId,
                    device_id: deviceId,
                    dest_session_id: sessionId,
                };
            }

            await this.client.sendToDevices("m.call.answer", messages);
        }
    }
}

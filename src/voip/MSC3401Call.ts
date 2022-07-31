import { MSC3401CallEvent, MSC3401CallEventContent } from "../models/events/MSC3401CallEvent";
import { randomUUID } from "crypto";
import { MatrixClient } from "../MatrixClient";
import { MSC3401CallMemberEvent, MSC3401CallMemberEventContent } from "../models/events/MSC3401CallMemberEvent";
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, nonstandard, MediaStream } from "wrtc";
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

        const source = new nonstandard.RTCAudioSource();
        const track = source.createTrack();
        const sink = new nonstandard.RTCAudioSink(track);
        const sampleRate = 8000;
        const samples = new Int16Array(sampleRate / 100); // 10ms of 16 bit mono audio
        const data = {samples, sampleRate};
        setInterval(() => source.onData(data));
        this.rtc.addTrack(track, new MediaStream([track]));

        this.client.on("to_device.decrypted", async (edu) => {
            if (edu["type"] === "m.call.invite" && edu["content"]?.["conf_id"] === this.callEvent.callId) {
                LogService.info("MSC3401Call", `${this.callEvent.callId} offer received`);
                this.rtcCallId = edu["content"]["call_id"];
                this.rtc.setRemoteDescription(new RTCSessionDescription(edu.content.offer));
            } else if (edu["type"] === "m.call.candidates" && edu["content"]?.["conf_id"] === this.callEvent.callId) {
                for (const candidate of edu["content"]["candidates"]) {
                    if (!candidate.candidate) continue;
                    this.rtc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                if (this.rtc.signalingState === "have-remote-offer") {
                    await this.broadcastCallAnswer();
                }
            }
        });

        let queuedCandidates: RTCIceCandidate[] = [];
        this.rtc.onicecandidate = async (ev) => {
            if (!ev.candidate) {
                await this.broadcastCandidates(queuedCandidates);
                queuedCandidates = [];
            } else {
                queuedCandidates.push(ev.candidate);
            }
        };
    }

    private async getSelfMember(): Promise<MSC3401CallMemberEvent> {
        const userId = await this.client.getUserId();
        return this.members.find(m => m.forUserId === userId);
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

    private async scanMembers() {
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

    private async handleMember(member: MSC3401CallMemberEvent) {
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

    private async doBroadcast(type: string, message: object) {
        const selfUserId = await this.client.getUserId();
        const joinedMembers = this.members.filter(m => m.isInCall && m.forUserId !== selfUserId);

        const messages = {};
        for (const target of joinedMembers) {
            if (!messages[target.forUserId]) messages[target.forUserId] = {};

            const userMap = messages[target.forUserId];
            for (const [deviceId, sessionId] of Object.entries(target.deviceIdSessions)) {
                userMap[deviceId] = {
                    ...message,
                    party_id: deviceId,
                    device_id: deviceId,
                    dest_session_id: sessionId,
                };
            }

            await this.client.sendToDevices(type, messages);
        }
    }

    private async broadcastCallAnswer() {
        const selfUserId = await this.client.getUserId();
        const selfDeviceId = this.client.crypto.clientDeviceId;
        const selfMember = this.members.find(m => m.isInCall && m.forUserId === selfUserId);

        const answer = await this.rtc.createAnswer();
        await this.rtc.setLocalDescription(answer);

        await this.doBroadcast("m.call.answer", {
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
        });
    }

    private async broadcastCandidates(candidates: RTCIceCandidate[]) {
        const selfUserId = await this.client.getUserId();
        const selfDeviceId = this.client.crypto.clientDeviceId;
        const selfMember = this.members.find(m => m.isInCall && m.forUserId === selfUserId);

        await this.doBroadcast("m.call.candidates", {
            candidates: candidates.map(c => ({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex })),
            conf_id: this.callEvent.callId,
            seq: 1,
            version: 1,
            sender_session_id: selfMember.deviceIdSessions[selfDeviceId],
            call_id: this.rtcCallId,
        });
    }
}

export type AvatarPipelineEvent =
  | VoiceTurnStartedEvent
  | VoiceTurnEndedEvent
  | AgentAudioChunkEvent
  | AvatarFrameEvent
  | LatencyMetricEvent;

export interface VoiceTurnStartedEvent {
  type: "voice.turn_started";
  sessionId: string;
  at: number;
}

export interface VoiceTurnEndedEvent {
  type: "voice.turn_ended";
  sessionId: string;
  at: number;
}

export interface AgentAudioChunkEvent {
  type: "agent.audio_chunk";
  sessionId: string;
  chunkId: string;
  at: number;
  sampleRate: number;
  format: "pcm16" | "wav" | "opus";
}

export interface AvatarFrameEvent {
  type: "avatar.frame";
  sessionId: string;
  frameId: string;
  at: number;
  width: number;
  height: number;
  fps: number;
}

export interface LatencyMetricEvent {
  type: "latency.metric";
  sessionId: string;
  name:
    | "speech_stop_to_first_audio"
    | "first_audio_to_first_frame"
    | "audio_chunk_to_frame"
    | "frame_encode"
    | "webrtc_publish";
  valueMs: number;
  at: number;
}


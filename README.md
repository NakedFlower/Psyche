# Psyche Avatar Lab

R&D branch for Psyche's realtime AI avatar engine.

This branch explores a Tavus-independent pipeline using LiveKit, OpenAI
Realtime, and GPU lip-sync models such as Wav2Lip and MuseTalk.

## Why This Exists

The main Psyche AI MVP uses Tavus for stable product demos. This branch is a
separate research track for using the A100 GPU server to test a custom avatar
pipeline.

## Target Pipeline

```txt
User microphone
  -> LiveKit WebRTC
  -> Voice agent
  -> OpenAI Realtime speech response
  -> Avatar worker
  -> Wav2Lip / MuseTalk
  -> Encoded video frames
  -> LiveKit custom video track
  -> Browser video-call UI
```

## Repository Layout

```txt
apps/
  web/             # LiveKit client test UI
  agent/           # LiveKit agent + OpenAI Realtime
  avatar-worker/   # MuseTalk/Wav2Lip inference server

packages/
  shared/          # event types and schemas

models/            # local model checkpoints, not committed
scripts/           # model download and benchmark scripts
docs/              # architecture, latency, model comparison
docker/            # Dockerfiles and compose file
```

## First Milestones

1. Voice-only LiveKit room with an AI participant.
2. Offline Wav2Lip benchmark with a fixed face image and generated speech.
3. MuseTalk benchmark on A100.
4. Publish generated avatar frames to LiveKit.
5. Compare latency, quality, and cost against Tavus.

## Today: LiveKit Connectivity Harness

The first implemented milestone is a dependency-light LiveKit room test:

- `apps/agent/server.js` serves the browser UI and mints LiveKit JWTs.
- `apps/web` joins a LiveKit room, publishes local microphone/camera tracks,
  renders remote tracks, lists participants, and displays data-channel latency
  events.
- The main UI can start an embedded agent simulator that joins the same room,
  publishes quiet placeholder audio plus a generated placeholder video track,
  and emits latency events.
- `apps/web/agent-sim.html` can join the same room as a stand-in AI participant,
  publish quiet synthetic audio/video tracks, and emit latency events.
- `apps/agent/room-agent.mjs` is the first server-side Node participant skeleton
  for replacing the browser simulator with a real agent process.
- In Realtime mode, the Node agent can publish OpenAI Realtime speech audio,
  capture bounded microphone turns, emit agent state events, and log per-turn
  usage/cost estimates.
- `apps/agent/persona-pipeline.mjs` turns a current-self survey plus Psyche
  weights into a predicted future-self persona and Realtime system prompt.
- Avatar-worker streaming is intentionally not connected yet.

### LiveKit Cloud vs Local LiveKit

Use LiveKit Cloud for the first R&D milestone. It removes local TLS, TURN, NAT,
and mobile-network issues from the first test, which makes browser join,
microphone capture, and remote track rendering easier to verify.

Use local LiveKit later when you need fully offline development, protocol-level
debugging, reproducible load tests, or cost-controlled internal GPU pipeline
experiments.

### Environment

Copy `.env.example` to `.env` and fill only local secrets:

```sh
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
AVATAR_LAB_HOST=127.0.0.1
AVATAR_LAB_PORT=5174
AVATAR_LAB_DEFAULT_ROOM=psyche-avatar-lab
AVATAR_LAB_TOKEN_TTL_SECONDS=3600
OPENAI_API_KEY=
AVATAR_PERSONA_FILE=
AVATAR_VOICE_MODE=auto
AVATAR_USER_VOICE_GENDER=neutral
OPENAI_REALTIME_VOICE_FEMALE=marin
OPENAI_REALTIME_VOICE_MALE=cedar
OPENAI_REALTIME_VOICE_NEUTRAL=marin
OPENAI_CUSTOM_VOICE_ID=
AVATAR_AGENT_MODE=placeholder
AVATAR_AGENT_LISTEN_SECONDS=4
AVATAR_AGENT_MAX_TURNS=3
AVATAR_AGENT_MAX_WAIT_SECONDS=20
AVATAR_AGENT_VAD_THRESHOLD=250
AVATAR_AGENT_VAD_MIN_SPEECH_MS=300
AVATAR_AGENT_VAD_SILENCE_MS=900
AVATAR_AGENT_INTERRUPT_ENABLED=true
AVATAR_AGENT_INTERRUPT_MIN_SPEECH_MS=100
AVATAR_AGENT_OUTPUT_QUEUE_MS=120
AVATAR_AGENT_GREETING_ENABLED=false
AVATAR_AGENT_PUBLISH_PLACEHOLDER_VIDEO=false
AVATAR_AGENT_MOCK_AVATAR_ENABLED=true
AVATAR_AGENT_MOCK_AVATAR_GAIN=18
AVATAR_AGENT_MOCK_AVATAR_DECAY=0.72
```

Do not commit `.env` or provider API keys.

### Run

From the repository root:

```sh
node apps/agent/server.js
```

Then open:

```txt
http://127.0.0.1:5174
```

To test remote tracks before the AI agent exists, open the same URL in two
browser windows and join the same room with different identities.

To test the future AI-agent slot in one browser, join from the main UI with
Camera/Mic off and click:

```txt
Start embedded agent sim
```

The main UI should show the simulator as a participant, render its remote audio
and video tracks, and receive its latency events.

To test the same flow as a separate browser page, open:

```txt
http://127.0.0.1:5174/agent-sim.html
```

To test the real Node agent skeleton, install dependencies and run it in a
second terminal while the web server is running:

```sh
npm install
node apps/agent/room-agent.mjs
```

The web UI should show `psyche-node-agent` as a remote participant with
placeholder audio/video tracks and recurring latency events.

In the Codex desktop shell on macOS, use `/opt/homebrew/bin/node` for
`room-agent.mjs` if the bundled app Node cannot load LiveKit's native binding.

With `OPENAI_API_KEY` set, run the same process in Realtime greeting mode:

```sh
AVATAR_AGENT_MODE=realtime node apps/agent/room-agent.mjs
```

This replaces placeholder audio with OpenAI Realtime-generated speech. When a
browser publishes microphone audio, the agent runs a bounded fixed-window turn
loop:

```txt
listening -> thinking -> speaking -> idle
```

Each turn waits for speech with a simple RMS VAD gate, captures up to
`AVATAR_AGENT_LISTEN_SECONDS` seconds after speech starts, and sends it to
OpenAI Realtime. While the AI is speaking, the next listen cycle keeps watching
for user speech. If speech is detected, the agent sends `response.cancel` and
treats the detected audio as the next user turn. Interrupts also clear the
LiveKit audio output queue. The loop stops after `AVATAR_AGENT_MAX_TURNS`
successful user turns to keep R&D cost predictable.

For a lower-cost smoke test:

```sh
AVATAR_AGENT_MODE=realtime AVATAR_AGENT_GREETING_ENABLED=false AVATAR_AGENT_LISTEN_SECONDS=4 AVATAR_AGENT_MAX_TURNS=2 node apps/agent/room-agent.mjs
```

The agent logs each `response.done` usage payload plus an `estimatedCostUsd`
object so short R&D turns can be watched against the remaining OpenAI credit.

### Realtime Audio to Avatar Video

Experimental mode for the GPU avatar path:

```txt
Browser mic -> LiveKit -> Node agent -> GPT Realtime audio + transcript
  -> Realtime audio WAV -> GPU Wav2Lip
  -> transcript -> ElevenLabs
  -> when video is ready, browser plays muted video while ElevenLabs audio starts
```

Run the GPU worker first and keep the SSH tunnel open:

```sh
scripts/avatar-worker-host-server.sh
ssh -L 8080:127.0.0.1:8080 gpu
```

Then run the room agent:

```sh
AVATAR_AGENT_MODE=realtime \
AVATAR_AGENT_TTS_PROVIDER=elevenlabs \
AVATAR_AGENT_VIDEO_REPLY_ENABLED=true \
AVATAR_LIPSYNC_ENGINE=wav2lip \
AVATAR_FACE_PATH=models/assets/face-still.jpg \
AVATAR_AGENT_VIDEO_REPLY_MAX_AUDIO_SECONDS=4 \
node apps/agent/room-agent.mjs
```

This mode intentionally uses GPT Realtime audio for Wav2Lip and ElevenLabs audio
for playback. It is an R&D experiment, so short one-sentence responses work best.

### Mock Avatar Video

Before A100/MuseTalk is available, the Node agent publishes a placeholder
talking-face video track. In Realtime mode, OpenAI output audio RMS drives the
mock avatar mouth level:

```txt
OpenAI Realtime audio delta
  -> output RMS
  -> mock mouth level
  -> LiveKit video frame
```

This proves the full transport shape before GPU inference:

```txt
Browser mic -> LiveKit -> Node agent -> OpenAI Realtime
  -> AI audio + mock avatar video -> LiveKit -> Browser
```

Later, replace the mock mouth-level frame generator with MuseTalk frames from
`avatar-worker`; the LiveKit publishing surface can stay the same.

### Persona Pipeline

Generate a future-self persona from a current-self survey:

```sh
node apps/agent/generate-persona.mjs --input apps/agent/persona.sample.json --output runs/personas/sample-persona.json
```

Then run the Realtime agent with that persona:

```sh
AVATAR_PERSONA_FILE=runs/personas/sample-persona.json AVATAR_AGENT_MODE=realtime node apps/agent/room-agent.mjs
```

### Voice Selection

Keep OpenAI Realtime for the low-latency path. `AVATAR_VOICE_MODE=auto` chooses
a built-in Realtime voice from `AVATAR_USER_VOICE_GENDER`. When OpenAI custom
voice access is available, set `AVATAR_VOICE_MODE=custom` and
`OPENAI_CUSTOM_VOICE_ID=voice_...` to use the same Realtime pipeline with the
custom voice id.

For ElevenLabs experiments, use the clone/TTS smoke CLI first:

```sh
node apps/agent/elevenlabs-voice.mjs clone --sample runs/voice-samples/my-voice.wav --name "Psyche Future Self Voice" --confirm-consent
node apps/agent/elevenlabs-voice.mjs synthesize --voice-id <voice_id> --text "나는 10년 뒤의 너야."
```

### Check

```sh
node --check apps/agent/server.js
node --check apps/web/src/main.js
```

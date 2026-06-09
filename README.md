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
- OpenAI Realtime and avatar-worker streaming are intentionally not connected
  yet.

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

With `OPENAI_API_KEY` set, run the same process in Realtime greeting mode:

```sh
AVATAR_AGENT_MODE=realtime node apps/agent/room-agent.mjs
```

This replaces placeholder audio with OpenAI Realtime-generated greeting audio.
When a browser publishes microphone audio, the agent forwards the first
`AVATAR_AGENT_LISTEN_SECONDS` seconds to OpenAI Realtime and requests an audio
response. Full continuous turn-taking is the next milestone.

### Check

```sh
node --check apps/agent/server.js
node --check apps/web/src/main.js
```

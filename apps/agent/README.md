# Agent App

LiveKit voice agent that connects user audio to an AI voice model.

## Goal

Create a realtime voice agent that can later drive the avatar worker.

## First Milestone

1. Mint short-lived LiveKit room tokens for the browser test UI.
2. Serve the static `apps/web` LiveKit room UI.
3. Join a LiveKit room as an AI participant.
4. Receive user microphone audio.
5. Generate AI speech with OpenAI Realtime API.
6. Publish AI audio back to the room.
7. Emit transcript and timing events.

## Planned Stack

- LiveKit Agents.
- OpenAI Realtime API.
- Optional future fallback: Whisper STT + local/hosted LLM + streaming TTS.

## Notes

This app should not generate avatar video directly. It should send audio chunks
and timing events to `avatar-worker`.

## Current Implementation

`server.js` is intentionally dependency-light for the first room connectivity
milestone. It does not connect to OpenAI yet. It provides:

- `GET /` static web UI.
- `GET /health` environment readiness check.
- `POST /api/livekit/token` LiveKit JWT minting for a single room join.

Required environment variables:

```sh
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

Optional environment variables:

```sh
AVATAR_LAB_HOST=127.0.0.1
AVATAR_LAB_PORT=5174
AVATAR_LAB_DEFAULT_ROOM=psyche-avatar-lab
AVATAR_LAB_TOKEN_TTL_SECONDS=3600
OPENAI_API_KEY=
```

## Node Room Agent Skeleton

`room-agent.mjs` is the first real server-side LiveKit participant skeleton. It
joins a room from Node, publishes placeholder audio/video tracks, and emits
`latency.metric` data-channel events. OpenAI Realtime is intentionally not
connected yet.

Install dependencies once:

```sh
npm install
```

Run the browser token/static server:

```sh
node apps/agent/server.js
```

Run the room agent in a second terminal:

```sh
node apps/agent/room-agent.mjs
```

Optional flags:

```sh
node apps/agent/room-agent.mjs --room psyche-avatar-lab --identity psyche-node-agent
```

When the web UI joins the same room, it should show `psyche-node-agent` as a
remote participant with placeholder audio/video tracks and recurring latency
events.

### OpenAI Realtime Test-Turn Mode

After adding `OPENAI_API_KEY`, you can run the same agent in Realtime mode:

```sh
AVATAR_AGENT_MODE=realtime node apps/agent/room-agent.mjs
```

In this mode, the agent still publishes placeholder video, but its audio track
is fed by OpenAI Realtime output audio from a short greeting prompt.

When a remote microphone track is subscribed, the agent forwards the first
`AVATAR_AGENT_LISTEN_SECONDS` seconds of 24 kHz mono PCM to OpenAI Realtime,
commits that input, and requests a response. This is a narrow first pass for
speech-to-speech verification, not full turn-taking yet.

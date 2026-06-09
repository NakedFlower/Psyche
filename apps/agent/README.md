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
AVATAR_AGENT_MOCK_AVATAR_ENABLED=true
AVATAR_AGENT_MOCK_AVATAR_GAIN=18
AVATAR_AGENT_MOCK_AVATAR_DECAY=0.72
```

## Node Room Agent Skeleton

`room-agent.mjs` is the first real server-side LiveKit participant skeleton. It
joins a room from Node, publishes audio/video tracks, and emits data-channel
events for latency and agent state.

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

In the Codex desktop shell on macOS, the bundled app Node may fail to load
LiveKit's native `.node` binding because of code-signing restrictions. If that
happens, use the system/Homebrew Node instead:

```sh
/opt/homebrew/bin/node apps/agent/room-agent.mjs
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
is fed by OpenAI Realtime output audio from a short greeting prompt and user
microphone turns.

When a remote microphone track is subscribed, the agent runs a bounded turn
loop:

1. Publish `agent.state=listening`.
2. Wait for speech with a simple RMS VAD gate.
3. Publish `agent.state=thinking`.
4. Commit the audio to OpenAI Realtime and request a response.
5. Publish `agent.state=speaking` and immediately return to listening.
6. Repeat until `AVATAR_AGENT_MAX_TURNS`, then publish `agent.state=idle`.

The current VAD is intentionally simple:

- `AVATAR_AGENT_VAD_THRESHOLD` controls how loud a frame must be to count as speech.
- `AVATAR_AGENT_VAD_MIN_SPEECH_MS` prevents short clicks/noise from triggering a response.
- `AVATAR_AGENT_VAD_SILENCE_MS` ends the turn after speech has stopped.
- `AVATAR_AGENT_MAX_WAIT_SECONDS` prevents the agent from listening forever.
- `AVATAR_AGENT_INTERRUPT_ENABLED=true` sends `response.cancel` when user speech
  is detected while the AI is still speaking.
- `AVATAR_AGENT_INTERRUPT_MIN_SPEECH_MS` controls how quickly speech is accepted
  during interruption.
- `AVATAR_AGENT_OUTPUT_QUEUE_MS` keeps LiveKit's outgoing audio queue short, and
  the queue is cleared on interruption.

This is still an R&D loop. It does not yet run a real lip-sync model, but it can
publish a mock talking-face video track driven by OpenAI output audio RMS.

Mock avatar controls:

- `AVATAR_AGENT_MOCK_AVATAR_ENABLED=true` enables the placeholder talking face.
- `AVATAR_AGENT_MOCK_AVATAR_GAIN` maps output audio RMS to mouth openness.
- `AVATAR_AGENT_MOCK_AVATAR_DECAY` controls how quickly the mouth closes.

Every `response.done` event logs the raw OpenAI Realtime `usage` payload and a
local `estimatedCostUsd` calculation. The default price env values mirror the
current `gpt-realtime` public pricing and can be overridden in `.env`.

For low-cost testing with greeting disabled:

```sh
AVATAR_AGENT_MODE=realtime AVATAR_AGENT_GREETING_ENABLED=false AVATAR_AGENT_LISTEN_SECONDS=4 AVATAR_AGENT_MAX_TURNS=2 node apps/agent/room-agent.mjs
```

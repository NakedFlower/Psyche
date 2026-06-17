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
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_VOICE_NAME=
ELEVENLABS_REUSE_EXISTING=true
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_LIVEKIT_OUTPUT_FORMAT=pcm_24000
AVATAR_PERSONA_FILE=
AVATAR_VOICE_MODE=auto
AVATAR_USER_VOICE_GENDER=neutral
AVATAR_AGENT_TTS_PROVIDER=openai
OPENAI_REALTIME_VOICE_FEMALE=marin
OPENAI_REALTIME_VOICE_MALE=cedar
OPENAI_REALTIME_VOICE_NEUTRAL=marin
OPENAI_CUSTOM_VOICE_ID=
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

## Bedrock Persona Provider

The default persona generator is deterministic and local. For the contest
Bedrock track, the same persona flow can ask Bedrock Claude to refine the
future-self persona while keeping the same JSON schema and Realtime prompt
shape.

Required environment variables:

```sh
AWS_REGION=us-east-1
BEDROCK_AUTH_MODE=bearer
BEDROCK_BEARER_TOKEN=
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0
```

The Bedrock model id is normalized automatically. If the value does not start
with a regional prefix such as `us.`, the agent prepends `us.` before calling
Bedrock.

The contest-provided Bedrock credential is a bearer token, not a standard AWS
access key pair. `BEDROCK_API_KEY` is also accepted as an alias for
`BEDROCK_BEARER_TOKEN`. `BEDROCK_API_KEY_NAME` can be stored for bookkeeping,
but it is not sent to the API.

If you later use a normal AWS account instead of the contest bearer token, set
`BEDROCK_AUTH_MODE=aws` and provide:

```sh
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
```

Generate a persona with Bedrock from the CLI:

```sh
node apps/agent/generate-persona.mjs \
  --input apps/agent/persona.sample.json \
  --output runs/personas/bedrock-persona.json \
  --provider bedrock
```

The web UI also has an Engine selector in the Survey & Voice panel. Choose
`Bedrock Claude` to use this provider. If Bedrock credentials, permissions, or
quota are not ready, the server falls back to the local rule generator and
returns a warning in the generated config.

## Azure Persona Provider

For an Azure-centered contest demo, the persona generator can use an Azure
OpenAI-compatible deployment instead of Bedrock. This keeps the real-time
conversation and persona generation on Azure while preserving the local rule
fallback.

Required environment variables:

```sh
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_PERSONA_DEPLOYMENT=<chat-or-claude-compatible-deployment>
AZURE_OPENAI_PERSONA_API=auto
AZURE_OPENAI_API_VERSION=preview
PERSONA_PROVIDER=azure
```

If Foundry gives you a full Responses API URI such as
`https://<resource>.services.ai.azure.com/openai/v1/responses`, put it in
`AZURE_OPENAI_PERSONA_ENDPOINT`:

```sh
AZURE_OPENAI_PERSONA_ENDPOINT=https://<resource>.services.ai.azure.com/openai/v1/responses
AZURE_OPENAI_PERSONA_API=responses
AZURE_OPENAI_PERSONA_DEPLOYMENT=gpt-5-mini
```

If `AZURE_OPENAI_PERSONA_DEPLOYMENT` is not set, the provider falls back to
`AZURE_OPENAI_DEPLOYMENT_NAME`. For clarity, keep persona generation and
Realtime deployments separate when possible:

```sh
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-realtime
AZURE_OPENAI_PERSONA_DEPLOYMENT=gpt-4.1
```

Generate a persona with Azure from the CLI:

```sh
node apps/agent/generate-persona.mjs \
  --input apps/agent/persona.sample.json \
  --output runs/personas/azure-persona.json \
  --provider azure
```

The base persona now includes a randomized `futureTrajectory` influenced by the
three Psyche weights and the user's concerns/habits. The LLM provider must honor
that trajectory, so generated futures can be aspirational, balanced, stalled, or
strained instead of always successful.

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

To use Azure GPT Realtime instead of the public OpenAI Realtime endpoint, set:

```sh
OPENAI_REALTIME_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-realtime
```

With `OPENAI_REALTIME_PROVIDER=azure`, `OPENAI_API_KEY` is no longer required for
the room agent. Keep it only if you want the public OpenAI endpoint as a
fallback.

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

## Persona Pipeline

The agent can build a future-self persona from a current-self survey JSON.
Users do not directly choose every future detail; the pipeline infers a future
self from current habits, values, goals, concerns, and the three Psyche weights.

Generate a persona JSON from the sample survey:

```sh
node apps/agent/generate-persona.mjs --input apps/agent/persona.sample.json --output runs/personas/sample-persona.json
```

Preview the generated Realtime system prompt:

```sh
node apps/agent/generate-persona.mjs --input apps/agent/persona.sample.json --print-prompt
```

Run the room agent with that persona:

```sh
AVATAR_PERSONA_FILE=runs/personas/sample-persona.json AVATAR_AGENT_MODE=realtime node apps/agent/room-agent.mjs
```

## Voice Pipeline

The fast default path keeps OpenAI Realtime as the speech engine and chooses a
built-in voice:

```sh
AVATAR_VOICE_MODE=auto AVATAR_USER_VOICE_GENDER=female
AVATAR_VOICE_MODE=auto AVATAR_USER_VOICE_GENDER=male
```

Default built-in mapping:

- `female` -> `OPENAI_REALTIME_VOICE_FEMALE=marin`
- `male` -> `OPENAI_REALTIME_VOICE_MALE=cedar`
- `neutral` -> `OPENAI_REALTIME_VOICE_NEUTRAL=marin`

When OpenAI custom voices are enabled for the organization, keep the same
Realtime path and pass the custom voice id:

```sh
AVATAR_VOICE_MODE=custom OPENAI_CUSTOM_VOICE_ID=voice_123abc
```

If `AVATAR_VOICE_MODE=custom` is set without `OPENAI_CUSTOM_VOICE_ID`, the agent
falls back to the gender-based built-in voice and logs the fallback reason.

### ElevenLabs Voice Clone Smoke Test

ElevenLabs is available as an experimental custom-voice path. The first step is
not full realtime integration; it is a safe clone + TTS smoke test.

Create a voice clone from a user-owned sample:

```sh
node apps/agent/elevenlabs-voice.mjs clone \
  --sample runs/voice-samples/my-voice.wav \
  --name "Psyche Future Self Voice" \
  --gender neutral \
  --confirm-consent \
  --output runs/voices/elevenlabs-my-voice.json
```

Generate a Korean TTS sample from that voice:

```sh
node apps/agent/elevenlabs-voice.mjs synthesize \
  --voice-id <voice_id_from_json> \
  --text "나는 10년 뒤의 너야. 오늘은 다음 한 걸음부터 같이 보자." \
  --output runs/voices/elevenlabs-sample.mp3
```

Keep `ELEVENLABS_API_KEY` only in `.env`. Do not commit generated voice records
or audio samples under `runs/`.

If you want the most stable test setup, keep one approved custom voice and
reuse it instead of creating a new clone for every user. Put this in `.env`:

```sh
ELEVENLABS_VOICE_ID=<existing_voice_id>
ELEVENLABS_VOICE_NAME=Psyche Test Voice
ELEVENLABS_REUSE_EXISTING=true
```

Then the prepare flow will still accept a new uploaded sample for lip-sync seed
generation, but it will skip creating a new ElevenLabs custom voice and reuse
the configured one.

### ElevenLabs LiveKit Agent Mode

For latency experiments, the Realtime agent can use OpenAI Realtime for audio
input and text generation, then synthesize the final answer through ElevenLabs
and publish the generated PCM audio to the same LiveKit room.

Add the cloned voice id to `.env`:

```sh
ELEVENLABS_VOICE_ID=IO0AviODTW9q2bmIfqqc
AVATAR_AGENT_TTS_PROVIDER=elevenlabs
ELEVENLABS_LIVEKIT_OUTPUT_FORMAT=pcm_24000
```

Run the agent:

```sh
AVATAR_AGENT_MODE=realtime AVATAR_AGENT_TTS_PROVIDER=elevenlabs node apps/agent/room-agent.mjs
```

If `.env` already contains `AVATAR_AGENT_MODE=realtime`,
`AVATAR_AGENT_TTS_PROVIDER=elevenlabs`, `ELEVENLABS_VOICE_ID`, and
`AVATAR_PERSONA_FILE`, the short command is enough:

```sh
/opt/homebrew/bin/node apps/agent/room-agent.mjs
```

This mode is intentionally slower than native OpenAI Realtime audio. The current
pipeline waits for the model's text response, sends that text to ElevenLabs,
then streams the returned PCM frames into LiveKit. Use it to validate cloned
voice quality and end-to-end wiring before optimizing for streaming latency.

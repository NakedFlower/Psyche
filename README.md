# Psyche AI Tavus MVP

Standalone MVP for testing Psyche's AI video-call experience with Tavus.

The current goal is intentionally narrow:

- Create a Tavus conversation from a local Psyche-style API.
- Render the Tavus video-call URL in a simple browser UI.
- End the active Tavus conversation so test sessions do not pile up.
- Prepare the next step: survey-based persona prompt generation and automatic
  Tavus persona creation.

## Run

Create `.env` from `.env.example` and fill the Tavus values.

```bash
cd /Users/jangseou/psyche-ai
npm run dev:tavus
```

Open:

```txt
http://127.0.0.1:4310
```

## Environment

```env
TAVUS_API_KEY=
TAVUS_REPLICA_ID=
TAVUS_PERSONA_ID=
TAVUS_LANGUAGE=korean
TAVUS_VOICE_NAME=anna
```

Optional future voice settings:

```env
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

## Current Flow

```txt
Browser UI
  -> POST /api/v1/chats/session
  -> Tavus POST /v2/conversations
  -> conversation_url
  -> iframe video call
```

Ending a call:

```txt
Browser UI
  -> PATCH /api/v1/chats/test/end
  -> Tavus POST /v2/conversations/{conversation_id}/end
```

## Next Flow

```txt
Survey input
  -> Image URL to Tavus replica
  -> Rule-based persona prompt generator
  -> Tavus POST /v2/personas
  -> saved tavus_persona_id
  -> Tavus conversation
```

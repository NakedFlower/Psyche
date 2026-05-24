# Tavus MVP Architecture

## Product Direction

This branch is focused on validating the fastest useful version of Psyche's AI
video-call product with Tavus.

The AI branch should prove this flow first:

```txt
Psyche survey data
  -> future year and persona weights
  -> persona prompt
  -> Tavus persona
  -> Tavus conversation
  -> video call with the future-self persona
```

## Current MVP

The current implementation can create a Tavus persona from local test inputs,
then start a Tavus conversation with that generated persona.

```txt
apps/ai-demo/web
  -> local test UI

apps/ai-demo/server
  -> Psyche-style API wrapper
  -> Tavus conversation create/end calls

Tavus
  -> hosted replica/persona/conversation pipeline
```

## Current Runtime Flow

```txt
1. User opens http://127.0.0.1:4310
2. User clicks "화상통화 시작"
3. User clicks "페르소나 생성"
4. Local server builds a Korean future-self prompt
5. Local server calls Tavus Create Persona
6. User clicks "화상통화 시작"
7. Local server calls Tavus Create Conversation
8. Browser renders the Tavus room in an iframe
9. User clicks "화상통화 종료"
10. Local server calls Tavus End Conversation
```

## Near-Term Target

Persona generation inputs:

- MBTI
- values
- lifestyle habits
- goals
- current concerns
- target future year: 10, 20, or 30
- ideal future vs realistic future percentage
- career vs family/life percentage
- direct advice vs empathy percentage

## Voice Strategy

For the first version, use Tavus default TTS. After the persona-generation flow
works, add a TTS layer to Tavus persona creation:

- Default Tavus/Cartesia voice for the simplest MVP.
- ElevenLabs `external_voice_id` for a custom voice.
- Voice cloning only after consent and policy flows are designed.

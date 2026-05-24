# Tavus Provider Notes

## Current Provider

Tavus is the only active provider in this MVP.

## Why Tavus First

- It provides hosted conversational video sessions.
- It lets us combine a replica, persona, language settings, and TTS settings.
- It returns a conversation URL that can be embedded quickly for MVP testing.
- It lets Psyche validate the product feeling before building custom avatar or
  realtime voice infrastructure.

## Tavus Concepts

- `replica_id`: the visual actor/avatar.
- `persona_id`: behavior, instruction, conversation style, and TTS config.
- `conversation_id`: one live video-call session.
- `conversation_url`: the Daily room URL used by the browser.

## Deferred Providers

The earlier generic provider comparison is intentionally removed for now. D-ID,
HeyGen, Simli, and OpenAI Realtime can be reconsidered after Tavus MVP quality,
latency, pricing, and Korean support are tested.


# Agent App

LiveKit voice agent that connects user audio to an AI voice model.

## Goal

Create a realtime voice agent that can later drive the avatar worker.

## First Milestone

1. Join a LiveKit room as an AI participant.
2. Receive user microphone audio.
3. Generate AI speech with OpenAI Realtime API.
4. Publish AI audio back to the room.
5. Emit transcript and timing events.

## Planned Stack

- LiveKit Agents.
- OpenAI Realtime API.
- Optional future fallback: Whisper STT + local/hosted LLM + streaming TTS.

## Notes

This app should not generate avatar video directly. It should send audio chunks
and timing events to `avatar-worker`.


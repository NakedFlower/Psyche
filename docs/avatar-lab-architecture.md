# Avatar Lab Architecture

## Purpose

This branch explores whether Psyche can reduce dependency on Tavus by building
a realtime avatar pipeline with LiveKit and GPU lip-sync models.

Tavus remains the stable product-demo path. Avatar Lab is the R&D path.

## Target Pipeline

```txt
Browser microphone
  -> LiveKit WebRTC room
  -> Voice agent
  -> OpenAI Realtime API
  -> AI audio stream
  -> Avatar worker
  -> Wav2Lip or MuseTalk
  -> FFmpeg/PyAV encoding
  -> LiveKit custom video track
  -> Browser video-call UI
```

## Service Boundaries

```txt
apps/web
  Browser UI and LiveKit client.

apps/agent
  Voice agent, turn detection, AI audio generation, transcript events.

apps/avatar-worker
  GPU model inference, frame generation, video track publishing.

packages/shared
  Event schemas and shared contracts.
```

## Development Strategy

1. Voice-only LiveKit + OpenAI Realtime prototype.
2. Offline lip-sync benchmark with generated audio.
3. Streaming lip-sync worker on A100.
4. LiveKit custom video track publishing.
5. Compare against Tavus on latency, quality, and cost.


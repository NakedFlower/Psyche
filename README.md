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


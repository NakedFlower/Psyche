# Avatar Worker API

This document describes the current avatar-lab R&D contract. The stable Tavus
MVP is separate; this API is for the GPU-backed MuseTalk path.

## Local Orchestrator

`apps/agent/server.js` exposes a temporary orchestration endpoint for the lab UI.

### `POST /api/avatar/reply`

Creates a short future-self answer, synthesizes speech with ElevenLabs, uploads
the audio to the GPU worker, and returns the GPU job.

Request:

```json
{
  "question": "지금 내가 뭘 먼저 해야 할까?",
  "workerUrl": "http://127.0.0.1:8080",
  "facePath": "models/assets/face.mp4",
  "personaFile": "runs/personas/persona-123.json"
}
```

Response:

```json
{
  "ok": true,
  "replyText": "지금은 하나만 정해서 끝내는 게 먼저야.",
  "audioFile": "runs/avatar-replies/reply-123.mp3",
  "workerUrl": "http://127.0.0.1:8080",
  "workerJob": {
    "jobId": "20260616T010203Z",
    "status": "queued",
    "videoUrl": "/runs/lipsync/jobs/20260616T010203Z/output.mp4",
    "reportUrl": "/runs/lipsync/jobs/20260616T010203Z/report.json"
  },
  "azure": {
    "deployment": "gpt-5-mini",
    "latencyMs": 1200
  }
}
```

Required local environment variables:

```txt
AZURE_OPENAI_API_KEY
AZURE_OPENAI_PERSONA_ENDPOINT
AZURE_OPENAI_PERSONA_DEPLOYMENT
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
```

## GPU Worker

The worker can run in Docker or host mode. During R&D, host mode is faster:

```sh
scripts/avatar-worker-host-server.sh
```

Keep an SSH tunnel open from the local machine:

```sh
ssh -L 8080:localhost:8080 gpu
```

### `GET /health`

Returns worker status.

### `POST /v1/lipsync/jobs`

Creates a non-blocking MuseTalk job.

JSON request:

```json
{
  "engine": "musetalk",
  "avatarId": "future-self-v1",
  "facePath": "models/assets/face.mp4",
  "audioPath": "models/assets/speech-clean.wav",
  "useFloat16": true
}
```

Multipart request:

```txt
engine=musetalk
facePath=models/assets/face.mp4
useFloat16=true
audio=@reply.mp3
```

Response:

```json
{
  "jobId": "20260616T010203Z",
  "status": "queued",
  "engine": "musetalk",
  "videoUrl": "/runs/lipsync/jobs/20260616T010203Z/output.mp4",
  "reportUrl": "/runs/lipsync/jobs/20260616T010203Z/report.json"
}
```

When `avatarId` is present, the worker uses MuseTalk realtime inference with
the cached avatar prepared by `POST /v1/avatars`. Without `avatarId`, the worker
uses the older normal inference path.

### `POST /v1/avatars`

Prepares MuseTalk's realtime avatar cache for a reusable face video. This is
the expensive one-time step for a given avatar.

Request:

```json
{
  "avatarId": "future-self-v1",
  "facePath": "models/assets/face-optimized.mp4",
  "audioPath": "models/assets/speech-clean.wav",
  "batchSize": 8,
  "bboxShift": 0
}
```

Response:

```json
{
  "jobId": "avatar-future-self-v1-20260616T010203Z",
  "status": "queued",
  "type": "avatar.prepare",
  "avatarId": "future-self-v1",
  "avatarUrl": "/v1/avatars/future-self-v1"
}
```

Poll the returned `jobId` through `GET /v1/lipsync/jobs/:jobId`. Once completed,
the avatar cache can be reused by passing the same `avatarId` to
`POST /v1/lipsync/jobs`.

### `GET /v1/avatars/:avatarId`

Returns whether the MuseTalk realtime avatar cache exists:

```json
{
  "avatarId": "future-self-v1",
  "status": "ready",
  "hasLatents": true,
  "hasCoords": true,
  "hasMasks": true
}
```

### `GET /v1/lipsync/jobs/:jobId`

Returns one of:

```txt
queued
running
completed
failed
```

When completed, the frontend should load `videoUrl` from the worker base URL.

## Product Integration Direction

The production Psyche backend should own:

- user auth and persona lookup
- text answer generation
- TTS generation
- GPU worker job creation and polling
- exposing a stable result URL to the frontend

The frontend should not need to know raw GPU paths such as `facePath` or
`workerUrl` after integration.

# Avatar Worker

GPU worker for lip-sync and talking-face generation.

## Goal

Use A100 GPU resources to test whether Psyche can generate realtime avatar
video without relying on Tavus.

## First Milestone

1. Load a reference face image or short source clip.
2. Receive AI speech audio chunks.
3. Generate lip-synced frames with Wav2Lip or MuseTalk.
4. Encode frames with FFmpeg/PyAV.
5. Publish frames as a LiveKit custom video track.

## Candidate Models

- Wav2Lip: first baseline because it is simpler and well-known.
- MuseTalk: higher-quality realtime lip-sync candidate.
- SadTalker: useful for comparison, likely less suitable for realtime calls.

## Metrics

- Model warmup time.
- Audio chunk to first frame latency.
- Average FPS.
- Audio/video sync drift.
- GPU memory usage.


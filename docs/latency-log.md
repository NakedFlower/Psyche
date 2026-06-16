# Latency Log

Use this document to record benchmark runs.

## Metrics

| Date | Model | GPU | Source | Chunk Size | First Frame | FPS | VRAM | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TBD | TBD | A100 | TBD | TBD | TBD | TBD | TBD | TBD |

## Benchmark Reports

Offline lip-sync benchmark reports are generated under:

```txt
runs/lipsync/<run-id>/report.json
runs/lipsync/runs.jsonl
```

Start with:

```sh
scripts/benchmark-lipsync.sh --engine dry-run --generate-fixtures
```

Then repeat the same command with `--engine wav2lip` or `--engine musetalk`
after the model repositories and checkpoints are available on the GPU server.

For MuseTalk profiling on the GPU server:

```sh
OUT_DIR=runs/lipsync/profile-$(date +%Y%m%dT%H%M%S) scripts/avatar-worker-host-musetalk.sh
cat runs/lipsync/profile-*/report.json
```

Important fields:

- `metrics.stageTimings.subprocessMs`: time spent inside MuseTalk inference process.
- `metrics.inferenceRealtimeFactor`: audio seconds divided by inference seconds. `1.0` means realtime speed.
- `metrics.wallClockRealtimeFactor`: audio seconds divided by full request wall-clock seconds.
- `environment.torch.cudaAvailable`: whether the MuseTalk Python environment can see CUDA.
- `metrics.maxGpuMemoryMb`: maximum sampled GPU memory while MuseTalk was running.
- `metrics.maxGpuUtilizationPct`: maximum sampled GPU utilization while MuseTalk was running.
- `metrics.gpuSamples`: final sampled `nvidia-smi` readings from the run.

If almost all time is in `subprocessMs`, the next optimization target is a
persistent MuseTalk worker that keeps Python imports and model weights warm
instead of starting a fresh process per answer.

If CUDA is available but GPU utilization stays very low, reduce the source
avatar video size before deeper worker changes:

```sh
scripts/prepare-avatar-source.sh models/assets/face.mp4 models/assets/face-optimized.mp4
FACE_PATH=models/assets/face-optimized.mp4 OUT_DIR=runs/lipsync/profile-optimized-$(date +%Y%m%dT%H%M%S) scripts/avatar-worker-host-musetalk.sh
```

Compare `inferenceMs`, `maxGpuUtilizationPct`, and `inferenceRealtimeFactor`
against the original 1080x1920 input. This checks whether high-resolution frame
processing is the dominant bottleneck.

MuseTalk also provides a realtime inference path with avatar preparation cache.
Use it to split one-time avatar preprocessing from per-answer lipsync:

```sh
MUSETALK_INFERENCE_MODE=realtime \
MUSETALK_REALTIME_PREPARATION=1 \
MUSETALK_AVATAR_ID=future-self-v1 \
FACE_PATH=models/assets/face-optimized.mp4 \
OUT_DIR=runs/lipsync/profile-realtime-prepare-$(date +%Y%m%dT%H%M%S) \
scripts/avatar-worker-host-musetalk.sh

MUSETALK_INFERENCE_MODE=realtime \
MUSETALK_AVATAR_ID=future-self-v1 \
FACE_PATH=models/assets/face-optimized.mp4 \
OUT_DIR=runs/lipsync/profile-realtime-reuse-$(date +%Y%m%dT%H%M%S) \
scripts/avatar-worker-host-musetalk.sh
```

The first command measures cache preparation plus one generation. The second
command measures the reusable per-answer path.

Compare the same optimized source against Wav2Lip:

```sh
scripts/setup-wav2lip-host.sh

FACE_PATH=models/assets/face-optimized.mp4 \
AUDIO_PATH=models/assets/speech-clean.wav \
OUT_DIR=runs/lipsync/wav2lip-optimized-$(date +%Y%m%dT%H%M%S) \
scripts/avatar-worker-host-wav2lip.sh
```

Use the same `inferenceMs`, `inferenceRealtimeFactor`,
`maxGpuMemoryMb`, and `maxGpuUtilizationPct` fields to compare Wav2Lip against
MuseTalk realtime cache reuse.

## Target Ranges

- Voice turn stop to AI first audio: under 1500 ms.
- AI first audio to avatar first frame: under 1000 ms for a usable prototype.
- Avatar frame rate: 20 FPS or higher for realtime perception.
- Audio/video drift: under 120 ms when possible.

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

## Target Ranges

- Voice turn stop to AI first audio: under 1500 ms.
- AI first audio to avatar first frame: under 1000 ms for a usable prototype.
- Avatar frame rate: 20 FPS or higher for realtime perception.
- Audio/video drift: under 120 ms when possible.

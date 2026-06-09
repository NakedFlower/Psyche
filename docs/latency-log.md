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

## Target Ranges

- Voice turn stop to AI first audio: under 1500 ms.
- AI first audio to avatar first frame: under 1000 ms for a usable prototype.
- Avatar frame rate: 20 FPS or higher for realtime perception.
- Audio/video drift: under 120 ms when possible.

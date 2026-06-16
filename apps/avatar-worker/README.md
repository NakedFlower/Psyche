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

## Offline Benchmark Harness

Before connecting realtime streaming, use the dependency-light benchmark runner
to validate assets, collect media metadata, and record repeatable benchmark
reports.

Smoke test with generated fixtures:

```sh
scripts/benchmark-lipsync.sh --engine dry-run --generate-fixtures
```

Docker smoke test on the GPU server:

```sh
sudo scripts/avatar-worker-docker-smoke.sh
```

If the user belongs to the `docker` group, `sudo` is not needed:

```sh
scripts/avatar-worker-docker-smoke.sh
```

Run against real assets:

```sh
scripts/benchmark-lipsync.sh --engine dry-run --face models/assets/face.png --audio models/assets/speech.wav
```

Prepared model adapters:

```sh
scripts/benchmark-lipsync.sh --engine wav2lip --face models/assets/face.png --audio models/assets/speech.wav
scripts/benchmark-lipsync.sh --engine musetalk --face models/assets/face.png --audio models/assets/speech.wav
```

`sadtalker` currently produces a blocked report with the expected input plan.
Wav2Lip and MuseTalk run when their external repos and weights exist under
`models/`.

Reports are written under `runs/lipsync/` and are intentionally ignored by git.

## GPU Server Flow

1. Confirm Docker can see the GPU:

   ```sh
   sudo docker run --rm --gpus all nvidia/cuda:12.2.2-base-ubuntu22.04 nvidia-smi
   ```

2. Build and run the worker smoke test:

   ```sh
   sudo scripts/avatar-worker-docker-smoke.sh
   ```

3. Confirm the generated report:

   ```sh
   cat runs/lipsync/docker-smoke/report.json
   ```

This smoke test does not run Wav2Lip or MuseTalk yet. It proves that the
container, FFmpeg, input fixture generation, report writing, and mounted
`models/` and `runs/` directories are ready before large model downloads.

## Wav2Lip Baseline

Prepare the Wav2Lip source tree:

```sh
scripts/setup-wav2lip.sh
```

Place these files on the GPU server:

```txt
models/assets/face.jpg
models/assets/speech.wav
models/wav2lip/checkpoints/Wav2Lip-SD-GAN.pt
```

Then build the Wav2Lip-enabled Docker image and run inference:

```sh
sudo scripts/avatar-worker-wav2lip.sh
```

During R&D, the host-side Wav2Lip runner avoids Docker rebuilds:

```sh
scripts/setup-wav2lip-host.sh
FACE_PATH=models/assets/face-optimized.mp4 \
AUDIO_PATH=models/assets/speech-clean.wav \
OUT_DIR=runs/lipsync/wav2lip-optimized-$(date +%Y%m%dT%H%M%S) \
scripts/avatar-worker-host-wav2lip.sh
```

Outputs:

```txt
runs/lipsync/wav2lip-test/output.mp4
runs/lipsync/wav2lip-test/report.json
runs/lipsync/wav2lip-test/wav2lip.stdout.log
runs/lipsync/wav2lip-test/wav2lip.stderr.log
```

The first build installs PyTorch CUDA wheels and may take several minutes.

The current official Wav2Lip download may provide `.pt` files such as
`Wav2Lip-SD-GAN.pt` instead of legacy `.pth` checkpoints. The benchmark runner
patches the cloned `inference.py` loader to support both the current
TorchScript checkpoint and the older `state_dict` format.

## MuseTalk Baseline

MuseTalk 1.5 is the next quality candidate after Wav2Lip. It is heavier to
install, so keep it isolated in its own Docker image tag.

Prepare the MuseTalk source tree and weights on the GPU server:

```sh
scripts/setup-musetalk.sh
```

Run the same assets through MuseTalk:

```sh
sudo scripts/avatar-worker-musetalk.sh
```

Useful overrides:

```sh
sudo env \
  FACE_PATH=models/assets/face.mp4 \
  AUDIO_PATH=models/assets/speech-clean.wav \
  MUSETALK_USE_FLOAT16=1 \
  MUSETALK_BATCH_SIZE=8 \
  OUT_DIR=runs/lipsync/musetalk-face-video-test \
  scripts/avatar-worker-musetalk.sh
```

Outputs:

```txt
runs/lipsync/musetalk-test/output.mp4
runs/lipsync/musetalk-test/report.json
runs/lipsync/musetalk-test/musetalk.stdout.log
runs/lipsync/musetalk-test/musetalk.stderr.log
```

The first MuseTalk build and weight download are much heavier than Wav2Lip.
Compare results using the same `face.mp4` and `speech-clean.wav` inputs.

## Turn-Based Demo Server

After MuseTalk output quality is acceptable, run a small HTTP server on the GPU
machine so the temporary web UI can request an avatar reply and play the
generated video.

On the GPU server:

```sh
sudo scripts/avatar-worker-demo-server.sh
```

From the local machine, keep an SSH tunnel open:

```sh
ssh -L 8080:localhost:8080 gpu
```

Then open the avatar-lab web UI locally and use:

```txt
GPU worker URL: http://127.0.0.1:8080
Face video:     models/assets/face.mp4
Reply audio:    models/assets/speech-clean.wav
```

The demo endpoint is blocking: it returns only after MuseTalk finishes creating
`output.mp4`. This is intentional for the first turn-based call prototype.

The worker also exposes the non-blocking job contract that the temporary UI now
uses:

```txt
POST /v1/lipsync/jobs
GET  /v1/lipsync/jobs/:jobId
GET  /runs/lipsync/jobs/:jobId/output.mp4
```

`POST /v1/lipsync/jobs` accepts either JSON:

```json
{
  "engine": "musetalk",
  "facePath": "models/assets/face.mp4",
  "audioPath": "models/assets/speech-clean.wav"
}
```

or `multipart/form-data` with an uploaded audio file:

```txt
engine=musetalk
facePath=models/assets/face.mp4
audio=@reply.wav
```

## Host Development Mode

During R&D, Docker rebuilds are slow. Use a host-side virtual environment on
the GPU server for fast edit/pull/run cycles, then return to Docker once the API
is stable.

First-time setup:

```sh
scripts/setup-musetalk-host.sh
```

Run a host-side benchmark:

```sh
scripts/avatar-worker-host-musetalk.sh
```

If the source avatar video is high resolution, prepare a lighter profiling
source first:

```sh
scripts/prepare-avatar-source.sh models/assets/face.mp4 models/assets/face-optimized.mp4
FACE_PATH=models/assets/face-optimized.mp4 scripts/avatar-worker-host-musetalk.sh
```

To test MuseTalk's reusable realtime avatar cache:

```sh
MUSETALK_INFERENCE_MODE=realtime \
MUSETALK_REALTIME_PREPARATION=1 \
MUSETALK_AVATAR_ID=future-self-v1 \
FACE_PATH=models/assets/face-optimized.mp4 \
scripts/avatar-worker-host-musetalk.sh

MUSETALK_INFERENCE_MODE=realtime \
MUSETALK_AVATAR_ID=future-self-v1 \
FACE_PATH=models/assets/face-optimized.mp4 \
scripts/avatar-worker-host-musetalk.sh
```

Run the HTTP worker without Docker:

```sh
scripts/avatar-worker-host-server.sh
```

The same SSH tunnel still applies:

```sh
ssh -L 8080:localhost:8080 gpu
```

## AI Reply Demo

The temporary web UI can now ask a text question, generate a short future-self
reply through Azure, synthesize that reply with ElevenLabs, upload the audio to
the GPU worker, and poll the MuseTalk job until `output.mp4` is ready.

Required local avatar-lab environment variables:

```txt
AZURE_OPENAI_API_KEY
AZURE_OPENAI_PERSONA_ENDPOINT
AZURE_OPENAI_PERSONA_DEPLOYMENT
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
```

Run locally:

```sh
npm run dev:avatar
```

Run on the GPU server:

```sh
scripts/avatar-worker-host-server.sh
```

In the web UI, keep `GPU worker URL` as `http://127.0.0.1:8080`, type a
question in `Ask Future Self`, and click `Ask and generate video`.

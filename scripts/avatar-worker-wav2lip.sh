#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-psyche-avatar-worker:wav2lip}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
FACE_PATH="${FACE_PATH:-models/assets/face.jpg}"
AUDIO_PATH="${AUDIO_PATH:-models/assets/speech.wav}"
WAV2LIP_CHECKPOINT="${WAV2LIP_CHECKPOINT:-models/wav2lip/checkpoints/Wav2Lip-SD-GAN.pt}"
OUT_DIR="${OUT_DIR:-runs/lipsync/wav2lip-test}"

cd "$ROOT_DIR"

"$DOCKER_BIN" build \
  --build-arg INSTALL_WAV2LIP_DEPS=true \
  -f docker/Dockerfile.avatar-worker \
  -t "$IMAGE_NAME" \
  .

"$DOCKER_BIN" run --rm --gpus all \
  -v "$ROOT_DIR/models:/app/models" \
  -v "$ROOT_DIR/runs:/app/runs" \
  "$IMAGE_NAME" \
  ./scripts/benchmark-lipsync.sh \
    --engine wav2lip \
    --face "$FACE_PATH" \
    --audio "$AUDIO_PATH" \
    --wav2lip-checkpoint "$WAV2LIP_CHECKPOINT" \
    --out-dir "$OUT_DIR"

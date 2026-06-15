#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-psyche-avatar-worker:musetalk}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
FACE_PATH="${FACE_PATH:-models/assets/face.mp4}"
AUDIO_PATH="${AUDIO_PATH:-models/assets/speech-clean.wav}"
OUT_DIR="${OUT_DIR:-runs/lipsync/musetalk-test}"
MUSETALK_VERSION="${MUSETALK_VERSION:-v15}"
MUSETALK_BATCH_SIZE="${MUSETALK_BATCH_SIZE:-8}"
MUSETALK_USE_FLOAT16="${MUSETALK_USE_FLOAT16:-1}"
MUSETALK_BBOX_SHIFT="${MUSETALK_BBOX_SHIFT:-0}"

cd "$ROOT_DIR"

"$DOCKER_BIN" build \
  --build-arg INSTALL_MUSETALK_DEPS=true \
  -f docker/Dockerfile.avatar-worker \
  -t "$IMAGE_NAME" \
  .

float16_arg=()
if [ "$MUSETALK_USE_FLOAT16" = "1" ]; then
  float16_arg=(--musetalk-use-float16)
fi

"$DOCKER_BIN" run --rm --gpus all \
  -v "$ROOT_DIR/models:/app/models" \
  -v "$ROOT_DIR/runs:/app/runs" \
  "$IMAGE_NAME" \
  ./scripts/benchmark-lipsync.sh \
    --engine musetalk \
    --face "$FACE_PATH" \
    --audio "$AUDIO_PATH" \
    --musetalk-version "$MUSETALK_VERSION" \
    --musetalk-batch-size "$MUSETALK_BATCH_SIZE" \
    --musetalk-bbox-shift "$MUSETALK_BBOX_SHIFT" \
    "${float16_arg[@]}" \
    --out-dir "$OUT_DIR"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MUSETALK_REPO_DIR="${MUSETALK_REPO_DIR:-$ROOT_DIR/models/musetalk/repos/MuseTalk}"
VENV_DIR="${MUSETALK_VENV_DIR:-$MUSETALK_REPO_DIR/.venv}"
FACE_PATH="${FACE_PATH:-models/assets/face.mp4}"
AUDIO_PATH="${AUDIO_PATH:-models/assets/speech-clean.wav}"
OUT_DIR="${OUT_DIR:-runs/lipsync/musetalk-host-test}"
MUSETALK_BATCH_SIZE="${MUSETALK_BATCH_SIZE:-8}"
MUSETALK_USE_FLOAT16="${MUSETALK_USE_FLOAT16:-1}"
MUSETALK_BBOX_SHIFT="${MUSETALK_BBOX_SHIFT:-0}"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "MuseTalk venv not found: $VENV_DIR" >&2
  echo "Run scripts/setup-musetalk-host.sh first." >&2
  exit 1
fi

float16_arg=()
if [ "$MUSETALK_USE_FLOAT16" = "1" ]; then
  float16_arg=(--musetalk-use-float16)
fi

cd "$ROOT_DIR"
export PYTHONPATH="$MUSETALK_REPO_DIR:${PYTHONPATH:-}"
exec "$VENV_DIR/bin/python" apps/avatar-worker/benchmark_lipsync.py \
  --engine musetalk \
  --face "$FACE_PATH" \
  --audio "$AUDIO_PATH" \
  --musetalk-batch-size "$MUSETALK_BATCH_SIZE" \
  --musetalk-bbox-shift "$MUSETALK_BBOX_SHIFT" \
  "${float16_arg[@]}" \
  --out-dir "$OUT_DIR"

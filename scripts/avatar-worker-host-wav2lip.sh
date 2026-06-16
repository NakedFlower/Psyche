#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WAV2LIP_REPO_DIR="${WAV2LIP_REPO_DIR:-$ROOT_DIR/models/wav2lip/repos/Wav2Lip}"
VENV_DIR="${WAV2LIP_VENV_DIR:-$WAV2LIP_REPO_DIR/.venv}"
FACE_PATH="${FACE_PATH:-models/assets/face-optimized.mp4}"
AUDIO_PATH="${AUDIO_PATH:-models/assets/speech-clean.wav}"
WAV2LIP_CHECKPOINT="${WAV2LIP_CHECKPOINT:-models/wav2lip/checkpoints/Wav2Lip-SD-GAN.pt}"
OUT_DIR="${OUT_DIR:-runs/lipsync/wav2lip-host-test}"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "Wav2Lip venv not found: $VENV_DIR" >&2
  echo "Run scripts/setup-wav2lip-host.sh first." >&2
  exit 1
fi

cd "$ROOT_DIR"
export PYTHONPATH="$WAV2LIP_REPO_DIR:${PYTHONPATH:-}"
exec "$VENV_DIR/bin/python" apps/avatar-worker/benchmark_lipsync.py \
  --engine wav2lip \
  --face "$FACE_PATH" \
  --audio "$AUDIO_PATH" \
  --wav2lip-checkpoint "$WAV2LIP_CHECKPOINT" \
  --out-dir "$OUT_DIR"

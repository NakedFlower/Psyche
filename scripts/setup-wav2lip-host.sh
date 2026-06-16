#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WAV2LIP_REPO_DIR="${WAV2LIP_REPO_DIR:-$ROOT_DIR/models/wav2lip/repos/Wav2Lip}"
WAV2LIP_CHECKPOINT_DIR="${WAV2LIP_CHECKPOINT_DIR:-$ROOT_DIR/models/wav2lip/checkpoints}"
WAV2LIP_REPO_URL="${WAV2LIP_REPO_URL:-https://github.com/Rudrabha/Wav2Lip.git}"
VENV_DIR="${WAV2LIP_VENV_DIR:-$WAV2LIP_REPO_DIR/.venv}"

mkdir -p "$ROOT_DIR/models/wav2lip/repos" "$WAV2LIP_CHECKPOINT_DIR"

if [ ! -d "$WAV2LIP_REPO_DIR/.git" ]; then
  git clone "$WAV2LIP_REPO_URL" "$WAV2LIP_REPO_DIR"
else
  git -C "$WAV2LIP_REPO_DIR" pull --ff-only
fi

python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

python -m pip install --no-cache-dir --upgrade pip setuptools wheel
python -m pip install --no-cache-dir \
  torch==2.3.1 torchvision==0.18.1 torchaudio==2.3.1 \
  --index-url https://download.pytorch.org/whl/cu121
python -m pip install --no-cache-dir -r "$ROOT_DIR/apps/avatar-worker/requirements-wav2lip.txt"

cat <<MSG
Wav2Lip host environment is ready:
  repo: $WAV2LIP_REPO_DIR
  venv: $VENV_DIR

Make sure a checkpoint exists at:
  $WAV2LIP_CHECKPOINT_DIR/Wav2Lip-SD-GAN.pt

Run:
  scripts/avatar-worker-host-wav2lip.sh
MSG

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WAV2LIP_REPO_DIR="${WAV2LIP_REPO_DIR:-$ROOT_DIR/models/wav2lip/repos/Wav2Lip}"
WAV2LIP_CHECKPOINT_DIR="${WAV2LIP_CHECKPOINT_DIR:-$ROOT_DIR/models/wav2lip/checkpoints}"
WAV2LIP_REPO_URL="${WAV2LIP_REPO_URL:-https://github.com/Rudrabha/Wav2Lip.git}"

mkdir -p "$ROOT_DIR/models/wav2lip/repos" "$WAV2LIP_CHECKPOINT_DIR"

if [ ! -d "$WAV2LIP_REPO_DIR/.git" ]; then
  git clone "$WAV2LIP_REPO_URL" "$WAV2LIP_REPO_DIR"
else
  git -C "$WAV2LIP_REPO_DIR" pull --ff-only
fi

cat <<MSG
Wav2Lip repo is ready:
  $WAV2LIP_REPO_DIR

Next, place a checkpoint at:
  $WAV2LIP_CHECKPOINT_DIR/wav2lip_gan.pth

The checkpoint is intentionally not committed to git because it is large.
After the checkpoint is present, run:
  sudo scripts/avatar-worker-wav2lip.sh
MSG

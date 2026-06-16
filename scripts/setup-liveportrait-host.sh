#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVEPORTRAIT_REPO_DIR="${LIVEPORTRAIT_REPO_DIR:-$ROOT_DIR/models/liveportrait/repos/LivePortrait}"
LIVEPORTRAIT_REPO_URL="${LIVEPORTRAIT_REPO_URL:-https://github.com/KwaiVGI/LivePortrait.git}"
LIVEPORTRAIT_VENV_DIR="${LIVEPORTRAIT_VENV_DIR:-$LIVEPORTRAIT_REPO_DIR/.venv}"

mkdir -p "$ROOT_DIR/models/liveportrait/repos"

if [ ! -d "$LIVEPORTRAIT_REPO_DIR/.git" ]; then
  git clone "$LIVEPORTRAIT_REPO_URL" "$LIVEPORTRAIT_REPO_DIR"
else
  git -C "$LIVEPORTRAIT_REPO_DIR" pull --ff-only
fi

python3 -m venv "$LIVEPORTRAIT_VENV_DIR"
source "$LIVEPORTRAIT_VENV_DIR/bin/activate"

python -m pip install --upgrade pip setuptools wheel
python -m pip install \
  torch==2.3.1 torchvision==0.18.1 torchaudio==2.3.1 \
  --index-url https://download.pytorch.org/whl/cu121
python -m pip install -r "$LIVEPORTRAIT_REPO_DIR/requirements.txt"
python -m pip install "huggingface_hub[cli]==0.30.2" tyro imageio imageio-ffmpeg opencv-python-headless

cat <<MSG
LivePortrait host environment is ready:
  repo: $LIVEPORTRAIT_REPO_DIR
  venv: $LIVEPORTRAIT_VENV_DIR

Next:
  1. Download LivePortrait weights into the repo as documented upstream.
  2. Set LIVEPORTRAIT_IDLE_DRIVING if you want a custom blink/idle driving clip.
  3. Re-run scripts/avatar-worker-host-server.sh
MSG

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MUSETALK_REPO_DIR="${MUSETALK_REPO_DIR:-$ROOT_DIR/models/musetalk/repos/MuseTalk}"
MUSETALK_REPO_URL="${MUSETALK_REPO_URL:-https://github.com/TMElyralab/MuseTalk.git}"

mkdir -p "$ROOT_DIR/models/musetalk/repos"

if [ ! -d "$MUSETALK_REPO_DIR/.git" ]; then
  git clone "$MUSETALK_REPO_URL" "$MUSETALK_REPO_DIR"
else
  git -C "$MUSETALK_REPO_DIR" pull --ff-only
fi

python3 -m pip install --user -U "huggingface_hub[cli]" gdown

(
  cd "$MUSETALK_REPO_DIR"
  PATH="$HOME/.local/bin:$PATH" bash ./download_weights.sh
)

cat <<MSG
MuseTalk repo and weights are ready:
  $MUSETALK_REPO_DIR

Run:
  sudo scripts/avatar-worker-musetalk.sh
MSG

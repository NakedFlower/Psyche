#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MUSETALK_REPO_DIR="${MUSETALK_REPO_DIR:-$ROOT_DIR/models/musetalk/repos/MuseTalk}"
MUSETALK_REPO_URL="${MUSETALK_REPO_URL:-https://github.com/TMElyralab/MuseTalk.git}"
VENV_DIR="${MUSETALK_VENV_DIR:-$MUSETALK_REPO_DIR/.venv}"

mkdir -p "$ROOT_DIR/models/musetalk/repos"

if [ ! -d "$MUSETALK_REPO_DIR/.git" ]; then
  git clone "$MUSETALK_REPO_URL" "$MUSETALK_REPO_DIR"
else
  git -C "$MUSETALK_REPO_DIR" pull --ff-only
fi

python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

python -m pip install --no-cache-dir "pip<25" "setuptools==59.5.0" wheel
python -m pip install --no-cache-dir \
  torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 \
  --index-url https://download.pytorch.org/whl/cu118
python -m pip install --no-cache-dir -r "$ROOT_DIR/apps/avatar-worker/requirements-musetalk.txt"
python -m pip install --no-cache-dir "numpy==1.23.5" "Cython<3"
python -m pip install --no-cache-dir --no-build-isolation --no-use-pep517 "chumpy==0.70"
python -m pip install --no-cache-dir -U openmim
mim install mmengine
mim install "mmcv==2.0.1"
mim install "mmdet==3.1.0"
mim install "mmpose==1.1.0"
python -m pip install --no-cache-dir "numpy==1.23.5" "Cython<3"
python -m pip uninstall -y xtcocotools
python -m pip install --no-cache-dir --no-build-isolation --no-binary xtcocotools "xtcocotools==1.14.3"

python -m pip install --no-cache-dir -U "huggingface_hub[cli]" gdown
(
  cd "$MUSETALK_REPO_DIR"
  PATH="$VENV_DIR/bin:$PATH" bash ./download_weights.sh
)

cat <<MSG
MuseTalk host environment is ready:
  repo: $MUSETALK_REPO_DIR
  venv: $VENV_DIR

Run the worker without Docker:
  scripts/avatar-worker-host-server.sh
MSG

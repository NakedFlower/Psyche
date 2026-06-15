#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MUSETALK_REPO_DIR="${MUSETALK_REPO_DIR:-$ROOT_DIR/models/musetalk/repos/MuseTalk}"
VENV_DIR="${MUSETALK_VENV_DIR:-$MUSETALK_REPO_DIR/.venv}"
PORT="${PORT:-8080}"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "MuseTalk venv not found: $VENV_DIR" >&2
  echo "Run scripts/setup-musetalk-host.sh first." >&2
  exit 1
fi

cd "$ROOT_DIR"
export AVATAR_WORKER_PORT="$PORT"
export PYTHONPATH="$MUSETALK_REPO_DIR:${PYTHONPATH:-}"
exec "$VENV_DIR/bin/python" apps/avatar-worker/server.py

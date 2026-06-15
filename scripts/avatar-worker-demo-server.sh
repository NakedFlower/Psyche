#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-psyche-avatar-worker:musetalk}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
PORT="${PORT:-8080}"

cd "$ROOT_DIR"

"$DOCKER_BIN" build \
  --build-arg INSTALL_MUSETALK_DEPS=true \
  -f docker/Dockerfile.avatar-worker \
  -t "$IMAGE_NAME" \
  .

"$DOCKER_BIN" run --rm --gpus all \
  -p "$PORT:8080" \
  -v "$ROOT_DIR/models:/app/models" \
  -v "$ROOT_DIR/runs:/app/runs" \
  -e AVATAR_WORKER_PORT=8080 \
  "$IMAGE_NAME" \
  python3 apps/avatar-worker/server.py

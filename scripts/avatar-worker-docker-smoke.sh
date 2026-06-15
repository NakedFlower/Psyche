#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-psyche-avatar-worker:local}"
DOCKER_BIN="${DOCKER_BIN:-docker}"

cd "$ROOT_DIR"

"$DOCKER_BIN" build \
  -f docker/Dockerfile.avatar-worker \
  -t "$IMAGE_NAME" \
  .

"$DOCKER_BIN" run --rm --gpus all \
  -v "$ROOT_DIR/models:/app/models" \
  -v "$ROOT_DIR/runs:/app/runs" \
  "$IMAGE_NAME" \
  ./scripts/benchmark-lipsync.sh --engine dry-run --generate-fixtures --out-dir runs/lipsync/docker-smoke

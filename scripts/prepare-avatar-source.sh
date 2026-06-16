#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT_PATH="${1:-models/assets/face.mp4}"
OUTPUT_PATH="${2:-models/assets/face-optimized.mp4}"
TARGET_WIDTH="${AVATAR_SOURCE_WIDTH:-540}"
TARGET_FPS="${AVATAR_SOURCE_FPS:-25}"

cd "$ROOT_DIR"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required to prepare an optimized avatar source." >&2
  exit 1
fi

if [ ! -f "$INPUT_PATH" ]; then
  echo "Input video does not exist: $INPUT_PATH" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

ffmpeg -y \
  -i "$INPUT_PATH" \
  -vf "scale=${TARGET_WIDTH}:-2:flags=lanczos,fps=${TARGET_FPS}" \
  -an \
  -c:v libx264 \
  -preset veryfast \
  -crf 20 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  "$OUTPUT_PATH"

echo "Optimized avatar source written to: $OUTPUT_PATH"

#!/usr/bin/env python3
"""Generate a subtle idle animation loop from a single face image or video."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--face", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--duration", type=float, default=4.0)
    parser.add_argument("--fps", type=int, default=24)
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    output_path = out_dir / "output.mp4"
    report_path = out_dir / "report.json"
    frame_path = out_dir / "source-frame.png"
    started = time.perf_counter()

    face_path = Path(args.face).resolve()
    if not face_path.exists():
        raise SystemExit(write_report(report_path, status="error", error=f"Face input does not exist: {face_path}"))
    if not shutil.which("ffmpeg"):
        raise SystemExit(write_report(report_path, status="error", error="ffmpeg is required"))

    extract_source_frame(face_path, frame_path)
    ffmpeg_cmd = build_ffmpeg_command(
        frame_path=frame_path,
        output_path=output_path,
        duration=args.duration,
        fps=args.fps,
    )
    result = subprocess.run(ffmpeg_cmd, cwd=ROOT, text=True, capture_output=True, check=False)
    status = "ok" if result.returncode == 0 and output_path.exists() else "error"

    return write_report(
        report_path,
        status=status,
        error="" if status == "ok" else tail_lines(result.stderr, 20) or "ffmpeg failed",
        inputs={
            "face": str(face_path),
            "frame": str(frame_path),
        },
        output=str(output_path),
        metrics={
            "durationSec": round(args.duration, 3),
            "fps": args.fps,
            "wallClockMs": round((time.perf_counter() - started) * 1000),
        },
        ffmpeg=ffmpeg_cmd,
    )


def write_report(report_path: Path, **payload) -> int:
    report_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0 if payload.get("status") == "ok" else 1


def tail_lines(value: str, count: int) -> str:
    lines = [line for line in str(value or "").splitlines() if line.strip()]
    return "\n".join(lines[-count:])


def extract_source_frame(face_path: Path, frame_path: Path) -> None:
    if face_path.suffix.lower() in IMAGE_SUFFIXES:
        if face_path != frame_path:
            frame_path.write_bytes(face_path.read_bytes())
        return

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(face_path),
            "-frames:v",
            "1",
            str(frame_path),
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )


def build_ffmpeg_command(*, frame_path: Path, output_path: Path, duration: float, fps: int) -> list[str]:
    frames = max(1, int(duration * fps))
    filter_complex = (
        f"[0:v]scale=1280:-2,zoompan="
        f"z='1.015+0.01*sin(on/18)':"
        f"x='iw/2-(iw/zoom/2)+6*sin(on/23)':"
        f"y='ih/2-(ih/zoom/2)+4*cos(on/29)':"
        f"d={frames}:s=1280x720:fps={fps},"
        "eq=brightness='0.01*sin(t*1.7)':contrast=1.02:saturation=1.03,"
        "format=yuv420p[v]"
    )
    return [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        str(frame_path),
        "-filter_complex",
        filter_complex,
        "-map",
        "[v]",
        "-t",
        str(duration),
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        str(output_path),
    ]


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Generate a simple talking-mouth video from a face image and audio track."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FPS = 24
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


@dataclass
class MouthBox:
    x: int
    y: int
    width: int
    height: int
    detection: str


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--face", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--fps", type=int, default=DEFAULT_FPS)
    parser.add_argument("--open-scale", type=float, default=0.22)
    parser.add_argument("--cycles-per-second", type=float, default=3.2)
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    output_path = out_dir / "output.mp4"
    report_path = out_dir / "report.json"
    frame_path = out_dir / "source-frame.png"

    started = time.perf_counter()
    face_path = Path(args.face).resolve()
    audio_path = Path(args.audio).resolve()

    if not face_path.exists():
        raise SystemExit(write_report(report_path, status="error", error=f"Face input does not exist: {face_path}"))
    if not audio_path.exists():
        raise SystemExit(write_report(report_path, status="error", error=f"Audio input does not exist: {audio_path}"))
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit(write_report(report_path, status="error", error="ffmpeg and ffprobe are required"))

    extract_source_frame(face_path, frame_path)
    width, height = probe_dimensions(frame_path)
    mouth_box = detect_mouth_box(frame_path, width, height)
    duration = probe_duration(audio_path)

    ffmpeg_cmd = build_ffmpeg_command(
        frame_path=frame_path,
        audio_path=audio_path,
        output_path=output_path,
        mouth_box=mouth_box,
        fps=args.fps,
        open_scale=args.open_scale,
        cycles_per_second=args.cycles_per_second,
    )
    result = subprocess.run(ffmpeg_cmd, cwd=ROOT, text=True, capture_output=True, check=False)
    status = "ok" if result.returncode == 0 and output_path.exists() else "error"

    return write_report(
        report_path,
        status=status,
        error="" if status == "ok" else tail_lines(result.stderr, 20) or "ffmpeg failed",
        inputs={
            "face": str(face_path),
            "audio": str(audio_path),
            "frame": str(frame_path),
        },
        output=str(output_path),
        metrics={
            "audioDurationSec": round(duration, 3),
            "wallClockMs": round((time.perf_counter() - started) * 1000),
            "fps": args.fps,
        },
        mouth_box={
            "x": mouth_box.x,
            "y": mouth_box.y,
            "width": mouth_box.width,
            "height": mouth_box.height,
            "detection": mouth_box.detection,
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


def probe_dimensions(path: Path) -> tuple[int, int]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "json",
            str(path),
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    payload = json.loads(result.stdout or "{}")
    stream = (payload.get("streams") or [{}])[0]
    return int(stream.get("width") or 0), int(stream.get("height") or 0)


def probe_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    payload = json.loads(result.stdout or "{}")
    return float((payload.get("format") or {}).get("duration") or 0.0)


def detect_mouth_box(frame_path: Path, width: int, height: int) -> MouthBox:
    try:
        import cv2  # type: ignore
    except Exception:
        return heuristic_mouth_box(width, height, "heuristic-no-cv2")

    image = cv2.imread(str(frame_path))
    if image is None:
        return heuristic_mouth_box(width, height, "heuristic-image-read-failed")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    classifier = cv2.CascadeClassifier(str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"))
    faces = classifier.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(max(64, width // 8), max(64, height // 8)))
    if len(faces) == 0:
        return heuristic_mouth_box(width, height, "heuristic-no-face")

    x, y, w, h = max(faces, key=lambda box: box[2] * box[3])
    mouth_w = int(w * 0.42)
    mouth_h = int(h * 0.16)
    mouth_x = int(x + (w - mouth_w) / 2)
    mouth_y = int(y + h * 0.64)
    return clamp_mouth_box(mouth_x, mouth_y, mouth_w, mouth_h, width, height, "opencv-face")


def heuristic_mouth_box(width: int, height: int, detection: str) -> MouthBox:
    mouth_w = int(width * 0.3)
    mouth_h = int(height * 0.11)
    mouth_x = int((width - mouth_w) / 2)
    mouth_y = int(height * 0.66)
    return clamp_mouth_box(mouth_x, mouth_y, mouth_w, mouth_h, width, height, detection)


def clamp_mouth_box(x: int, y: int, width: int, height: int, frame_width: int, frame_height: int, detection: str) -> MouthBox:
    width = max(32, min(width, frame_width))
    height = max(18, min(height, frame_height))
    x = max(0, min(x, frame_width - width))
    y = max(0, min(y, frame_height - height))
    return MouthBox(x=x, y=y, width=width, height=height, detection=detection)


def build_ffmpeg_command(
    *,
    frame_path: Path,
    audio_path: Path,
    output_path: Path,
    mouth_box: MouthBox,
    fps: int,
    open_scale: float,
    cycles_per_second: float,
) -> list[str]:
    scale_expr = f"ih*(1+{open_scale}*pow(abs(sin(2*PI*{cycles_per_second}*t)),1.2))"
    overlay_y = f"{mouth_box.y}-(overlay_h-{mouth_box.height})/2"
    filter_complex = (
        "[0:v]format=rgba,split=2[base][mouthsrc];"
        f"[mouthsrc]crop={mouth_box.width}:{mouth_box.height}:{mouth_box.x}:{mouth_box.y},"
        f"scale={mouth_box.width}:'{scale_expr}':eval=frame[mouth];"
        f"[base][mouth]overlay={mouth_box.x}:'{overlay_y}':eval=frame,format=yuv420p[v]"
    )
    return [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-framerate",
        str(fps),
        "-i",
        str(frame_path),
        "-i",
        str(audio_path),
        "-filter_complex",
        filter_complex,
        "-map",
        "[v]",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        str(output_path),
    ]


if __name__ == "__main__":
    raise SystemExit(main())

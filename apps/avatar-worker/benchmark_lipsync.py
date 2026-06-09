#!/usr/bin/env python3
"""Dependency-light offline lip-sync benchmark harness.

This script intentionally does not download or import Wav2Lip/MuseTalk. It
validates inputs, captures media metadata with ffprobe, records environment
context, and writes a benchmark JSON report. Engine adapters can be wired in
once model repos/checkpoints exist on the GPU machine.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import shutil
import subprocess
import sys
import time
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RUNS_DIR = ROOT / "runs" / "lipsync"


def main() -> int:
    args = parse_args()
    started = time.perf_counter()
    run_id = args.run_id or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = Path(args.out_dir or DEFAULT_RUNS_DIR / run_id).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    report: dict[str, Any] = {
        "runId": run_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "engine": args.engine,
        "status": "started",
        "inputs": {
            "face": str(Path(args.face).resolve()) if args.face else None,
            "audio": str(Path(args.audio).resolve()) if args.audio else None,
        },
        "output": {
            "dir": str(out_dir),
            "video": str((out_dir / "output.mp4").resolve()),
        },
        "environment": collect_environment(),
        "metrics": {},
        "warnings": [],
    }

    try:
        ensure_inputs(args, out_dir, report)
        report["inputs"]["faceMetadata"] = probe_media(Path(report["inputs"]["face"]), report)
        report["inputs"]["audioMetadata"] = probe_media(Path(report["inputs"]["audio"]), report)
        report["plan"] = build_engine_plan(args, out_dir)

        if args.engine == "dry-run":
            report["status"] = "ok"
            report["metrics"] = {
                "warmupMs": 0,
                "firstFrameMs": 0,
                "fps": 0,
                "gpuMemoryMb": None,
                "syncDriftMs": None,
                "wallClockMs": elapsed_ms(started),
            }
        else:
            report["status"] = "blocked"
            report["warnings"].append(
                f"{args.engine} adapter is not wired yet. Add model repo/checkpoint paths before running inference."
            )
            report["metrics"]["wallClockMs"] = elapsed_ms(started)

    except BenchmarkError as error:
        report["status"] = "error"
        report["error"] = str(error)
        report["metrics"]["wallClockMs"] = elapsed_ms(started)
    finally:
        write_report(out_dir, report)

    print(json.dumps({"status": report["status"], "report": str(out_dir / "report.json")}, indent=2))
    return 0 if report["status"] in {"ok", "blocked"} else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run an offline lip-sync benchmark scaffold.")
    parser.add_argument("--engine", choices=["dry-run", "wav2lip", "musetalk", "sadtalker"], default="dry-run")
    parser.add_argument("--face", help="Reference face image or source video path.")
    parser.add_argument("--audio", help="Speech audio path, ideally wav/pcm-derived.")
    parser.add_argument("--out-dir", help="Output directory for report and generated artifacts.")
    parser.add_argument("--run-id", help="Stable run id for reproducible output paths.")
    parser.add_argument("--generate-fixtures", action="store_true", help="Generate tiny local test face/audio assets with ffmpeg.")
    parser.add_argument("--duration", type=float, default=2.0, help="Fixture duration in seconds.")
    parser.add_argument("--fps", type=int, default=25, help="Target benchmark FPS.")
    parser.add_argument("--width", type=int, default=512, help="Target frame width.")
    parser.add_argument("--height", type=int, default=512, help="Target frame height.")
    return parser.parse_args()


def ensure_inputs(args: argparse.Namespace, out_dir: Path, report: dict[str, Any]) -> None:
    if args.generate_fixtures:
        generated = generate_fixtures(out_dir, args)
        args.face = str(generated["face"])
        args.audio = str(generated["audio"])
        report["inputs"]["face"] = str(generated["face"])
        report["inputs"]["audio"] = str(generated["audio"])

    if not args.face:
        raise BenchmarkError("Missing --face. Use --generate-fixtures for a synthetic smoke test.")
    if not args.audio:
        raise BenchmarkError("Missing --audio. Use --generate-fixtures for a synthetic smoke test.")

    face = Path(args.face)
    audio = Path(args.audio)
    if not face.exists():
        raise BenchmarkError(f"Face input does not exist: {face}")
    if not audio.exists():
        raise BenchmarkError(f"Audio input does not exist: {audio}")


def generate_fixtures(out_dir: Path, args: argparse.Namespace) -> dict[str, Path]:
    ffmpeg = shutil.which("ffmpeg")

    fixtures = out_dir / "fixtures"
    fixtures.mkdir(parents=True, exist_ok=True)
    face = fixtures / "face.png"
    audio = fixtures / "speech.wav"

    if not ffmpeg:
        face = fixtures / "face.ppm"
        write_ppm_face(face, args.width, args.height)
        write_wav_sine(audio, duration=args.duration, sample_rate=24000, frequency=220)
        return {"face": face, "audio": audio}

    run(
        [
            ffmpeg,
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=0xD8C8B8:s={args.width}x{args.height}:d=1",
            "-frames:v",
            "1",
            str(face),
        ]
    )
    run(
        [
            ffmpeg,
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=220:duration={args.duration}:sample_rate=24000",
            "-ac",
            "1",
            str(audio),
        ]
    )
    return {"face": face, "audio": audio}


def write_ppm_face(path: Path, width: int, height: int) -> None:
    header = f"P6\n{width} {height}\n255\n".encode("ascii")
    pixels = bytearray()
    cx = width / 2
    cy = height / 2
    radius = min(width, height) * 0.24
    for y in range(height):
        for x in range(width):
            dx = x - cx
            dy = y - cy
            if dx * dx + dy * dy <= radius * radius:
                pixels.extend((216, 200, 184))
            else:
                pixels.extend((24, 30, 34))
    path.write_bytes(header + bytes(pixels))


def write_wav_sine(path: Path, duration: float, sample_rate: int, frequency: int) -> None:
    total_samples = int(duration * sample_rate)
    with wave.open(str(path), "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(sample_rate)
        frames = bytearray()
        for i in range(total_samples):
            sample = int(math.sin(2 * math.pi * frequency * (i / sample_rate)) * 12000)
            frames.extend(sample.to_bytes(2, byteorder="little", signed=True))
        file.writeframes(bytes(frames))


def collect_environment() -> dict[str, Any]:
    return {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "machine": platform.machine(),
        "ffmpeg": tool_version("ffmpeg"),
        "ffprobe": tool_version("ffprobe"),
        "nvidiaSmi": tool_version("nvidia-smi"),
        "cudaVisibleDevices": os.environ.get("CUDA_VISIBLE_DEVICES"),
    }


def probe_media(path: Path, report: dict[str, Any]) -> dict[str, Any] | None:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        report["warnings"].append("ffprobe not found; media metadata was not collected.")
        return None

    result = run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ],
        check=False,
    )
    if result.returncode != 0:
        report["warnings"].append(f"ffprobe failed for {path}: {result.stderr.strip()}")
        return None
    return json.loads(result.stdout)


def build_engine_plan(args: argparse.Namespace, out_dir: Path) -> dict[str, Any]:
    output = out_dir / "output.mp4"
    if args.engine == "wav2lip":
        return {
            "adapter": "pending",
            "expectedCommand": [
                "python",
                "inference.py",
                "--checkpoint_path",
                "models/wav2lip/wav2lip_gan.pth",
                "--face",
                args.face,
                "--audio",
                args.audio,
                "--outfile",
                str(output),
            ],
        }
    if args.engine == "musetalk":
        return {
            "adapter": "pending",
            "expectedInputs": ["models/musetalk", args.face, args.audio],
            "expectedOutput": str(output),
        }
    if args.engine == "sadtalker":
        return {
            "adapter": "pending",
            "expectedInputs": ["models/sadtalker", args.face, args.audio],
            "expectedOutput": str(output),
        }
    return {
        "adapter": "dry-run",
        "expectedOutput": str(output),
    }


def write_report(out_dir: Path, report: dict[str, Any]) -> None:
    report_path = out_dir / "report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    jsonl_path = DEFAULT_RUNS_DIR / "runs.jsonl"
    jsonl_path.parent.mkdir(parents=True, exist_ok=True)
    with jsonl_path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(report, ensure_ascii=False) + "\n")


def tool_version(name: str) -> str | None:
    path = shutil.which(name)
    if not path:
        return None
    result = run([path, "-version"], check=False)
    first_line = result.stdout.splitlines()[0] if result.stdout else path
    return first_line


def run(command: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, text=True, capture_output=True, check=False)
    if check and result.returncode != 0:
        raise BenchmarkError(result.stderr.strip() or f"Command failed: {' '.join(command)}")
    return result


def elapsed_ms(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)


class BenchmarkError(Exception):
    pass


if __name__ == "__main__":
    raise SystemExit(main())

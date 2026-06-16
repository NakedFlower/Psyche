#!/usr/bin/env python3
"""Run LivePortrait with a subtle driving clip to generate an idle loop."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REPO = ROOT / "models" / "liveportrait" / "repos" / "LivePortrait"
DEFAULT_OUTPUT_DIR = ROOT / "runs" / "liveportrait"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--face", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--driving", default=os.environ.get("LIVEPORTRAIT_IDLE_DRIVING", "assets/examples/driving/d0.mp4"))
    parser.add_argument("--relative", action="store_true", help="Treat --driving as relative to the LivePortrait repo.")
    args = parser.parse_args()

    repo = Path(os.environ.get("LIVEPORTRAIT_REPO_DIR", DEFAULT_REPO)).resolve()
    python_bin = Path(
        os.environ.get("LIVEPORTRAIT_PYTHON", repo / ".venv" / "bin" / "python")
    ).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "report.json"
    output_path = out_dir / "output.mp4"
    started = time.perf_counter()

    face_path = Path(args.face).resolve()
    if not face_path.exists():
        return write_report(report_path, status="error", error=f"Face input does not exist: {face_path}")
    if not repo.exists():
        return write_report(report_path, status="error", error=f"LivePortrait repo does not exist: {repo}")
    if not python_bin.exists():
        return write_report(report_path, status="error", error=f"LivePortrait python does not exist: {python_bin}")

    driving_path = Path(args.driving)
    if args.relative or not driving_path.is_absolute():
        driving_path = (repo / driving_path).resolve()
    if not driving_path.exists():
        return write_report(report_path, status="error", error=f"Driving source does not exist: {driving_path}")

    temp_output_dir = Path(os.environ.get("LIVEPORTRAIT_OUTPUT_DIR", DEFAULT_OUTPUT_DIR)).resolve()
    temp_output_dir.mkdir(parents=True, exist_ok=True)

    command = [
        str(python_bin),
        "inference.py",
        "--source",
        str(face_path),
        "--driving",
        str(driving_path),
        "--output-dir",
        str(temp_output_dir),
    ]
    if str(os.environ.get("LIVEPORTRAIT_USE_HALF", "true")).lower() not in {"0", "false", "no"}:
        command.append("--flag-use-half-precision")
    if str(os.environ.get("LIVEPORTRAIT_FLAG_PASTE_BACK", "true")).lower() in {"0", "false", "no"}:
        command.extend(["--flag-pasteback", "False"])

    result = subprocess.run(command, cwd=repo, text=True, capture_output=True, check=False)
    generated = find_latest_video(temp_output_dir, started)
    status = "ok" if result.returncode == 0 and generated else "error"

    if generated:
        shutil.copyfile(generated, output_path)

    return write_report(
        report_path,
        status=status,
        error="" if status == "ok" else tail_lines(result.stderr, 40) or "LivePortrait inference failed",
        inputs={
            "face": str(face_path),
            "driving": str(driving_path),
        },
        output=str(output_path if generated else ""),
        generatedSource=str(generated) if generated else "",
        metrics={
            "wallClockMs": round((time.perf_counter() - started) * 1000),
        },
        command=command,
    )


def find_latest_video(directory: Path, started: float) -> Path | None:
    candidates = sorted(directory.rglob("*.mp4"), key=lambda item: item.stat().st_mtime, reverse=True)
    for candidate in candidates:
        if candidate.stat().st_mtime >= started - 5:
            return candidate
    return candidates[0] if candidates else None


def tail_lines(value: str, count: int) -> str:
    lines = [line for line in str(value or "").splitlines() if line.strip()]
    return "\n".join(lines[-count:])


def write_report(path: Path, **payload) -> int:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0 if payload.get("status") == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())

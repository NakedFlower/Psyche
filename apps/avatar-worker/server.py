#!/usr/bin/env python3
"""Tiny HTTP server for turn-based avatar-worker demos.

This server is intentionally dependency-light so it can run inside the same
Docker image used by the offline benchmark. It exposes a blocking demo endpoint
that runs MuseTalk against mounted local assets and serves generated videos.
"""

from __future__ import annotations

import json
import mimetypes
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[2]
RUNS_DIR = ROOT / "runs"
DEFAULT_FACE = "models/assets/face.mp4"
DEFAULT_AUDIO = "models/assets/speech-clean.wav"


class AvatarWorkerHandler(BaseHTTPRequestHandler):
    server_version = "PsycheAvatarWorker/0.1"

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json(
                {
                    "status": "ok",
                    "service": "psyche-avatar-worker",
                    "engines": ["musetalk", "wav2lip"],
                    "root": str(ROOT),
                }
            )
            return

        if parsed.path.startswith("/runs/"):
            self.serve_run_artifact(parsed.path)
            return

        self.send_json({"error": "not_found"}, status=404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/v1/demo/generate":
            self.generate_demo()
            return

        self.send_json({"error": "not_found"}, status=404)

    def generate_demo(self) -> None:
        body = self.read_json_body()
        engine = body.get("engine", "musetalk")
        if engine != "musetalk":
            self.send_json({"error": "Only musetalk is wired for the demo endpoint."}, status=400)
            return

        face_path = sanitize_relative_path(body.get("facePath") or DEFAULT_FACE)
        audio_path = sanitize_relative_path(body.get("audioPath") or DEFAULT_AUDIO)
        batch_size = int(body.get("batchSize") or os.environ.get("MUSETALK_BATCH_SIZE", "8"))
        bbox_shift = int(body.get("bboxShift") or os.environ.get("MUSETALK_BBOX_SHIFT", "0"))
        use_float16 = bool(body.get("useFloat16", os.environ.get("MUSETALK_USE_FLOAT16", "1") == "1"))

        job_id = body.get("jobId") or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out_dir = RUNS_DIR / "lipsync" / "demo" / safe_slug(job_id)
        out_dir.mkdir(parents=True, exist_ok=True)

        started = time.perf_counter()
        command = [
            sys.executable,
            str(ROOT / "apps" / "avatar-worker" / "benchmark_lipsync.py"),
            "--engine",
            "musetalk",
            "--face",
            face_path,
            "--audio",
            audio_path,
            "--out-dir",
            str(out_dir),
            "--musetalk-batch-size",
            str(batch_size),
            "--musetalk-bbox-shift",
            str(bbox_shift),
        ]
        if use_float16:
            command.append("--musetalk-use-float16")

        result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
        report_path = out_dir / "report.json"
        report = read_json_file(report_path)
        status = report.get("status", "error")

        payload = {
            "jobId": out_dir.name,
            "status": status,
            "engine": engine,
            "durationMs": round((time.perf_counter() - started) * 1000),
            "videoUrl": f"/runs/lipsync/demo/{out_dir.name}/output.mp4",
            "reportUrl": f"/runs/lipsync/demo/{out_dir.name}/report.json",
            "report": report,
        }
        if result.returncode != 0 and status != "ok":
            payload["stderrTail"] = "\n".join(result.stderr.splitlines()[-30:])
            self.send_json(payload, status=500)
            return

        self.send_json(payload)

    def serve_run_artifact(self, request_path: str) -> None:
        relative = unquote(request_path).lstrip("/")
        target = (ROOT / relative).resolve()
        try:
            target.relative_to(RUNS_DIR.resolve())
        except ValueError:
            self.send_json({"error": "forbidden"}, status=403)
            return

        if not target.exists() or not target.is_file():
            self.send_json({"error": "not_found"}, status=404)
            return

        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(target.stat().st_size))
        self.end_headers()
        with target.open("rb") as file:
            self.wfile.write(file.read())

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or "0")
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format: str, *args) -> None:
        print(
            json.dumps(
                {
                    "at": datetime.now(timezone.utc).isoformat(),
                    "client": self.client_address[0],
                    "message": format % args,
                },
                ensure_ascii=False,
            ),
            flush=True,
        )


def sanitize_relative_path(value: str) -> str:
    path = Path(str(value))
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Only relative mounted paths are allowed: {value}")
    return str(path)


def safe_slug(value: str) -> str:
    return "".join(char if char.isalnum() or char in "-_" else "-" for char in value)[:80]


def read_json_file(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def main() -> int:
    host = os.environ.get("AVATAR_WORKER_HOST", "0.0.0.0")
    port = int(os.environ.get("AVATAR_WORKER_PORT", "8080"))
    server = ThreadingHTTPServer((host, port), AvatarWorkerHandler)
    print(json.dumps({"service": "psyche-avatar-worker", "host": host, "port": port}), flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

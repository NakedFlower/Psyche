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
import threading
import time
import cgi
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[2]
RUNS_DIR = ROOT / "runs"
DEFAULT_FACE = "models/assets/face.mp4"
DEFAULT_AUDIO = "models/assets/speech-clean.wav"
UPLOADS_DIR = RUNS_DIR / "lipsync" / "uploads"
FACE_UPLOADS_DIR = RUNS_DIR / "lipsync" / "face-uploads"
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()


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
                    "engines": ["musetalk", "wav2lip", "mouth-puppet", "liveportrait-idle"],
                    "root": str(ROOT),
                    "jobs": len(JOBS),
                }
            )
            return

        if parsed.path.startswith("/v1/avatars/"):
            avatar_id = safe_slug(parsed.path.rsplit("/", 1)[-1])
            self.send_json(get_avatar(avatar_id) or {"error": "avatar_not_found"}, status=200 if get_avatar(avatar_id) else 404)
            return

        if parsed.path.startswith("/v1/lipsync/jobs/"):
            job_id = parsed.path.rsplit("/", 1)[-1]
            self.send_json(get_job(job_id) or {"error": "job_not_found"}, status=200 if get_job(job_id) else 404)
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
        if parsed.path == "/v1/avatars":
            self.create_avatar()
            return
        if parsed.path == "/v1/lipsync/jobs":
            self.create_job()
            return

        self.send_json({"error": "not_found"}, status=404)

    def generate_demo(self) -> None:
        job = create_lipsync_job(self.read_json_body())
        run_lipsync_job(job["jobId"])
        status = 200 if job.get("status") == "completed" else 500
        self.send_json(get_job(job["jobId"]), status=status)

    def create_job(self) -> None:
        try:
            body = self.read_request_body()
            job = create_lipsync_job(body)
        except ValueError as error:
            self.send_json({"error": str(error)}, status=400)
            return

        thread = threading.Thread(target=run_lipsync_job, args=(job["jobId"],), daemon=True)
        thread.start()
        self.send_json(job, status=202)

    def create_avatar(self) -> None:
        try:
            body = self.read_request_body()
            job = create_avatar_job(body)
        except ValueError as error:
            self.send_json({"error": str(error)}, status=400)
            return

        thread = threading.Thread(target=run_lipsync_job, args=(job["jobId"],), daemon=True)
        thread.start()
        self.send_json(job, status=202)

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

    def read_request_body(self) -> dict:
        content_type = self.headers.get("Content-Type", "")
        if content_type.startswith("multipart/form-data"):
            return self.read_multipart_body()
        return self.read_json_body()

    def read_multipart_body(self) -> dict:
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
            },
        )
        body: dict[str, object] = {}
        for key in form.keys():
            field = form[key]
            if isinstance(field, list):
                field = field[0]
            if key == "audio" and getattr(field, "filename", None):
                body["audioPath"] = save_uploaded_audio(field)
                body["uploadedAudioName"] = field.filename
            elif key == "face" and getattr(field, "filename", None):
                body["facePath"] = save_uploaded_face(field)
                body["uploadedFaceName"] = field.filename
            elif getattr(field, "value", None) is not None:
                body[key] = field.value
        return body

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


def create_lipsync_job(body: dict) -> dict:
    engine = body.get("engine", "musetalk")
    if engine not in {"musetalk", "wav2lip", "mouth-puppet", "liveportrait-idle"}:
        raise ValueError("Only musetalk, wav2lip, mouth-puppet, and liveportrait-idle are wired for the worker endpoint.")

    face_path = sanitize_relative_path(body.get("facePath") or DEFAULT_FACE)
    audio_path = None if engine == "liveportrait-idle" else sanitize_relative_path(body.get("audioPath") or DEFAULT_AUDIO)
    avatar_id = safe_slug(str(body.get("avatarId") or "")) or None
    batch_size = int(body.get("batchSize") or os.environ.get("MUSETALK_BATCH_SIZE", "8"))
    bbox_shift = int(body.get("bboxShift") or os.environ.get("MUSETALK_BBOX_SHIFT", "0"))
    use_float16 = parse_bool(body.get("useFloat16", os.environ.get("MUSETALK_USE_FLOAT16", "1") == "1"))

    job_id = body.get("jobId") or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    job_id = safe_slug(str(job_id))
    out_dir = RUNS_DIR / "lipsync" / "jobs" / job_id
    job = {
        "jobId": job_id,
        "status": "queued",
        "type": "lipsync",
        "engine": engine,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "input": {
            "facePath": face_path,
            "audioPath": audio_path,
            "avatarId": avatar_id,
            "uploadedAudioName": body.get("uploadedAudioName"),
            "uploadedFaceName": body.get("uploadedFaceName"),
            "batchSize": batch_size,
            "bboxShift": bbox_shift,
            "useFloat16": use_float16,
        },
        "outputDir": str(out_dir),
        "videoUrl": f"/runs/lipsync/jobs/{job_id}/output.mp4",
        "reportUrl": f"/runs/lipsync/jobs/{job_id}/report.json",
    }
    with JOBS_LOCK:
        JOBS[job_id] = job
    return job


def create_avatar_job(body: dict) -> dict:
    face_path = sanitize_relative_path(body.get("facePath") or DEFAULT_FACE)
    audio_path = sanitize_relative_path(body.get("audioPath") or DEFAULT_AUDIO)
    avatar_id = safe_slug(str(body.get("avatarId") or Path(face_path).stem or "psyche-avatar"))
    batch_size = int(body.get("batchSize") or os.environ.get("MUSETALK_BATCH_SIZE", "8"))
    bbox_shift = int(body.get("bboxShift") or os.environ.get("MUSETALK_BBOX_SHIFT", "0"))
    use_float16 = parse_bool(body.get("useFloat16", os.environ.get("MUSETALK_USE_FLOAT16", "1") == "1"))

    job_id = safe_slug(str(body.get("jobId") or f"avatar-{avatar_id}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"))
    out_dir = RUNS_DIR / "lipsync" / "avatar-prep" / job_id
    job = {
        "jobId": job_id,
        "status": "queued",
        "type": "avatar.prepare",
        "engine": "musetalk",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "avatarId": avatar_id,
        "input": {
            "facePath": face_path,
            "audioPath": audio_path,
            "avatarId": avatar_id,
            "batchSize": batch_size,
            "bboxShift": bbox_shift,
            "useFloat16": use_float16,
        },
        "outputDir": str(out_dir),
        "avatarUrl": f"/v1/avatars/{avatar_id}",
        "videoUrl": f"/runs/lipsync/avatar-prep/{job_id}/output.mp4",
        "reportUrl": f"/runs/lipsync/avatar-prep/{job_id}/report.json",
    }
    with JOBS_LOCK:
        JOBS[job_id] = job
    return job


def run_lipsync_job(job_id: str) -> None:
    job = get_job(job_id)
    if not job:
        return

    out_dir = Path(job["outputDir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    update_job(job_id, {"status": "running", "startedAt": datetime.now(timezone.utc).isoformat()})

    started = time.perf_counter()
    if job["engine"] == "wav2lip":
        python_bin = os.environ.get(
            "WAV2LIP_PYTHON",
            str(ROOT / "models" / "wav2lip" / "repos" / "Wav2Lip" / ".venv" / "bin" / "python"),
        )
        command = [
            python_bin,
            str(ROOT / "apps" / "avatar-worker" / "benchmark_lipsync.py"),
            "--engine",
            "wav2lip",
            "--face",
            job["input"]["facePath"],
            "--audio",
            job["input"]["audioPath"],
            "--out-dir",
            str(out_dir),
        ]
    elif job["engine"] == "mouth-puppet":
        command = [
            sys.executable,
            str(ROOT / "apps" / "avatar-worker" / "mouth_puppet.py"),
            "--face",
            job["input"]["facePath"],
            "--audio",
            job["input"]["audioPath"],
            "--out-dir",
            str(out_dir),
        ]
    elif job["engine"] == "liveportrait-idle":
        command = [
            sys.executable,
            str(ROOT / "apps" / "avatar-worker" / "liveportrait_idle.py"),
            "--face",
            job["input"]["facePath"],
            "--out-dir",
            str(out_dir),
        ]
    else:
        command = [
            sys.executable,
            str(ROOT / "apps" / "avatar-worker" / "benchmark_lipsync.py"),
            "--engine",
            "musetalk",
            "--face",
            job["input"]["facePath"],
            "--audio",
            job["input"]["audioPath"],
            "--out-dir",
            str(out_dir),
            "--musetalk-batch-size",
            str(job["input"]["batchSize"]),
            "--musetalk-bbox-shift",
            str(job["input"]["bboxShift"]),
        ]
        if job["input"].get("avatarId"):
            command.extend([
                "--musetalk-inference-mode",
                "realtime",
                "--musetalk-avatar-id",
                str(job["input"]["avatarId"]),
            ])
            if job.get("type") == "avatar.prepare":
                command.append("--musetalk-realtime-preparation")
        if job["input"]["useFloat16"]:
            command.append("--musetalk-use-float16")

    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    report = read_json_file(out_dir / "report.json")
    report_status = report.get("status", "error")
    duration_ms = round((time.perf_counter() - started) * 1000)
    status = "completed" if result.returncode == 0 and report_status == "ok" else "failed"
    patch = {
        "status": status,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "completedAt": datetime.now(timezone.utc).isoformat(),
        "durationMs": duration_ms,
        "report": report,
    }
    if status == "failed":
        patch["error"] = report.get("error") or "\n".join(result.stderr.splitlines()[-30:])
        patch["stderrTail"] = "\n".join(result.stderr.splitlines()[-30:])
    if job["input"].get("avatarId"):
        patch["avatar"] = get_avatar(str(job["input"]["avatarId"]))
    update_job(job_id, patch)


def get_job(job_id: str) -> dict | None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        return dict(job) if job else None


def update_job(job_id: str, patch: dict) -> None:
    with JOBS_LOCK:
        if job_id not in JOBS:
            return
        JOBS[job_id].update(patch)


def get_avatar(avatar_id: str) -> dict | None:
    avatar_id = safe_slug(avatar_id)
    if not avatar_id:
        return None
    repo = Path(os.environ.get("MUSETALK_REPO", ROOT / "models" / "musetalk" / "repos" / "MuseTalk"))
    version = os.environ.get("MUSETALK_VERSION", "v15")
    avatar_dir = repo / "results" / version / "avatars" / avatar_id
    if not avatar_dir.exists():
        return None
    info = read_json_file(avatar_dir / "avator_info.json")
    return {
        "avatarId": avatar_id,
        "status": "ready",
        "cacheDir": str(avatar_dir),
        "info": info,
        "hasLatents": (avatar_dir / "latents.pt").exists(),
        "hasCoords": (avatar_dir / "coords.pkl").exists(),
        "hasMasks": (avatar_dir / "mask_coords.pkl").exists(),
    }


def sanitize_relative_path(value: str) -> str:
    path = Path(str(value))
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Only relative mounted paths are allowed: {value}")
    return str(path)


def save_uploaded_audio(field) -> str:
    source_name = Path(field.filename or "reply.wav")
    suffix = source_name.suffix.lower()
    if suffix not in {".wav", ".mp3", ".m4a", ".aac"}:
        raise ValueError("Audio upload must be wav, mp3, m4a, or aac.")

    filename = f"{safe_slug(source_name.stem) or 'reply'}{suffix}"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    upload_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = UPLOADS_DIR / f"{upload_id}-{filename}"
    with target.open("wb") as file:
        while True:
            chunk = field.file.read(1024 * 1024)
            if not chunk:
                break
            file.write(chunk)
    return str(target.relative_to(ROOT))


def save_uploaded_face(field) -> str:
    source_name = Path(field.filename or "face.png")
    suffix = source_name.suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".mp4", ".mov"}:
        raise ValueError("Face upload must be png, jpg, jpeg, webp, bmp, mp4, or mov.")

    filename = f"{safe_slug(source_name.stem) or 'face'}{suffix}"
    FACE_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    upload_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = FACE_UPLOADS_DIR / f"{upload_id}-{filename}"
    with target.open("wb") as file:
        while True:
            chunk = field.file.read(1024 * 1024)
            if not chunk:
                break
            file.write(chunk)
    return str(target.relative_to(ROOT))


def parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).lower() in {"1", "true", "yes", "on"}


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

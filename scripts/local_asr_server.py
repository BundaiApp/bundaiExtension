#!/usr/bin/env python3
"""
Local ASR server for Bundai extension.

Endpoints:
- GET /health
- GET /subtitles?videoId=<YOUTUBE_ID>&model=<WHISPER_MODEL>&force=0|1

Requirements on local machine:
- yt-dlp CLI
- whisper CLI (openai-whisper)

Run:
  python3 scripts/local_asr_server.py
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlparse

HOST = os.environ.get("BUNDAI_ASR_HOST", "127.0.0.1")
PORT = int(os.environ.get("BUNDAI_ASR_PORT", "8765"))
CACHE_DIR = Path(
    os.environ.get("BUNDAI_ASR_CACHE_DIR", "/tmp/bundai-asr-cache")
)
YT_DLP_BIN = os.environ.get("BUNDAI_YTDLP_BIN", "yt-dlp")
WHISPER_BIN = os.environ.get("BUNDAI_WHISPER_BIN", "whisper")
DEFAULT_MODEL = os.environ.get("BUNDAI_ASR_MODEL", "base")

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,20}$")
MODEL_RE = re.compile(r"^[A-Za-z0-9._-]{1,40}$")
GENERATION_LOCK = Lock()


def command_exists(command: str) -> bool:
    return shutil.which(command) is not None


def run_command(command: list[str]) -> tuple[str, str]:
    process = subprocess.run(
        command,
        text=True,
        capture_output=True,
        check=False,
    )
    if process.returncode != 0:
        raise RuntimeError(
            f"Command failed ({process.returncode}): {' '.join(command)}\n"
            f"stdout:\n{process.stdout}\n"
            f"stderr:\n{process.stderr}"
        )
    return process.stdout, process.stderr


def pick_model(model: str | None) -> str:
    candidate = model or DEFAULT_MODEL
    return candidate if MODEL_RE.match(candidate) else DEFAULT_MODEL


def assert_valid_video_id(video_id: str) -> None:
    if not VIDEO_ID_RE.match(video_id):
        raise ValueError(f"Invalid videoId: {video_id}")


def download_audio(video_id: str, output_dir: Path, cookie_header: str) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(output_dir / f"{video_id}.%(ext)s")
    video_url = f"https://www.youtube.com/watch?v={video_id}"

    command = [
        YT_DLP_BIN,
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        "-f",
        "bestaudio",
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "--output",
        output_template,
        "--print",
        "after_move:filepath",
        video_url,
    ]
    if cookie_header:
        command.extend(["--add-header", f"Cookie: {cookie_header}"])

    stdout, _stderr = run_command(command)

    for line in reversed([line.strip() for line in stdout.splitlines() if line.strip()]):
        candidate = Path(line)
        if candidate.exists():
            return candidate

    audio_files = sorted(
        output_dir.glob(f"{video_id}.*"),
        key=lambda file_path: file_path.stat().st_mtime,
        reverse=True,
    )
    if audio_files:
        return audio_files[0]

    raise RuntimeError("yt-dlp completed but no audio file was found.")


def run_whisper(
    audio_path: Path, output_dir: Path, model: str, task: str, language: str = "Japanese"
) -> str:
    output_dir.mkdir(parents=True, exist_ok=True)

    command = [
        WHISPER_BIN,
        str(audio_path),
        "--model",
        model,
        "--task",
        task,
        "--language",
        language,
        "--output_format",
        "vtt",
        "--output_dir",
        str(output_dir),
        "--verbose",
        "False",
    ]
    run_command(command)

    default_output = output_dir / f"{audio_path.stem}.vtt"
    if default_output.exists():
        return default_output.read_text(encoding="utf-8", errors="ignore")

    vtt_files = sorted(output_dir.glob("*.vtt"))
    if vtt_files:
        return vtt_files[-1].read_text(encoding="utf-8", errors="ignore")

    raise RuntimeError(f"Whisper did not output VTT for task={task}.")


def generate_subtitles(
    video_id: str, model: str, cookie_header: str, force: bool
) -> dict[str, object]:
    assert_valid_video_id(video_id)

    model_name = pick_model(model)
    root_dir = CACHE_DIR / video_id / model_name
    ja_cache_path = root_dir / "ja.vtt"
    en_cache_path = root_dir / "en.vtt"

    if not force and ja_cache_path.exists() and en_cache_path.exists():
        return {
            "videoId": video_id,
            "model": model_name,
            "cached": True,
            "jaVtt": ja_cache_path.read_text(encoding="utf-8", errors="ignore"),
            "enVtt": en_cache_path.read_text(encoding="utf-8", errors="ignore"),
        }

    with GENERATION_LOCK:
        if not force and ja_cache_path.exists() and en_cache_path.exists():
            return {
                "videoId": video_id,
                "model": model_name,
                "cached": True,
                "jaVtt": ja_cache_path.read_text(encoding="utf-8", errors="ignore"),
                "enVtt": en_cache_path.read_text(encoding="utf-8", errors="ignore"),
            }

        work_dir = root_dir / "_work"
        work_dir.mkdir(parents=True, exist_ok=True)
        audio_path = download_audio(video_id, work_dir / "audio", cookie_header)

        ja_vtt = run_whisper(audio_path, work_dir / "ja", model_name, task="transcribe")
        en_vtt = run_whisper(audio_path, work_dir / "en", model_name, task="translate")

        root_dir.mkdir(parents=True, exist_ok=True)
        ja_cache_path.write_text(ja_vtt, encoding="utf-8")
        en_cache_path.write_text(en_vtt, encoding="utf-8")

        metadata = {
            "videoId": video_id,
            "model": model_name,
            "generatedAt": int(time.time()),
            "audioPath": str(audio_path),
        }
        (root_dir / "metadata.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        return {
            "videoId": video_id,
            "model": model_name,
            "cached": False,
            "jaVtt": ja_vtt,
            "enVtt": en_vtt,
        }


class ASRRequestHandler(BaseHTTPRequestHandler):
    server_version = "BundaiLocalASR/1.0"

    def _set_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Youtube-Cookies")

    def _send_json(self, payload: dict[str, object], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)

        if parsed.path == "/health":
            self._send_json(
                {
                    "ok": True,
                    "ytDlpInstalled": command_exists(YT_DLP_BIN),
                    "whisperInstalled": command_exists(WHISPER_BIN),
                    "cacheDir": str(CACHE_DIR),
                }
            )
            return

        if parsed.path == "/subtitles":
            params = parse_qs(parsed.query)
            video_id = (params.get("videoId") or [None])[0]
            model = (params.get("model") or [DEFAULT_MODEL])[0]
            force_value = (params.get("force") or ["0"])[0]
            force = str(force_value).lower() in {"1", "true", "yes"}

            if not video_id:
                self._send_json({"ok": False, "error": "Missing query param: videoId"}, 400)
                return

            if not command_exists(YT_DLP_BIN):
                self._send_json(
                    {"ok": False, "error": f"{YT_DLP_BIN} not found in PATH."}, 500
                )
                return

            if not command_exists(WHISPER_BIN):
                self._send_json(
                    {"ok": False, "error": f"{WHISPER_BIN} not found in PATH."}, 500
                )
                return

            cookie_header = self.headers.get("X-Youtube-Cookies", "")
            started = time.time()

            try:
                result = generate_subtitles(video_id, model, cookie_header, force)
                elapsed = round(time.time() - started, 2)
                self._send_json(
                    {
                        "ok": True,
                        **result,
                        "elapsedSeconds": elapsed,
                    }
                )
                return
            except Exception as error:  # pylint: disable=broad-except
                traceback.print_exc()
                self._send_json(
                    {
                        "ok": False,
                        "error": str(error),
                        "videoId": video_id,
                    },
                    500,
                )
                return

        self._send_json({"ok": False, "error": "Not found"}, 404)


def main() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), ASRRequestHandler)
    print(f"[Local ASR] Listening on http://{HOST}:{PORT}")
    print(f"[Local ASR] Cache dir: {CACHE_DIR}")
    print(f"[Local ASR] Using yt-dlp: {YT_DLP_BIN}")
    print(f"[Local ASR] Using whisper: {WHISPER_BIN}")
    server.serve_forever()


if __name__ == "__main__":
    main()

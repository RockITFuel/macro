"""OpenAI-compatible `/v1/audio/transcriptions` in front of the queue.

Macro's composer dictation (crates/dictation) speaks the OpenAI Whisper API;
pointing `DICTATION_STT_API_BASE` here routes it to our workers as live work.
"""

from __future__ import annotations

import asyncio
import hmac
import logging
import os
import time
import uuid

from aiohttp import web

from .audio import SAMPLE_RATE, decode
from .client import SttClient
from .models import Priority
from .queue import SttQueue
from .router import RouterConfig, is_alive

logger = logging.getLogger("local_stt.gateway")

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # OpenAI's limit; dictation stays far below


def build_app(queue: SttQueue, token: str, timeout_s: float = 60.0) -> web.Application:
    client = SttClient(queue)
    app = web.Application(client_max_size=MAX_UPLOAD_BYTES)

    def authorized(request: web.Request) -> bool:
        header = request.headers.get("Authorization", "")
        return bool(token) and hmac.compare_digest(header, f"Bearer {token}")

    async def transcriptions(request: web.Request) -> web.Response:
        if not authorized(request):
            return _error(401, "invalid token")
        form = await request.post()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "file"):
            return _error(400, "missing file")
        language = form.get("language")
        language = language if isinstance(language, str) and language else None
        response_format = form.get("response_format") or "json"
        data = upload.file.read()
        try:
            samples = await asyncio.to_thread(decode, data)
        except Exception:  # noqa: BLE001 - any decoder failure is a bad upload
            return _error(400, "could not decode audio")
        duration = samples.size / SAMPLE_RATE
        if duration <= 0:
            return _error(400, "empty audio")
        started = time.perf_counter()
        try:
            result = await client.transcribe(
                samples,
                scope=f"dictation:{uuid.uuid4()}",
                priority=Priority.LIVE,
                language=language,
                timeout_s=timeout_s,
            )
        except TimeoutError:
            return _error(503, "no transcription worker answered in time")
        if not result.ok:
            return _error(503, result.error or "transcription failed")
        logger.info(
            "dictation %.1fs by %s in %.2fs",
            duration,
            result.worker,
            time.perf_counter() - started,
        )
        if response_format == "text":
            return web.Response(text=result.text)
        body = {"text": result.text}
        if response_format == "verbose_json":
            body |= {
                "task": "transcribe",
                "language": result.language or language or "",
                "duration": round(duration, 3),
                "segments": [
                    {"id": i, "start": s.start, "end": s.end, "text": s.text}
                    for i, s in enumerate(result.segments)
                ],
            }
        return web.json_response(body)

    async def status(request: web.Request) -> web.Response:
        if not authorized(request):
            return _error(401, "invalid token")
        return web.json_response(await status_snapshot(queue))

    async def health(_: web.Request) -> web.Response:
        await queue.redis.ping()
        return web.json_response({"ok": True})

    app.router.add_post("/v1/audio/transcriptions", transcriptions)
    app.router.add_get("/v1/stt/status", status)
    app.router.add_get("/healthz", health)
    return app


async def status_snapshot(queue: SttQueue) -> dict:
    now = time.time()
    cfg = RouterConfig()
    workers = await queue.workers()
    return {
        "queue": await queue.queue_depth(),
        "running": len(await queue.running()),
        "workers": [
            {
                "id": w.id,
                "alive": is_alive(w, now, cfg),
                "models": w.models,
                "hardware": w.hardware,
                "rtf": w.rtf,
                "rtt_ms": round(w.rtt_s * 1000),
                "in_flight": await queue.in_flight(w.id),
                "max_concurrency": w.max_concurrency,
                "cpu_load": w.cpu_load,
                "mem_available_mb": w.mem_available_mb,
                "priorities": w.priorities,
                "tier": w.tier,
                "seen_s_ago": round(now - w.last_seen, 1),
            }
            for w in workers
        ],
    }


def _error(status: int, message: str) -> web.Response:
    return web.json_response({"error": {"message": message}}, status=status)


def token_from_env() -> str:
    token = os.environ.get("MACRO_LOCAL_STT_GATEWAY_TOKEN", "")
    if not token:
        raise RuntimeError("MACRO_LOCAL_STT_GATEWAY_TOKEN is required for the gateway")
    return token

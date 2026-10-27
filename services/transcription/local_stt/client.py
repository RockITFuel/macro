"""Submit audio and wait for the transcript."""

from __future__ import annotations

import hashlib
import os
import time

import numpy as np

from .audio import SAMPLE_RATE, float_to_pcm16
from .models import Job, JobKind, Priority, Result
from .queue import SttQueue

ENV_REDIS_URL = "MACRO_LOCAL_STT_REDIS_URL"
ENV_PREFIX = "MACRO_LOCAL_STT_PREFIX"


def redis_url_from_env() -> str | None:
    """The switch for local transcription: unset keeps today's providers."""
    return os.environ.get(ENV_REDIS_URL) or None


def queue_from_env(url: str | None = None) -> SttQueue:
    from redis.asyncio import Redis

    url = url or redis_url_from_env()
    if not url:
        raise RuntimeError(f"{ENV_REDIS_URL} is not set")
    return SttQueue(
        Redis.from_url(url, socket_keepalive=True, health_check_interval=30),
        prefix=os.environ.get(ENV_PREFIX, "stt"),
    )


def chunk_job_id(scope: str, pcm: bytes) -> str:
    """Same scope and audio -> same job: a retried submit never runs twice."""
    digest = hashlib.sha256(scope.encode() + b"\0" + pcm).hexdigest()
    return f"chunk-{digest[:32]}"


class SttClient:
    def __init__(self, queue: SttQueue):
        self.queue = queue

    async def transcribe(
        self,
        samples: np.ndarray,
        *,
        scope: str,
        priority: Priority = Priority.LIVE,
        language: str | None = None,
        timeout_s: float = 30.0,
        model: str | None = None,
        metadata: dict | None = None,
    ) -> Result:
        """Transcribe 16 kHz mono float32 audio. Raises TimeoutError when no
        result arrives in time (the job is then left to expire)."""
        pcm = float_to_pcm16(samples)
        job = Job(
            id=chunk_job_id(scope, pcm),
            kind=JobKind.CHUNK,
            priority=priority,
            created_at=time.time(),
            duration_s=round(samples.size / SAMPLE_RATE, 3),
            language=language,
            model=model,
            expires_after_s=timeout_s,
            metadata=metadata or {},
        )
        await self.queue.enqueue(job, pcm)
        result = await self.queue.wait_result(job.id, timeout_s)
        if result is None:
            raise TimeoutError(f"no transcript for {job.id} within {timeout_s}s")
        return result

    async def submit_recording(
        self,
        url: str,
        *,
        job_id: str,
        duration_s: float,
        priority: Priority = Priority.RECENT,
        language: str | None = None,
        metadata: dict | None = None,
    ) -> bool:
        job = Job(
            id=job_id,
            kind=JobKind.RECORDING,
            priority=priority,
            created_at=time.time(),
            duration_s=duration_s,
            language=language,
            source_url=url,
            metadata=metadata or {},
        )
        return await self.queue.enqueue(job)

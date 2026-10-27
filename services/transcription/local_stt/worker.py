"""Worker: heartbeats its capabilities and load, runs the jobs routed to it."""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np
from redis.exceptions import RedisError

from .audio import SAMPLE_RATE, decode, pcm16_to_float
from .engines import Engine
from .models import Job, JobKind, Result, WorkerInfo
from .queue import Assignment, SttQueue

logger = logging.getLogger("local_stt.worker")

# Upper bound for one Redis call, above the client's socket timeout (15 s).
REDIS_CALL_DEADLINE_S = 30.0


@dataclass
class WorkerConfig:
    id: str = field(default_factory=lambda: socket.gethostname())
    machine: str = field(default_factory=lambda: socket.gethostname())
    max_concurrency: int = 2
    priorities: list[str] = field(default_factory=lambda: ["live", "recent", "backlog"])
    tier: int = 0
    max_cpu_load: float = 0.9
    min_free_mem_mb: int = 2048
    heartbeat_s: float = 2.0
    # Where recordings are downloaded (not /tmp on luka-mini: it is RAM).
    download_dir: str | None = None
    # Run every transcription on one dedicated thread (MLX ties its streams
    # to the thread that created them).
    serialize_engine: bool = False


def machine_load() -> tuple[float, int]:
    """(load average per core, available memory in MB)."""
    try:
        import psutil

        load = psutil.getloadavg()[0] / (psutil.cpu_count() or 1)
        mem = int(psutil.virtual_memory().available / 1_048_576)
        return load, mem
    except ImportError:  # pragma: no cover - psutil is a worker dependency
        return os.getloadavg()[0] / (os.cpu_count() or 1), 0


class Worker:
    def __init__(self, queue: SttQueue, engine: Engine, cfg: WorkerConfig):
        self.queue = queue
        self.engine = engine
        self.cfg = cfg
        self.rtf = engine.default_rtf
        self.rtt_s: float | None = None
        self.running = 0
        self.started_at = time.time()
        self._stop = asyncio.Event()
        self._executor = ThreadPoolExecutor(
            max_workers=1 if cfg.serialize_engine else cfg.max_concurrency,
            thread_name_prefix="stt-engine",
        )

    def info(self) -> WorkerInfo:
        load, mem = machine_load()
        return WorkerInfo(
            id=self.cfg.id,
            machine=self.cfg.machine,
            models=[self.engine.family],
            hardware=self.engine.hardware,
            rtf=round(self.rtf, 4),
            rtt_s=round(self.rtt_s or 0.0, 4),
            max_concurrency=self.cfg.max_concurrency,
            priorities=self.cfg.priorities,
            tier=self.cfg.tier,
            cpu_load=round(load, 3),
            max_cpu_load=self.cfg.max_cpu_load,
            mem_available_mb=mem,
            min_free_mem_mb=self.cfg.min_free_mem_mb,
            running=self.running,
            draining=self._stop.is_set(),
            last_seen=time.time(),
            started_at=self.started_at,
        )

    async def warm_up(self) -> None:
        """Load lazy models before announcing ourselves. A failure is logged,
        not fatal: jobs that fail here are routed to other workers."""
        try:
            await self._in_engine_thread(np.zeros(SAMPLE_RATE, dtype=np.float32), None)
        except Exception:
            logger.exception("warm-up failed")

    async def _in_engine_thread(self, samples: np.ndarray, language: str | None):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._executor, self.engine.transcribe, samples, language
        )

    async def run_forever(self) -> None:
        await self.warm_up()
        recovered = await self.queue.recover(self.cfg.id)
        if recovered:
            logger.info("recovered %d jobs from a previous run", recovered)
        await self.queue.heartbeat(self.info())
        tasks = [asyncio.create_task(self._heartbeat_loop())]
        tasks += [
            asyncio.create_task(self._slot()) for _ in range(self.cfg.max_concurrency)
        ]
        try:
            await self._stop.wait()
        finally:
            # Announce draining so nothing new is routed here, let running
            # jobs finish, then drop out of the worker list.
            await self.queue.heartbeat(self.info())
            for task in tasks[1:]:
                await task
            tasks[0].cancel()
            await self.queue.remove_worker(self.cfg.id)

    def stop(self) -> None:
        self._stop.set()

    async def _heartbeat_loop(self) -> None:
        while True:
            try:
                started = time.perf_counter()
                async with asyncio.timeout(REDIS_CALL_DEADLINE_S):
                    await self.queue.heartbeat(self.info())
                self._observe_rtt(time.perf_counter() - started)
            except Exception:
                logger.exception("heartbeat failed")
            await asyncio.sleep(self.cfg.heartbeat_s)

    def _observe_rtt(self, sample_s: float) -> None:
        """Moving average of the round trip to Redis, timed on the heartbeat
        write. The router adds it to every estimate: a worker 200 ms away pays
        that on each job. Outliers (a stall, a wake from sleep) count less."""
        if self.rtt_s is None:
            self.rtt_s = sample_s
        else:
            self.rtt_s = 0.8 * self.rtt_s + 0.2 * min(sample_s, 4 * self.rtt_s + 0.05)

    async def _slot(self) -> None:
        while not self._stop.is_set():
            try:
                # Watchdog over the socket timeout: a slot must never wait
                # forever on Redis (seen once after a container was paused).
                async with asyncio.timeout(REDIS_CALL_DEADLINE_S):
                    assignment = await self.queue.take(self.cfg.id, 1.0)
            except Exception:
                logger.exception("taking a job failed")
                await asyncio.sleep(1.0)
                continue
            if assignment is not None:
                try:
                    await self.process(assignment)
                except Exception:
                    # The dispatcher requeues the job at its deadline.
                    logger.exception("job %s could not be settled", assignment.job.id)
            else:
                # BLMOVE already waited; this only matters for Redis fakes
                # that return at once, which would otherwise spin.
                await asyncio.sleep(0.05)

    async def process(self, assignment: Assignment) -> Result | None:
        """Run one job. Round trips to Redis: the BLMOVE that delivered the
        assignment (job and audio included) and the script that stores the
        result and releases it."""
        job = assignment.job
        self.running += 1
        try:
            try:
                result = await self._run(job, assignment.audio)
            except Exception as exc:
                logger.exception("job %s failed on %s", job.id, self.cfg.id)
                # Another worker may succeed (download hiccup, OOM); the queue
                # fails the job once its attempts are used up.
                await self.queue.requeue(
                    job, self.cfg.id, f"{type(exc).__name__}: {exc}"
                )
                return None
            for attempt in (1, 2):
                try:
                    async with asyncio.timeout(REDIS_CALL_DEADLINE_S):
                        await self.queue.submit_result(result, worker_id=self.cfg.id)
                    break
                except (TimeoutError, OSError, RedisError):
                    if attempt == 2:
                        raise
                    logger.warning("storing result of %s failed, retrying", job.id)
            return result
        finally:
            self.running -= 1

    async def _run(self, job: Job, audio: bytes | None) -> Result:
        samples = await self._load_audio(job, audio)
        duration = samples.size / SAMPLE_RATE
        started = time.perf_counter()
        segments = await self._in_engine_thread(samples, job.language)
        elapsed = time.perf_counter() - started
        if duration >= 1.0:
            # Exponential moving average of the measured real-time factor:
            # the router's speed estimate follows this machine's real speed.
            self.rtf = 0.8 * self.rtf + 0.2 * (elapsed / duration)
        languages = [s.language for s in segments if s.language]
        return Result(
            job_id=job.id,
            ok=True,
            text=" ".join(s.text for s in segments).strip(),
            language=max(set(languages), key=languages.count)
            if languages
            else job.language,
            segments=segments,
            worker=self.cfg.id,
            model=self.engine.name,
            duration_s=round(duration, 3),
            processing_s=round(elapsed, 3),
        )

    async def _load_audio(self, job: Job, audio: bytes | None) -> np.ndarray:
        if job.kind is JobKind.CHUNK:
            if audio is None:
                raise RuntimeError("chunk audio expired")
            return pcm16_to_float(audio)
        if not job.source_url:
            raise RuntimeError("recording job without source_url")
        return await self._download_and_decode(job.source_url)

    async def _download_and_decode(self, url: str) -> np.ndarray:
        import httpx

        os.makedirs(self.cfg.download_dir or tempfile.gettempdir(), exist_ok=True)
        fd, path = tempfile.mkstemp(suffix=".media", dir=self.cfg.download_dir)
        try:
            with os.fdopen(fd, "wb") as out:
                async with (
                    httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client,
                    client.stream("GET", url, follow_redirects=True) as response,
                ):
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes(1 << 20):
                        out.write(chunk)
            return await asyncio.to_thread(decode, path)
        finally:
            try:
                os.unlink(path)
            except FileNotFoundError:
                pass

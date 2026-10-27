"""Hands queued jobs to workers and takes them back from dead or slow ones.

Run one next to Redis (more are harmless: a leader lock lets one act).
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field

from .models import Priority
from .queue import SttQueue
from .router import RouterConfig, is_alive, route

logger = logging.getLogger("local_stt.dispatcher")


@dataclass(frozen=True)
class DispatcherConfig:
    router: RouterConfig = field(default_factory=RouterConfig)
    # Live work nobody can take fails after this long, so callers stop waiting.
    live_no_worker_grace_s: float = 10.0
    # Forget workers silent for this long (their jobs were requeued already).
    forget_worker_after_s: float = 24 * 3600
    tick_s: float = 0.5


class Dispatcher:
    def __init__(self, queue: SttQueue, cfg: DispatcherConfig | None = None):
        self.queue = queue
        self.cfg = cfg or DispatcherConfig()
        self.owner = uuid.uuid4().hex

    async def run_forever(self) -> None:
        while True:
            try:
                if await self.queue.acquire_leader(self.owner):
                    await self.tick()
            except Exception:
                logger.exception("dispatcher tick failed")
            await self.queue.wait_wake(self.cfg.tick_s)

    async def tick(self, now: float | None = None) -> dict[str, int]:
        now = time.time() if now is None else now
        workers = await self.queue.workers()
        reaped = await self.reap(workers, now)
        assigned = await self.assign(workers, now)
        await self.forget_stale_workers(workers, now)
        return {"reaped": reaped, "assigned": assigned}

    async def reap(self, workers, now: float) -> int:
        """Requeue jobs whose worker died or missed the deadline."""
        alive = {w.id for w in workers if is_alive(w, now, self.cfg.router)}
        reaped = 0
        for job_id, deadline in await self.queue.running():
            state = await self.queue.job_state(job_id)
            worker_id = state.get("worker") or None
            if worker_id in alive and now <= deadline:
                continue
            if await self.queue.get_result(job_id) is not None:
                await self.queue.redis.zrem(self.queue.key("running"), job_id)
                continue
            job = await self.queue.get_job(job_id)
            if job is None:
                await self.queue.redis.zrem(self.queue.key("running"), job_id)
                continue
            reason = "deadline" if worker_id in alive else "worker_offline"
            logger.warning(
                "requeue job=%s worker=%s reason=%s", job_id, worker_id, reason
            )
            await self.queue.requeue(job, worker_id, reason)
            reaped += 1
        return reaped

    async def assign(self, workers, now: float) -> int:
        in_flight = {w.id: await self.queue.in_flight(w.id) for w in workers}
        assigned = 0
        for job_id in await self.queue.queued():
            job = await self.queue.get_job(job_id)
            if job is None:
                await self.queue.redis.zrem(self.queue.key("queue"), job_id)
                continue
            decision = route(job, workers, in_flight, now, self.cfg.router)
            if decision.worker_id is not None:
                await self.queue.assign(
                    job, decision.worker_id, now + decision.timeout_s
                )
                in_flight[decision.worker_id] = in_flight.get(decision.worker_id, 0) + 1
                assigned += 1
                logger.info(
                    "assign job=%s priority=%s kind=%s dur=%.1fs -> %s (eta %.2fs, order %s)",
                    job.id,
                    job.priority.value,
                    job.kind.value,
                    job.duration_s,
                    decision.worker_id,
                    decision.eta_s,
                    decision.ranked,
                )
            elif decision.reason == "expired":
                await self.queue.fail(job, "expired before a worker was free")
            elif (
                decision.reason == "no_capable_worker"
                and job.priority is Priority.LIVE
                and now - job.created_at > self.cfg.live_no_worker_grace_s
            ):
                await self.queue.fail(job, "no worker available")
            # Anything else waits: recent and backlog work stays queued until
            # a worker comes back (the MacBook may wake up).
        return assigned

    async def forget_stale_workers(self, workers, now: float) -> None:
        for worker in workers:
            if now - worker.last_seen > self.cfg.forget_worker_after_s:
                await self.queue.remove_worker(worker.id)

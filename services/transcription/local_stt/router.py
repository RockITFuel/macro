"""Pick the worker for a job. Pure functions: no Redis, no clock.

Rules, in order:

1. Alive: the worker's heartbeat is younger than `heartbeat_ttl_s` and it is
   not draining. A sleeping MacBook drops out here.
2. Capable: it serves the model family the job asks for and accepts the job's
   priority (Warsaw is configured for live work only).
3. Not excluded: it has not already timed out or failed on this job (unless
   no other worker could take it).
4. Has room: in-flight jobs below `max_concurrency`; recordings may not take
   the slots reserved for live work.
5. Not overloaded: machine load at or below its `max_cpu_load` and enough
   free memory.

Among the rest the lowest estimated finish time wins: audio length times the
worker's measured real-time factor, stretched by its in-flight jobs and CPU
load, plus a penalty per fallback tier. Ties go to the lower tier, then the
worker id, so the order is deterministic.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .models import Job, JobKind, Priority, WorkerInfo


@dataclass(frozen=True)
class RouterConfig:
    heartbeat_ttl_s: float = 15.0
    # Fixed cost per job: queue round trips, audio transfer, decoding.
    overhead_s: float = 0.3
    # Added per fallback tier, so a tier-2 worker only wins when the others
    # are unavailable or far slower.
    tier_penalty_s: float = 2.0
    # Slots per worker that recordings may not use (live work only).
    live_reserved_slots: int = 1
    # Job timeout: max(min, factor * estimated processing time).
    min_timeout_chunk_s: float = 20.0
    min_timeout_recording_s: float = 120.0
    timeout_factor: float = 4.0


@dataclass
class Decision:
    worker_id: str | None
    reason: str
    # Eligible workers, best first: the fallback order for this job.
    ranked: list[str] = field(default_factory=list)
    timeout_s: float = 0.0
    eta_s: float = 0.0


def is_alive(worker: WorkerInfo, now: float, cfg: RouterConfig) -> bool:
    return not worker.draining and now - worker.last_seen <= cfg.heartbeat_ttl_s


def capable(job: Job, worker: WorkerInfo) -> bool:
    if job.model is not None and job.model not in worker.models:
        return False
    return job.priority.value in worker.priorities


def slot_limit(job: Job, worker: WorkerInfo, cfg: RouterConfig) -> int:
    if job.priority is Priority.LIVE:
        return worker.max_concurrency
    return max(1, worker.max_concurrency - cfg.live_reserved_slots)


def ineligible_reason(
    job: Job,
    worker: WorkerInfo,
    in_flight: int,
    now: float,
    cfg: RouterConfig,
    *,
    honour_exclusions: bool = True,
) -> str | None:
    if not is_alive(worker, now, cfg):
        return "offline"
    if not capable(job, worker):
        return "incapable"
    if honour_exclusions and worker.id in job.excluded_workers:
        return "excluded"
    if in_flight >= slot_limit(job, worker, cfg):
        return "busy"
    if worker.cpu_load > worker.max_cpu_load:
        return "overloaded"
    if worker.mem_available_mb and worker.mem_available_mb < worker.min_free_mem_mb:
        return "low_memory"
    return None


def processing_estimate_s(job: Job, worker: WorkerInfo, in_flight: int) -> float:
    """Seconds the worker needs for this job alone, given its current load."""
    base = max(job.duration_s, 0.5) * max(worker.rtf, 0.001)
    contention = 1.0 + in_flight / max(worker.max_concurrency, 1)
    load = 1.0 + max(0.0, worker.cpu_load - 0.5)
    return base * contention * load


def eta_s(job: Job, worker: WorkerInfo, in_flight: int, cfg: RouterConfig) -> float:
    return (
        cfg.overhead_s
        + processing_estimate_s(job, worker, in_flight)
        + worker.tier * cfg.tier_penalty_s
    )


def timeout_s(job: Job, worker: WorkerInfo, cfg: RouterConfig) -> float:
    minimum = (
        cfg.min_timeout_recording_s
        if job.kind is JobKind.RECORDING
        else cfg.min_timeout_chunk_s
    )
    return max(minimum, cfg.timeout_factor * processing_estimate_s(job, worker, 0))


def route(
    job: Job,
    workers: list[WorkerInfo],
    in_flight: dict[str, int],
    now: float,
    cfg: RouterConfig | None = None,
) -> Decision:
    cfg = cfg or RouterConfig()
    if job.expired(now):
        return Decision(None, "expired")
    decision = _route(job, workers, in_flight, now, cfg, honour_exclusions=True)
    if decision.reason == "no_capable_worker" and job.excluded_workers:
        # Every worker that could take it already failed once: try them again
        # rather than wait forever (attempts are capped by the queue).
        decision = _route(job, workers, in_flight, now, cfg, honour_exclusions=False)
    return decision


def _route(
    job: Job,
    workers: list[WorkerInfo],
    in_flight: dict[str, int],
    now: float,
    cfg: RouterConfig,
    *,
    honour_exclusions: bool,
) -> Decision:
    scored: list[tuple[float, int, str, WorkerInfo]] = []
    reasons: set[str] = set()
    for worker in workers:
        load = in_flight.get(worker.id, 0)
        reason = ineligible_reason(
            job, worker, load, now, cfg, honour_exclusions=honour_exclusions
        )
        if reason is not None:
            reasons.add(reason)
            continue
        scored.append((eta_s(job, worker, load, cfg), worker.tier, worker.id, worker))

    if not scored:
        # "busy" or "overloaded" means it is worth waiting; anything else means
        # no alive worker can take the job at all right now.
        waitable = reasons & {"busy", "overloaded", "low_memory"}
        return Decision(None, "busy" if waitable else "no_capable_worker")

    scored.sort(key=lambda item: (item[0], item[1], item[2]))
    best_eta, _, best_id, best = scored[0]
    return Decision(
        worker_id=best_id,
        reason="assigned",
        ranked=[item[2] for item in scored],
        timeout_s=timeout_s(job, best, cfg),
        eta_s=best_eta,
    )

"""Durable job queue on Redis (run it with AOF so jobs survive a restart).

Keys, all under one prefix (default `stt`):

- `job:{id}`          hash: `json` (the Job), `state`, `worker`, `deadline`
- `audio:{id}`        PCM16LE mono 16 kHz of a chunk job (expires)
- `queue`             zset of waiting job ids, scored by priority then age
- `running`           zset of assigned job ids, scored by their deadline
- `inbox:{worker}`    list of job ids assigned to a worker
- `processing:{worker}` list of job ids the worker has taken (BLMOVE from inbox)
- `workers`           hash worker id -> WorkerInfo JSON (the heartbeat)
- `result:{id}`       Result JSON; the first result written wins
- `done:{id}`         list a waiter blocks on
- `wake`              list that wakes the dispatcher
- `dead`              list of job ids that failed for good
- `dispatcher`        leader lock
"""

from __future__ import annotations

import time

from redis.asyncio import Redis

from .models import Job, Priority, Result, WorkerInfo

JOB_TTL_S = 7 * 24 * 3600


def queue_score(job: Job) -> float:
    return job.priority.rank * 1e13 + job.created_at * 1000


class SttQueue:
    def __init__(
        self,
        redis: Redis,
        *,
        prefix: str = "stt",
        result_ttl_s: int = 24 * 3600,
        audio_ttl_s: int = 3600,
    ):
        self.redis = redis
        self.prefix = prefix
        self.result_ttl_s = result_ttl_s
        self.audio_ttl_s = audio_ttl_s

    def key(self, *parts: str) -> str:
        return ":".join((self.prefix, *parts))

    # -- producers -----------------------------------------------------------

    async def enqueue(self, job: Job, audio: bytes | None = None) -> bool:
        """Queue a job. Returns False when a job with this id already exists:
        callers derive ids from the content, so a retry never runs twice."""
        job_key = self.key("job", job.id)
        if not await self.redis.hsetnx(job_key, "json", job.to_json()):
            return False
        pipe = self.redis.pipeline(transaction=True)
        pipe.hset(job_key, mapping={"state": "queued"})
        pipe.expire(job_key, JOB_TTL_S)
        if audio is not None:
            pipe.set(self.key("audio", job.id), audio, ex=self.audio_ttl_s)
        pipe.zadd(self.key("queue"), {job.id: queue_score(job)})
        pipe.lpush(self.key("wake"), "1")
        await pipe.execute()
        return True

    async def get_result(self, job_id: str) -> Result | None:
        raw = await self.redis.get(self.key("result", job_id))
        return Result.from_json(raw) if raw else None

    async def wait_result(self, job_id: str, timeout_s: float) -> Result | None:
        deadline = time.monotonic() + timeout_s
        while True:
            result = await self.get_result(job_id)
            if result is not None:
                return result
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            # BLPOP takes whole or fractional seconds; cap so a lost
            # notification only costs one short wait.
            await self.redis.blpop(
                [self.key("done", job_id)], timeout=min(remaining, 1.0)
            )

    # -- shared --------------------------------------------------------------

    async def get_job(self, job_id: str) -> Job | None:
        raw = await self.redis.hget(self.key("job", job_id), "json")
        return Job.from_json(raw) if raw else None

    async def job_state(self, job_id: str) -> dict[str, str]:
        raw = await self.redis.hgetall(self.key("job", job_id))
        return {_s(k): _s(v) for k, v in raw.items() if _s(k) != "json"}

    async def get_audio(self, job_id: str) -> bytes | None:
        return await self.redis.get(self.key("audio", job_id))

    async def submit_result(self, result: Result) -> bool:
        """Store a result. Only the first one counts: a worker that wakes up
        after its job was handed to another one cannot overwrite it."""
        stored = await self.redis.set(
            self.key("result", result.job_id),
            result.to_json(),
            nx=True,
            ex=self.result_ttl_s,
        )
        pipe = self.redis.pipeline(transaction=True)
        if stored:
            pipe.hset(
                self.key("job", result.job_id),
                mapping={"state": "done" if result.ok else "failed"},
            )
            if not result.ok:
                pipe.lpush(self.key("dead"), result.job_id)
                pipe.ltrim(self.key("dead"), 0, 999)
            pipe.delete(self.key("audio", result.job_id))
        pipe.zrem(self.key("running"), result.job_id)
        pipe.zrem(self.key("queue"), result.job_id)
        pipe.lpush(self.key("done", result.job_id), "1")
        pipe.expire(self.key("done", result.job_id), 60)
        pipe.lpush(self.key("wake"), "1")
        await pipe.execute()
        return bool(stored)

    # -- dispatcher ----------------------------------------------------------

    async def acquire_leader(self, owner: str, ttl_ms: int = 5000) -> bool:
        lock = self.key("dispatcher")
        if await self.redis.set(lock, owner, nx=True, px=ttl_ms):
            return True
        if _s(await self.redis.get(lock)) == owner:
            await self.redis.pexpire(lock, ttl_ms)
            return True
        return False

    async def wait_wake(self, timeout_s: float) -> None:
        await self.redis.blpop([self.key("wake")], timeout=timeout_s)
        await self.redis.delete(self.key("wake"))

    async def queued(self, limit: int = 200) -> list[str]:
        return [_s(v) for v in await self.redis.zrange(self.key("queue"), 0, limit - 1)]

    async def queue_depth(self) -> dict[str, int]:
        depth = {}
        for priority in Priority:
            low = priority.rank * 1e13
            depth[priority.value] = await self.redis.zcount(
                self.key("queue"), low, low + 1e13 - 1
            )
        return depth

    async def running(self) -> list[tuple[str, float]]:
        return [
            (_s(member), float(score))
            for member, score in await self.redis.zrange(
                self.key("running"), 0, -1, withscores=True
            )
        ]

    async def workers(self) -> list[WorkerInfo]:
        raw = await self.redis.hgetall(self.key("workers"))
        return [WorkerInfo.from_json(v) for v in raw.values()]

    async def remove_worker(self, worker_id: str) -> None:
        await self.redis.hdel(self.key("workers"), worker_id)

    async def in_flight(self, worker_id: str) -> int:
        pipe = self.redis.pipeline(transaction=False)
        pipe.llen(self.key("inbox", worker_id))
        pipe.llen(self.key("processing", worker_id))
        inbox, processing = await pipe.execute()
        return int(inbox) + int(processing)

    async def assign(self, job: Job, worker_id: str, deadline: float) -> None:
        # One transaction, so a dispatcher crash cannot lose the job between
        # the queue and the inbox. A job that finished meanwhile still lands
        # in the inbox; the worker skips it because its result exists.
        pipe = self.redis.pipeline(transaction=True)
        pipe.zrem(self.key("queue"), job.id)
        pipe.hset(
            self.key("job", job.id),
            mapping={
                "state": "assigned",
                "worker": worker_id,
                "deadline": str(deadline),
                "assigned_at": str(time.time()),
            },
        )
        pipe.zadd(self.key("running"), {job.id: deadline})
        pipe.rpush(self.key("inbox", worker_id), job.id)
        await pipe.execute()

    async def requeue(self, job: Job, worker_id: str | None, reason: str) -> bool:
        """Take a job back from a worker. Returns False when the job ran out of
        attempts and was failed instead."""
        if worker_id is not None:
            pipe = self.redis.pipeline(transaction=True)
            pipe.lrem(self.key("inbox", worker_id), 0, job.id)
            pipe.lrem(self.key("processing", worker_id), 0, job.id)
            await pipe.execute()
            if worker_id not in job.excluded_workers:
                job.excluded_workers.append(worker_id)
        job.attempts += 1
        if job.attempts >= job.max_attempts:
            await self.submit_result(
                Result(
                    job_id=job.id,
                    ok=False,
                    error=f"gave up after {job.attempts} attempts: {reason}",
                )
            )
            return False
        pipe = self.redis.pipeline(transaction=True)
        pipe.hset(
            self.key("job", job.id),
            mapping={"json": job.to_json(), "state": "queued", "worker": ""},
        )
        pipe.zrem(self.key("running"), job.id)
        pipe.zadd(self.key("queue"), {job.id: queue_score(job)})
        await pipe.execute()
        return True

    async def fail(self, job: Job, error: str) -> None:
        await self.submit_result(Result(job_id=job.id, ok=False, error=error))

    # -- workers -------------------------------------------------------------

    async def heartbeat(self, info: WorkerInfo) -> None:
        await self.redis.hset(self.key("workers"), info.id, info.to_json())

    async def take(self, worker_id: str, timeout_s: float) -> str | None:
        job_id = await self.redis.blmove(
            self.key("inbox", worker_id),
            self.key("processing", worker_id),
            timeout_s,
            "LEFT",
            "RIGHT",
        )
        return _s(job_id) if job_id else None

    async def release(self, worker_id: str, job_id: str) -> None:
        await self.redis.lrem(self.key("processing", worker_id), 0, job_id)

    async def recover(self, worker_id: str) -> int:
        """Put jobs a crashed worker had taken back at the front of its inbox."""
        moved = 0
        while await self.redis.lmove(
            self.key("processing", worker_id),
            self.key("inbox", worker_id),
            "RIGHT",
            "LEFT",
        ):
            moved += 1
        return moved


def _s(value: bytes | str | None) -> str:
    if value is None:
        return ""
    return value.decode() if isinstance(value, bytes) else value

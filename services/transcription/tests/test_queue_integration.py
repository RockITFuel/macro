"""Queue + dispatcher + workers end to end, with fake engines.

Uses fakeredis by default; set LOCAL_STT_TEST_REDIS_URL to run against a
real Redis (the test flushes the `stt-test` prefix only).
"""

import asyncio
import os
import time
import unittest
import uuid

import numpy as np

from local_stt.client import SttClient
from local_stt.dispatcher import Dispatcher, DispatcherConfig
from local_stt.engines import FakeEngine
from local_stt.models import Job, JobKind, Priority
from local_stt.queue import SttQueue
from local_stt.router import RouterConfig
from local_stt.worker import Worker, WorkerConfig

SECOND = np.zeros(16_000, dtype=np.float32)


async def make_queue() -> SttQueue:
    url = os.environ.get("LOCAL_STT_TEST_REDIS_URL")
    if url:
        from redis.asyncio import Redis

        redis = Redis.from_url(url)
    else:
        import fakeredis

        redis = fakeredis.FakeAsyncRedis()
    return SttQueue(redis, prefix=f"stt-test-{uuid.uuid4().hex[:8]}")


class Harness:
    def __init__(self, queue: SttQueue):
        self.queue = queue
        self.dispatcher = Dispatcher(
            queue,
            DispatcherConfig(router=RouterConfig(heartbeat_ttl_s=1.0), tick_s=0.05),
        )
        self.tasks: list[asyncio.Task] = []
        self.workers: dict[str, Worker] = {}

    def add_worker(self, id: str, engine: FakeEngine, **cfg) -> Worker:
        # The test host's own load must not make the fake workers refuse work.
        cfg.setdefault("max_cpu_load", 1000.0)
        cfg.setdefault("min_free_mem_mb", 0)
        worker = Worker(
            self.queue, engine, WorkerConfig(id=id, machine=id, heartbeat_s=0.1, **cfg)
        )
        self.workers[id] = worker
        self.tasks.append(asyncio.create_task(worker.run_forever()))
        return worker

    def start_dispatcher(self) -> None:
        self.tasks.append(asyncio.create_task(self.dispatcher.run_forever()))

    async def close(self) -> None:
        for worker in self.workers.values():
            worker.stop()
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)


class QueueIntegrationTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.queue = await make_queue()
        self.harness = Harness(self.queue)

    async def asyncTearDown(self):
        await self.harness.close()

    async def test_live_chunk_round_trip(self):
        self.harness.add_worker("mini", FakeEngine("goedemorgen allemaal"))
        self.harness.start_dispatcher()
        result = await SttClient(self.queue).transcribe(
            SECOND, scope="call:a", language="nl", timeout_s=5
        )
        self.assertTrue(result.ok)
        self.assertEqual(result.text, "goedemorgen allemaal")
        self.assertEqual(result.worker, "mini")
        self.assertEqual(result.language, "nl")
        self.assertAlmostEqual(result.duration_s, 1.0)

    async def test_same_audio_and_scope_runs_once(self):
        engine = FakeEngine("een keer")
        self.harness.add_worker("mini", engine)
        self.harness.start_dispatcher()
        client = SttClient(self.queue)
        first, second = await asyncio.gather(
            client.transcribe(SECOND, scope="call:a:0.0", timeout_s=5),
            client.transcribe(SECOND, scope="call:a:0.0", timeout_s=5),
        )
        self.assertEqual(first, second)
        self.assertEqual(engine.calls, 2)  # warm-up + one job

    async def test_live_work_overtakes_backlog(self):
        await self.queue.enqueue(
            Job(
                id="old",
                kind=JobKind.CHUNK,
                priority=Priority.BACKLOG,
                created_at=time.time() - 60,
                duration_s=1.0,
            ),
            b"\0\0" * 16_000,
        )
        await self.queue.enqueue(
            Job(
                id="new",
                kind=JobKind.CHUNK,
                priority=Priority.LIVE,
                created_at=time.time(),
                duration_s=1.0,
            ),
            b"\0\0" * 16_000,
        )
        self.assertEqual(await self.queue.queued(), ["new", "old"])

    async def test_sleeping_worker_jobs_move_to_the_next_worker(self):
        from local_stt.models import WorkerInfo

        # "mac" is the fastest worker and gets the job, then its heartbeats
        # stop (lid closed) before it answers.
        await self.queue.heartbeat(
            WorkerInfo(
                id="mac",
                machine="mac",
                models=["parakeet"],
                hardware="mlx",
                rtf=0.001,
                max_concurrency=1,
                priorities=["live"],
                last_seen=time.time(),
            )
        )
        self.harness.add_worker("mini", FakeEngine("op tijd"))
        await asyncio.sleep(0.2)
        pending = asyncio.create_task(
            SttClient(self.queue).transcribe(SECOND, scope="x", timeout_s=10)
        )
        await asyncio.sleep(0.1)
        await self.harness.dispatcher.tick()
        self.assertEqual((await self._only_job_state())["worker"], "mac")

        self.harness.start_dispatcher()
        result = await pending
        self.assertEqual(result.text, "op tijd")
        self.assertEqual(result.worker, "mini")

    async def test_failing_worker_retries_elsewhere_then_gives_up(self):
        self.harness.add_worker("broken", FakeEngine("!fail"))
        self.harness.start_dispatcher()
        result = await SttClient(self.queue).transcribe(SECOND, scope="y", timeout_s=5)
        self.assertFalse(result.ok)
        self.assertIn("gave up after 3 attempts", result.error)

        self.harness.add_worker("good", FakeEngine("gelukt"))
        await asyncio.sleep(0.2)
        result = await SttClient(self.queue).transcribe(SECOND, scope="z", timeout_s=5)
        self.assertTrue(result.ok)
        self.assertEqual(result.worker, "good")

    async def test_live_job_without_any_worker_fails_fast(self):
        self.harness.dispatcher.cfg = DispatcherConfig(
            live_no_worker_grace_s=0.2, tick_s=0.05
        )
        self.harness.start_dispatcher()
        result = await SttClient(self.queue).transcribe(SECOND, scope="w", timeout_s=5)
        self.assertFalse(result.ok)
        self.assertEqual(result.error, "no worker available")

    async def test_late_result_does_not_overwrite_the_first(self):
        from local_stt.models import Result

        self.assertTrue(
            await self.queue.submit_result(Result(job_id="j", ok=True, text="eerste"))
        )
        self.assertFalse(
            await self.queue.submit_result(Result(job_id="j", ok=True, text="tweede"))
        )
        self.assertEqual((await self.queue.get_result("j")).text, "eerste")

    async def test_recording_waits_for_a_worker(self):
        await SttClient(self.queue).submit_recording(
            "http://example.invalid/rec.mp4", job_id="rec-1", duration_s=600
        )
        stats = await self.harness.dispatcher.tick()
        self.assertEqual(stats["assigned"], 0)
        self.assertEqual(await self.queue.queued(), ["rec-1"])
        self.assertEqual((await self.queue.job_state("rec-1"))["state"], "queued")

    async def test_a_job_costs_the_worker_two_round_trips(self):
        """Taking the assignment and settling the result; nothing else."""
        commands: list[str] = []
        worker_queue = SttQueue(
            _Counting(self.queue.redis, commands), prefix=self.queue.prefix
        )
        worker = Worker(
            worker_queue,
            FakeEngine("twee keer"),
            WorkerConfig(id="w", machine="w", max_cpu_load=1000.0, min_free_mem_mb=0),
        )
        await self.queue.heartbeat(worker.info())
        client = SttClient(self.queue)
        for scope in ("warm", "measured"):  # the first run loads the script
            pending = asyncio.create_task(
                client.transcribe(SECOND, scope=scope, timeout_s=5)
            )
            await asyncio.sleep(0.05)
            await self.harness.dispatcher.tick()
            commands.clear()
            assignment = await worker_queue.take("w", 1.0)
            await worker.process(assignment)
            result = await pending
            self.assertEqual(result.text, "twee keer")
        self.assertEqual(commands, ["BLMOVE", "EVALSHA"])
        self.assertEqual(await self.queue.in_flight("w"), 0)

    async def _only_job_state(self):
        running = await self.queue.running()
        self.assertEqual(len(running), 1)
        return await self.queue.job_state(running[0][0])


if __name__ == "__main__":
    unittest.main()


class _Counting:
    """Redis proxy that records the commands a caller sends."""

    def __init__(self, redis, log: list[str]):
        self._redis = redis
        self._log = log

    def __getattr__(self, name):
        return getattr(self._redis, name)

    def register_script(self, script):
        return self._redis.register_script(script).__class__(self, script)

    async def evalsha(self, *args, **kwargs):
        self._log.append("EVALSHA")
        return await self._redis.evalsha(*args, **kwargs)

    async def script_load(self, *args, **kwargs):
        self._log.append("SCRIPT LOAD")
        return await self._redis.script_load(*args, **kwargs)

    async def blmove(self, *args, **kwargs):
        self._log.append("BLMOVE")
        return await self._redis.blmove(*args, **kwargs)

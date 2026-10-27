import unittest

from local_stt.models import Job, JobKind, Priority, WorkerInfo
from local_stt.router import RouterConfig, route, timeout_s

NOW = 1_000_000.0
CFG = RouterConfig()


def worker(id, **overrides) -> WorkerInfo:
    base = {
        "id": id,
        "machine": id,
        "models": ["parakeet"],
        "hardware": "cpu",
        "rtf": 0.03,
        "max_concurrency": 2,
        "priorities": ["live", "recent", "backlog"],
        "tier": 0,
        "cpu_load": 0.2,
        "max_cpu_load": 0.9,
        "mem_available_mb": 30_000,
        "min_free_mem_mb": 2048,
        "last_seen": NOW - 1,
    }
    base.update(overrides)
    return WorkerInfo(**base)


def job(priority=Priority.LIVE, kind=JobKind.CHUNK, duration=4.0, **overrides) -> Job:
    base = {
        "id": "j1",
        "kind": kind,
        "priority": priority,
        "created_at": NOW - 0.5,
        "duration_s": duration,
    }
    base.update(overrides)
    return Job(**base)


MAC = {"hardware": "mlx", "rtf": 0.012, "max_concurrency": 1}
WARSAW = {
    "rtf": 0.06,
    "tier": 2,
    "priorities": ["live"],
    "max_cpu_load": 0.5,
    "max_concurrency": 1,
}


class RouteTest(unittest.TestCase):
    def test_prefers_fastest_worker_for_a_long_recording(self):
        workers = [worker("mini"), worker("mac", **MAC)]
        decision = route(
            job(Priority.RECENT, JobKind.RECORDING, 3600), workers, {}, NOW, CFG
        )
        self.assertEqual(decision.worker_id, "mac")
        self.assertEqual(decision.ranked, ["mac", "mini"])

    def test_sleeping_macbook_is_skipped(self):
        workers = [worker("mini"), worker("mac", last_seen=NOW - 60, **MAC)]
        decision = route(job(), workers, {}, NOW, CFG)
        self.assertEqual(decision.worker_id, "mini")
        self.assertEqual(decision.ranked, ["mini"])

    def test_warsaw_is_last_resort_for_live_work(self):
        workers = [worker("mini"), worker("warsaw", **WARSAW)]
        self.assertEqual(route(job(), workers, {}, NOW, CFG).ranked, ["mini", "warsaw"])
        workers[0].last_seen = NOW - 60
        self.assertEqual(route(job(), workers, {}, NOW, CFG).worker_id, "warsaw")

    def test_warsaw_never_takes_recordings(self):
        workers = [worker("warsaw", **WARSAW)]
        decision = route(
            job(Priority.BACKLOG, JobKind.RECORDING, 600), workers, {}, NOW, CFG
        )
        self.assertIsNone(decision.worker_id)
        self.assertEqual(decision.reason, "no_capable_worker")

    def test_busy_production_server_takes_nothing(self):
        workers = [worker("warsaw", **{**WARSAW, "cpu_load": 0.7})]
        decision = route(job(), workers, {}, NOW, CFG)
        self.assertIsNone(decision.worker_id)
        self.assertEqual(decision.reason, "busy")

    def test_full_worker_is_busy_and_load_spreads(self):
        workers = [worker("mini"), worker("mini2", rtf=0.035)]
        self.assertEqual(
            route(job(), workers, {"mini": 1}, NOW, CFG).worker_id, "mini2"
        )
        decision = route(job(), workers, {"mini": 2, "mini2": 2}, NOW, CFG)
        self.assertEqual(decision.reason, "busy")

    def test_recordings_leave_a_slot_for_live_work(self):
        workers = [worker("mini")]  # two slots
        rec = job(Priority.RECENT, JobKind.RECORDING, 600)
        self.assertEqual(route(rec, workers, {"mini": 0}, NOW, CFG).worker_id, "mini")
        self.assertEqual(route(rec, workers, {"mini": 1}, NOW, CFG).reason, "busy")
        self.assertEqual(route(job(), workers, {"mini": 1}, NOW, CFG).worker_id, "mini")

    def test_single_slot_worker_still_takes_recordings(self):
        workers = [worker("mac", **MAC)]
        rec = job(Priority.BACKLOG, JobKind.RECORDING, 600)
        self.assertEqual(route(rec, workers, {}, NOW, CFG).worker_id, "mac")

    def test_model_family_must_match(self):
        workers = [worker("mini"), worker("whisper", models=["whisper"], rtf=0.4)]
        decision = route(job(model="whisper"), workers, {}, NOW, CFG)
        self.assertEqual(decision.worker_id, "whisper")

    def test_low_memory_and_draining_workers_are_skipped(self):
        workers = [
            worker("a", mem_available_mb=500),
            worker("b", draining=True),
            worker("c", rtf=0.2),
        ]
        self.assertEqual(route(job(), workers, {}, NOW, CFG).worker_id, "c")

    def test_failed_worker_is_avoided_then_retried_when_alone(self):
        workers = [worker("mini"), worker("mac", **MAC)]
        j = job(excluded_workers=["mac"])
        self.assertEqual(route(j, workers, {}, NOW, CFG).worker_id, "mini")
        workers[0].last_seen = NOW - 60
        self.assertEqual(route(j, workers, {}, NOW, CFG).worker_id, "mac")

    def test_expired_live_job(self):
        j = job(expires_after_s=5.0, created_at=NOW - 10)
        self.assertEqual(route(j, [worker("mini")], {}, NOW, CFG).reason, "expired")

    def test_no_workers(self):
        self.assertEqual(route(job(), [], {}, NOW, CFG).reason, "no_capable_worker")

    def test_deterministic_tie_break(self):
        workers = [worker("b"), worker("a")]
        self.assertEqual(route(job(), workers, {}, NOW, CFG).ranked, ["a", "b"])

    def test_timeouts_scale_with_audio_and_speed(self):
        mini = worker("mini")
        self.assertEqual(timeout_s(job(), mini, CFG), CFG.min_timeout_chunk_s)
        rec = job(Priority.RECENT, JobKind.RECORDING, 3 * 3600)
        self.assertGreater(timeout_s(rec, mini, CFG), CFG.min_timeout_recording_s)


if __name__ == "__main__":
    unittest.main()

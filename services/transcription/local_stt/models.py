"""Jobs, results and worker heartbeats exchanged through the queue."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from enum import Enum


class Priority(str, Enum):
    """Job urgency. The queue serves lower ranks first."""

    # Utterances of a call in progress and composer dictation: someone waits.
    LIVE = "live"
    # Recordings of calls that ended recently.
    RECENT = "recent"
    # Re-transcription and other batch work.
    BACKLOG = "backlog"

    @property
    def rank(self) -> int:
        return _RANK[self]


_RANK = {Priority.LIVE: 0, Priority.RECENT: 1, Priority.BACKLOG: 2}


class JobKind(str, Enum):
    # Short PCM chunk stored in the queue next to the job.
    CHUNK = "chunk"
    # Long media file the worker downloads from `source_url`.
    RECORDING = "recording"


@dataclass
class Job:
    id: str
    kind: JobKind
    priority: Priority
    created_at: float
    # Audio length in seconds; the router estimates run time from it.
    duration_s: float
    # Language hint (`nl`, `en`); None lets the model decide.
    language: str | None = None
    # Model family the caller requires (`parakeet`, `whisper`); None = any.
    model: str | None = None
    source_url: str | None = None
    # Seconds after `created_at` when the result is useless (live work).
    expires_after_s: float | None = None
    max_attempts: int = 3
    attempts: int = 0
    # Workers that timed out or failed on this job.
    excluded_workers: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    def to_json(self) -> str:
        data = asdict(self)
        data["kind"] = self.kind.value
        data["priority"] = self.priority.value
        return json.dumps(data)

    @classmethod
    def from_json(cls, raw: str | bytes) -> Job:
        data = json.loads(raw)
        data["kind"] = JobKind(data["kind"])
        data["priority"] = Priority(data["priority"])
        return cls(**data)

    def expired(self, now: float) -> bool:
        return (
            self.expires_after_s is not None
            and now > self.created_at + self.expires_after_s
        )


@dataclass
class Segment:
    start: float
    end: float
    text: str
    language: str | None = None


@dataclass
class Result:
    job_id: str
    ok: bool
    text: str = ""
    language: str | None = None
    segments: list[Segment] = field(default_factory=list)
    worker: str | None = None
    model: str | None = None
    duration_s: float = 0.0
    processing_s: float = 0.0
    error: str | None = None

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str | bytes) -> Result:
        data = json.loads(raw)
        data["segments"] = [Segment(**s) for s in data.get("segments", [])]
        return cls(**data)


@dataclass
class WorkerInfo:
    """What a worker reports in its heartbeat."""

    id: str
    machine: str
    # Model families it serves (`parakeet`, `whisper`).
    models: list[str]
    # `mlx`, `cpu`, `cuda`: informational, the router uses `rtf`.
    hardware: str
    # Processing seconds per audio second, measured on finished jobs.
    rtf: float
    max_concurrency: int
    # Priorities this worker accepts: Warsaw takes only live work.
    priorities: list[str]
    # Fallback tier: lower is preferred when estimates are close.
    tier: int = 0
    # Load average / cores, 0..1+.
    cpu_load: float = 0.0
    # Above this machine load the worker takes no new jobs.
    max_cpu_load: float = 0.9
    mem_available_mb: int = 0
    min_free_mem_mb: int = 1024
    running: int = 0
    # Round trip to Redis in seconds, measured on heartbeats.
    rtt_s: float = 0.0
    draining: bool = False
    last_seen: float = 0.0
    # When the worker process started.
    started_at: float = 0.0

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str | bytes) -> WorkerInfo:
        data = json.loads(raw)
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in data.items() if k in known})

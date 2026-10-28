# Local speech-to-text (self-host)

Self-hosted Macro has no LiveKit Cloud: its call transcription agent used
Deepgram through LiveKit Cloud inference, and composer dictation uses OpenAI
Whisper. `local_stt` replaces both with our own models on our own machines,
behind a durable queue and a router. Everything is off until
`MACRO_LOCAL_STT_REDIS_URL` (agent) or `DICTATION_STT_API_BASE` (document
storage service) is set.

## What Macro transcribes

| Flow | When | Before | With local STT |
| --- | --- | --- | --- |
| Call transcript | Live: per participant, per utterance, while the call runs | `transcriber.py` (LiveKit agent) streams each participant's track to Deepgram nova-3 via LiveKit Cloud | Silero VAD in the agent cuts utterances; each is a `live` job; the agent posts the segment as before |
| Composer dictation | Interactive: one clip per request | `crates/dictation` → OpenAI `/v1/audio/transcriptions` | Same client, pointed at the hub's OpenAI-compatible gateway; a `live` job |
| Call recording | Post-call, LiveKit Egress → R2 | Playback only; never transcribed | Can be queued as a `recent`/`backlog` job (`python -m local_stt recording <url>`); Macro does not do this by itself |

The agent posts segments to `POST /call/{room}/transcript` (internal secret),
stored in `call_transcripts` while the call is active. When the room ends the
call is archived: segments move to `call_record_transcripts`, the summary and
speaker naming run, and the transcript reaches the call record UI and agent
memory (`read_call_record`). A segment that arrives after archiving is
rejected (404), so live work must finish within seconds, which is why
utterances are `live` priority with a 20 s timeout. Speaker turns come from
the participant identity plus the agent's Resemblyzer voice clusters
(`diarizedSpeakerId`); Deepgram's in-track diarization is not replaced.

## Models (measured October 2026, FLEURS NL/EN)

| Model | Runtime | Machine | WER EN | WER NL | RTF | RAM |
| --- | --- | --- | --- | --- | --- | --- |
| Parakeet TDT 0.6B v3 fp32 | onnx-asr, 8 threads | luka-mini | 0.036 | 0.080 | 0.03 | 3.7 GB |
| Parakeet TDT 0.6B v3 int8 | onnx-asr | luka-mini | 0.048 | 0.118 | 0.024 | 2.4 GB |
| Whisper large-v3-turbo int8 | faster-whisper | luka-mini | 0.045 | 0.062 | 0.15-0.45 | 1.6 GB |
| Whisper large-v3-turbo q5_0 | whisper.cpp | luka-mini | 0.038 | 0.058 | 0.23-1.1 | 0.9 GB |
| Parakeet TDT 0.6B v3 | parakeet-mlx | MacBook M5 Pro | 0.041 | 0.076 | 0.012 | 2.0 GB |
| Whisper large-v3-turbo | mlx-whisper | MacBook M5 Pro | 0.045 | 0.065 | 0.036 | 1.9 GB |

Parakeet everywhere: 10-30x faster than Whisper at similar accuracy (Whisper
is ~1.5 points better on Dutch). It needs no language hint and switches
between Dutch and English inside a clip, but reports no language. fp32 on CPU:
int8 costs 4 points of Dutch WER for no real speed. Long audio must be split
on pauses first (whole clips dropped sentences, for both models), and quiet
speakers need loudness normalisation before the voice detector.
`faster-whisper` is available as engine for jobs that ask for `model=whisper`.

## Architecture

```
 Macro DSS (dictation) ──HTTP──► hub: gateway + dispatcher ◄──┐
 LiveKit agent (calls) ──────────► Redis (AOF) on Warsaw ◄────┼── workers pull
                                     queue / inbox:{worker}    │   luka-mini (CPU, docker)
                                     workers (heartbeats)      │   MacBook (MLX, launchd)
                                     result:{job}              │   Warsaw (CPU, live only, optional)
```

- **Queue** (`queue.py`): Redis with `appendonly yes`. Waiting jobs in a
  sorted set ordered by priority (`live` < `recent` < `backlog`) then age;
  chunk audio stored beside the job; job ids derive from content, so a retried
  submit runs once; the first result wins (`SET NX`), so a late worker cannot
  overwrite it.
- **Router** (`router.py`, pure): alive (heartbeat < 15 s, not draining) →
  capable (model family, accepted priorities) → not already failed on this job
  → has a free slot (recordings keep one slot free for live work) → under its
  CPU-load and memory limits. Lowest estimated finish time wins: the worker's
  measured round trip to Redis + audio length × measured RTF × in-flight and
  load factors + 0.05 s per fallback tier.
- **Dispatcher** (`dispatcher.py`, in the hub, leader lock): assigns waiting
  jobs to worker inboxes; requeues jobs whose worker stopped heartbeating
  (MacBook lid closed) or missed the deadline (4× the estimate, at least 20 s
  for chunks and 120 s for recordings), excluding that worker; fails a job
  after 3 attempts; fails live jobs no worker can take after 10 s and expired
  live jobs; recordings wait for a worker.
- **Workers** (`worker.py`): heartbeat every 2 s with model, hardware,
  measured RTF and round trip to Redis (moving averages), slots, load and free
  memory. A job costs a worker two round trips: the `BLMOVE inbox →
  processing` that delivers the assignment with its job and audio, and one
  script that stores the result and releases it (luka-mini and the MacBook
  are ~200 ms from Warsaw). Workers recover taken jobs after a crash.

Live work goes to the fastest estimate: usually the MacBook or luka-mini;
Warsaw (tier 2, live only, load ≤ 0.5 per core, 1 slot) sits next to Redis
and wins short utterances while it is idle, and takes everything live when
the others are away.

## Configuration

Team owners and admins change transcription in **Settings › Team ›
Transcription** (`crates/transcription_settings`, table
`team_transcription_settings`): on/off for the team's calls and dictation,
dictation provider (local hub or OpenAI), hub URL, model (`parakeet`, or
`whisper` for workers running faster-whisper) and a default dictation
language. Anything a team has not set follows the env below, so the env is
the bootstrap default; secrets stay in env and the page only shows whether
they are set. The gateway passes `model=parakeet|whisper` on to the router;
any other model name (OpenAI's `whisper-1`) lets the router choose.

| Variable | Where | Effect |
| --- | --- | --- |
| `MACRO_LOCAL_STT_REDIS_URL` | agent, hub, workers | The queue. On the agent: switches calls from Deepgram to local STT. |
| `MACRO_LOCAL_STT_TIMEOUT_SECONDS` | agent | Seconds an utterance may wait (default 20). |
| `MACRO_LOCAL_STT_SOCKET_TIMEOUT`, `MACRO_LOCAL_STT_CONNECT_TIMEOUT` | all | Redis read and connect timeouts (defaults 15 s, 5 s): a connection that died while a Mac slept fails and reconnects instead of hanging. |
| `MACRO_LOCAL_STT_GATEWAY_TOKEN` | hub | Bearer token of the dictation gateway. |
| `DICTATION_STT_API_BASE`, `DICTATION_STT_API_KEY` | document storage service | Default: dictation goes to this OpenAI-compatible API with this token instead of OpenAI. Teams can override the URL in settings. |
| `DICTATION_STT_ALLOWED_HOSTS` | document storage service | Comma-separated extra hosts a team may set as hub URL (the host of `DICTATION_STT_API_BASE` is always allowed). The hub token goes to that host. |
| `LIVEKIT_TRANSCRIPTION_AGENT_NAME=macro-transcriber` | document storage service | Macro dispatches the agent to each call (needs `INTERNAL_CALL_SECRET`). |
| `LOCAL_STT_ENGINE` | worker | `parakeet-onnx`, `parakeet-mlx`, `faster-whisper`. |
| `LOCAL_STT_WORKER_ID`, `_THREADS`, `_MAX_CONCURRENCY`, `_PRIORITIES`, `_TIER`, `_MAX_CPU_LOAD`, `_MIN_FREE_MEM_MB`, `_DOWNLOAD_DIR`, `_PARAKEET_DIR` | worker | Routing inputs and resources; see `__main__.py`. |
| `LOCAL_STT_INITIAL_RTF` | worker | Real-time factor the router assumes after a restart, until the worker has measured its own (default: the engine's, measured on luka-mini). Warsaw sets 0.2. |

## Rollout

1. Build and push the images on luka-mini (context `services/transcription`):
   `docker build -f Dockerfile.local-stt --target hub -t youriheuvel/macro-local-stt-hub:<sha> .`,
   the same with `--target worker` as `macro-local-stt-worker`, and
   `docker build -t youriheuvel/macro-transcriber:<sha> .` for the agent.
2. Warsaw: copy `deploy/warsaw/docker-compose.yml` to `/srv/macro-stt/`, write
   `.env` (0600) with `LOCAL_STT_REDIS_PASSWORD`, `LOCAL_STT_GATEWAY_TOKEN`,
   `LIVEKIT_API_KEY`/`SECRET`, `INTERNAL_CALL_SECRET` (from 1Password
   "Production Macro Environment") and the image tags; `docker compose up -d`
   (add `--profile fallback` for the Warsaw worker).
3. luka-mini: `deploy/luka-mini/docker-compose.yml` with the Redis password in
   `.env`; `docker compose up -d`. First start downloads the model (2.5 GB).
4. MacBook: `LOCAL_STT_REDIS_PASSWORD=… deploy/macbook/install.sh`.
5. Check: `docker exec macro-stt-hub python -m local_stt status`. Redis is
   published on the Tailscale address, so after a reboot it starts only once
   `tailscale0` is up (`docker compose up -d` again if it lost the race).
6. Macro env: `LIVEKIT_TRANSCRIPTION_AGENT_NAME=macro-transcriber`,
   `DICTATION_STT_API_BASE=http://macro-stt-hub:8790/v1`,
   `DICTATION_STT_API_KEY=<gateway token>`; re-render and `deploy.sh <sha> start`
   (`update` leaves running services alone when the binaries did not change,
   so it does not pick up env changes).

Rollback: turn transcription off or switch dictation to OpenAI per team in
Settings › Team › Transcription, or unset the Macro variables for every team
(calls get no transcript, dictation uses OpenAI again) and `docker compose
down` in `/srv/macro-stt`.

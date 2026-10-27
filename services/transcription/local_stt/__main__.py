"""Command line: `python -m local_stt <command>`.

hub        dispatcher + dictation gateway (next to Redis, on Warsaw)
dispatcher dispatcher only
worker     a worker (luka-mini, MacBook, optionally Warsaw)
status     queue depth and workers
recording  queue a recording URL and optionally wait for its transcript
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import signal
import socket
import sys
import time
from dataclasses import asdict

from .client import SttClient, queue_from_env
from .models import Priority

logger = logging.getLogger("local_stt")


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


async def _dispatcher(args) -> None:
    from .dispatcher import Dispatcher

    await Dispatcher(queue_from_env(args.redis_url)).run_forever()


async def _hub(args) -> None:
    from aiohttp import web

    from .dispatcher import Dispatcher
    from .gateway import build_app, token_from_env

    queue = queue_from_env(args.redis_url)
    runner = web.AppRunner(build_app(queue, token_from_env()))
    await runner.setup()
    await web.TCPSite(runner, args.host, args.port).start()
    logger.info("gateway on %s:%s", args.host, args.port)
    await Dispatcher(queue).run_forever()


async def _worker(args) -> None:
    from .engines import load_engine
    from .worker import Worker, WorkerConfig

    engine = load_engine(args.engine, threads=args.threads)
    cfg = WorkerConfig(
        id=args.id,
        machine=args.machine,
        max_concurrency=args.max_concurrency,
        priorities=[p.strip() for p in args.priorities.split(",") if p.strip()],
        tier=args.tier,
        max_cpu_load=args.max_cpu_load,
        min_free_mem_mb=args.min_free_mem_mb,
        download_dir=args.download_dir or None,
        serialize_engine=engine.hardware == "mlx",
    )
    worker = Worker(queue_from_env(args.redis_url), engine, cfg)
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, worker.stop)
    logger.info("worker %s starting: %s (%s)", cfg.id, engine.name, engine.hardware)
    await worker.run_forever()


async def _status(args) -> None:
    from .gateway import status_snapshot

    print(json.dumps(await status_snapshot(queue_from_env(args.redis_url)), indent=2))


async def _recording(args) -> None:
    queue = queue_from_env(args.redis_url)
    client = SttClient(queue)
    job_id = args.id or f"recording-{int(time.time())}"
    created = await client.submit_recording(
        args.url,
        job_id=job_id,
        duration_s=args.duration,
        priority=Priority(args.priority),
        language=args.language,
    )
    print(f"{'queued' if created else 'already queued'} {job_id}", file=sys.stderr)
    if args.wait:
        result = await queue.wait_result(job_id, args.wait)
        print(json.dumps(asdict(result) if result else {"pending": job_id}, indent=2))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="local_stt")
    parser.add_argument(
        "--redis-url", default=None, help="default: $MACRO_LOCAL_STT_REDIS_URL"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    hub = sub.add_parser("hub")
    hub.add_argument("--host", default=_env("LOCAL_STT_GATEWAY_HOST", "0.0.0.0"))
    hub.add_argument(
        "--port", type=int, default=int(_env("LOCAL_STT_GATEWAY_PORT", "8790"))
    )
    sub.add_parser("dispatcher")

    host = socket.gethostname()
    worker = sub.add_parser("worker")
    worker.add_argument("--id", default=_env("LOCAL_STT_WORKER_ID", host))
    worker.add_argument("--machine", default=_env("LOCAL_STT_MACHINE", host))
    worker.add_argument(
        "--engine",
        default=_env("LOCAL_STT_ENGINE", "parakeet-onnx"),
        help="parakeet-onnx | parakeet-mlx | faster-whisper | fake",
    )
    worker.add_argument(
        "--threads", type=int, default=int(_env("LOCAL_STT_THREADS", "8"))
    )
    worker.add_argument(
        "--max-concurrency",
        type=int,
        default=int(_env("LOCAL_STT_MAX_CONCURRENCY", "2")),
    )
    worker.add_argument(
        "--priorities", default=_env("LOCAL_STT_PRIORITIES", "live,recent,backlog")
    )
    worker.add_argument("--tier", type=int, default=int(_env("LOCAL_STT_TIER", "0")))
    worker.add_argument(
        "--max-cpu-load",
        type=float,
        default=float(_env("LOCAL_STT_MAX_CPU_LOAD", "3.0")),
    )
    worker.add_argument(
        "--min-free-mem-mb",
        type=int,
        default=int(_env("LOCAL_STT_MIN_FREE_MEM_MB", "2048")),
    )
    worker.add_argument("--download-dir", default=_env("LOCAL_STT_DOWNLOAD_DIR", ""))

    sub.add_parser("status")

    rec = sub.add_parser("recording")
    rec.add_argument("url")
    rec.add_argument("--id")
    rec.add_argument(
        "--duration", type=float, required=True, help="seconds, for routing"
    )
    rec.add_argument(
        "--priority", default="recent", choices=["recent", "backlog", "live"]
    )
    rec.add_argument("--language")
    rec.add_argument(
        "--wait", type=float, default=0.0, help="seconds to wait for the result"
    )

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=_env("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    handler = {
        "hub": _hub,
        "dispatcher": _dispatcher,
        "worker": _worker,
        "status": _status,
        "recording": _recording,
    }[args.command]
    asyncio.run(handler(args))


if __name__ == "__main__":
    main()

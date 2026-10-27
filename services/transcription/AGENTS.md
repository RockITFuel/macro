# transcription

## What it is

Speech-to-text for Calls and composer dictation. `transcriber.py` is the
LiveKit agent that transcribes each call participant live and posts segments
to the document storage service; `local_stt/` is the self-hosted alternative
to LiveKit Cloud's Deepgram and OpenAI Whisper: a Redis queue, a router and
workers for our own machines. Read [LOCAL_STT.md](LOCAL_STT.md) first.

## Start here

- `transcriber.py`: per-participant agent sessions, voice clustering, segment posting.
- `local_stt/router.py`: which worker gets a job (pure, unit-tested).
- `local_stt/queue.py`: Redis key layout and the job lifecycle.
- `local_stt/livekit_stt.py`: the STT the agent uses when `MACRO_LOCAL_STT_REDIS_URL` is set.

## Scope

- Owns: live call transcription, the local STT queue/router/workers, the
  OpenAI-compatible dictation gateway.
- Not here: transcript storage, archiving and summaries → `crates/call`;
  dictation validation and limits → `crates/dictation`.

## Checks

- `python -m unittest discover -s tests -t . && python -m unittest test_transcriber`
  (needs `requirements.txt` + `requirements-local-stt.txt` + `fakeredis`; set
  `LOCAL_STT_TEST_REDIS_URL` to run the queue tests on a real Redis).

## Gotchas

- Segments must reach `/call/{room}/transcript` before the call is archived;
  later ones get 404. Keep utterances at `live` priority with short timeouts.
- MLX models only run on the thread that loaded them: the worker gives MLX one
  dedicated engine thread (`serialize_engine`).
- Load Parakeet ONNX fp32 from a plain folder, not the Hugging Face cache
  (onnxruntime 1.31 rejects its symlinked weights).
- luka-mini's `/tmp` is RAM: workers download recordings to `LOCAL_STT_DOWNLOAD_DIR`.

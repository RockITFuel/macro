"""Local speech-to-text for self-hosted Macro: a Redis job queue, a router
that picks a worker per job, workers for CPU (onnx-asr) and Apple Silicon
(MLX), a LiveKit STT adapter and an OpenAI-compatible dictation gateway.

Off unless MACRO_LOCAL_STT_REDIS_URL is set. See ../LOCAL_STT.md.
"""

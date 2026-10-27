"""Speech-to-text engines a worker can load. Each takes 16 kHz mono float32
and returns segments; heavy imports happen only for the engine in use.

Benchmark (FLEURS, Oct 2026): Parakeet TDT 0.6B v3 fp32 on CPU via onnx-asr,
RTF ~0.03 on luka-mini, WER EN 0.04 / NL 0.08; parakeet-mlx on the M5 Pro,
RTF ~0.012; Whisper large-v3-turbo int8 (faster-whisper) RTF 0.15-0.45,
NL WER 0.06. See services/transcription/LOCAL_STT.md.
"""

from __future__ import annotations

import logging
import os
from typing import Protocol

import numpy as np

from .audio import SAMPLE_RATE, SpeechSplitter, normalize_loudness
from .models import Segment

logger = logging.getLogger("local_stt.engines")


class Engine(Protocol):
    name: str
    # Model family the router matches on (`parakeet`, `whisper`).
    family: str
    hardware: str
    # Initial real-time factor estimate until the worker has measured its own.
    default_rtf: float

    def transcribe(
        self, samples: np.ndarray, language: str | None
    ) -> list[Segment]: ...


class _SplittingEngine:
    """Normalizes loudness, splits long audio on pauses, transcribes each piece."""

    def __init__(self) -> None:
        self._splitter: SpeechSplitter | None = None

    def _pieces(self, samples: np.ndarray) -> list[tuple[int, int]]:
        if samples.size / SAMPLE_RATE <= 25.0:
            return [(0, samples.size)]
        if self._splitter is None:
            self._splitter = SpeechSplitter()
        return self._splitter.split(samples)

    def transcribe(self, samples: np.ndarray, language: str | None) -> list[Segment]:
        samples = normalize_loudness(samples)
        segments = []
        for start, end in self._pieces(samples):
            piece = samples[start:end]
            if piece.size < SAMPLE_RATE // 10:
                continue
            text, lang = self._recognize(piece, language)
            text = text.strip()
            if text:
                segments.append(
                    Segment(
                        start / SAMPLE_RATE, end / SAMPLE_RATE, text, lang or language
                    )
                )
        return segments

    def _recognize(
        self, samples: np.ndarray, language: str | None
    ) -> tuple[str, str | None]:
        raise NotImplementedError


class ParakeetOnnx(_SplittingEngine):
    """NVIDIA Parakeet TDT 0.6B v3 on CPU through onnx-asr (fp32: int8 cost
    Dutch WER 0.08 -> 0.12 for barely any speed)."""

    name = "parakeet-tdt-0.6b-v3-onnx"
    REPO = "istupakov/parakeet-tdt-0.6b-v3-onnx"
    family = "parakeet"
    hardware = "cpu"
    default_rtf = 0.04

    def __init__(self, model_dir: str | None = None, threads: int = 8) -> None:
        super().__init__()
        import onnx_asr
        import onnxruntime as rt

        options = rt.SessionOptions()
        options.intra_op_num_threads = threads
        # A plain folder, not the Hugging Face cache: onnxruntime >= 1.31
        # rejects the cache's symlinked external weights for the fp32 model.
        model_dir = (
            model_dir
            or os.environ.get("LOCAL_STT_PARAKEET_DIR")
            or os.path.expanduser("~/.cache/local-stt/parakeet-tdt-0.6b-v3-onnx")
        )
        if not os.path.exists(os.path.join(model_dir, "config.json")):
            from huggingface_hub import snapshot_download

            logger.info("downloading %s to %s", self.REPO, model_dir)
            snapshot_download(self.REPO, local_dir=model_dir)
        self._model = onnx_asr.load_model(
            "nemo-parakeet-tdt-0.6b-v3", model_dir, sess_options=options
        )

    def _recognize(self, samples, language):
        # Parakeet v3 detects the language itself and reports none.
        return self._model.recognize(samples, sample_rate=SAMPLE_RATE), None


class ParakeetMlx(_SplittingEngine):
    """Parakeet TDT 0.6B v3 on Apple Silicon (MLX)."""

    name = "parakeet-tdt-0.6b-v3-mlx"
    family = "parakeet"
    hardware = "mlx"
    default_rtf = 0.015

    def __init__(self, repo: str = "mlx-community/parakeet-tdt-0.6b-v3") -> None:
        super().__init__()
        self._repo = repo
        self._model = None

    def _recognize(self, samples, language):
        import mlx.core as mx
        from parakeet_mlx import from_pretrained
        from parakeet_mlx.audio import get_logmel

        # MLX streams belong to the thread that made them: load the model on
        # the worker's engine thread, at the first (warm-up) call.
        if self._model is None:
            self._model = from_pretrained(self._repo)
        mel = get_logmel(mx.array(samples), self._model.preprocessor_config)
        return self._model.generate(mel)[0].text, None


class FasterWhisper(_SplittingEngine):
    """Whisper large-v3-turbo int8 via CTranslate2: slower, slightly better
    Dutch, and it reports the language."""

    name = "whisper-large-v3-turbo-ct2"
    family = "whisper"
    hardware = "cpu"
    default_rtf = 0.4

    def __init__(self, threads: int = 8) -> None:
        super().__init__()
        from faster_whisper import WhisperModel

        self._model = WhisperModel(
            "large-v3-turbo", device="cpu", compute_type="int8", cpu_threads=threads
        )

    def _recognize(self, samples, language):
        segments, info = self._model.transcribe(
            samples, language=language, beam_size=5, vad_filter=False
        )
        return " ".join(s.text.strip() for s in segments), info.language


class FakeEngine:
    """For tests and smoke checks: returns a fixed text, takes `delay_s`."""

    family = "parakeet"
    hardware = "fake"
    default_rtf = 0.01

    def __init__(
        self, text: str = "hallo wereld", delay_s: float = 0.0, name: str = "fake"
    ) -> None:
        self.text = text
        self.delay_s = delay_s
        self.name = name
        self.calls = 0

    def transcribe(self, samples, language):
        import time

        self.calls += 1
        if self.delay_s:
            time.sleep(self.delay_s)
        if self.text == "!fail":
            raise RuntimeError("fake engine failure")
        return [Segment(0.0, samples.size / SAMPLE_RATE, self.text, language)]


def load_engine(name: str, threads: int = 8) -> Engine:
    if name == "parakeet-onnx":
        return ParakeetOnnx(threads=threads)
    if name == "parakeet-mlx":
        return ParakeetMlx()
    if name == "faster-whisper":
        return FasterWhisper(threads=threads)
    if name.startswith("fake"):
        return FakeEngine()
    raise ValueError(f"unknown engine {name!r}")

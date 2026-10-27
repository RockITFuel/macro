"""Audio helpers. Everything inside the queue is 16 kHz mono."""

from __future__ import annotations

import numpy as np

SAMPLE_RATE = 16_000
# Utterances up to this long go to the model in one piece; longer audio is
# split on speech pauses first (whole long clips dropped sentences in the
# benchmark, for Parakeet and Whisper alike).
MAX_DIRECT_SECONDS = 25.0
TARGET_DBFS = -23.0


def pcm16_to_float(pcm: bytes) -> np.ndarray:
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0


def float_to_pcm16(samples: np.ndarray) -> bytes:
    clipped = np.clip(samples, -1.0, 1.0)
    return (clipped * 32767.0).astype(np.int16).tobytes()


def to_mono_16k(samples: np.ndarray, sample_rate: int, channels: int = 1) -> np.ndarray:
    """Interleaved float samples at any rate -> mono float32 at 16 kHz."""
    samples = np.asarray(samples, dtype=np.float32)
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    if sample_rate == SAMPLE_RATE or samples.size == 0:
        return samples
    # Linear interpolation is enough for speech recognition at these rates.
    n_out = round(samples.size * SAMPLE_RATE / sample_rate)
    x_old = np.linspace(0.0, 1.0, num=samples.size, endpoint=False)
    x_new = np.linspace(0.0, 1.0, num=n_out, endpoint=False)
    return np.interp(x_new, x_old, samples).astype(np.float32)


def normalize_loudness(
    samples: np.ndarray, target_dbfs: float = TARGET_DBFS
) -> np.ndarray:
    """Scale to a target RMS level. Quiet speakers otherwise slip under the
    voice detector's threshold (seen in the benchmark)."""
    if samples.size == 0:
        return samples
    rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
    if rms < 1e-5:
        return samples
    gain = (10 ** (target_dbfs / 20)) / rms
    gain = min(gain, 30.0)  # don't turn line noise into speech
    return np.clip(samples * gain, -1.0, 1.0).astype(np.float32)


def decode(source: str | bytes) -> np.ndarray:
    """Decode any container FFmpeg knows (webm, mp4, ogg, wav) from a path or
    bytes to 16 kHz mono float32."""
    import io

    import av  # PyAV ships its own FFmpeg

    chunks: list[np.ndarray] = []
    with av.open(
        io.BytesIO(source) if isinstance(source, bytes) else source
    ) as container:
        stream = next(s for s in container.streams if s.type == "audio")
        resampler = av.AudioResampler(format="flt", layout="mono", rate=SAMPLE_RATE)
        for frame in container.decode(stream):
            for out in resampler.resample(frame):
                chunks.append(out.to_ndarray().reshape(-1))
        for out in resampler.resample(None):
            chunks.append(out.to_ndarray().reshape(-1))
    if not chunks:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(chunks).astype(np.float32)


class SpeechSplitter:
    """Silero VAD (via onnx-asr) cutting long audio into <= 30 s utterances,
    with the settings that scored best in the benchmark."""

    def __init__(self) -> None:
        import onnx_asr

        self._vad = onnx_asr.load_vad("silero")

    def split(self, samples: np.ndarray) -> list[tuple[int, int]]:
        if samples.size / SAMPLE_RATE <= MAX_DIRECT_SECONDS:
            return [(0, samples.size)]
        batches = self._vad.segment_batch(
            samples[None],
            np.array([samples.size]),
            SAMPLE_RATE,
            min_silence_duration_ms=300,
            speech_pad_ms=200,
            max_speech_duration_s=30,
        )
        return [(int(a), int(b)) for a, b in next(iter(batches))]

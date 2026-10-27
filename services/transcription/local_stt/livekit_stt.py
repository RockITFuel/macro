"""LiveKit Agents STT that sends each utterance through the local queue.

Silero VAD cuts a participant's audio into utterances; every utterance becomes
a live-priority job and its transcript comes back as a FINAL_TRANSCRIPT whose
single TimedString carries the utterance's stream-relative start and end, so
transcriber.py stamps segments the same way it does with Deepgram's words.
"""

from __future__ import annotations

import asyncio
import logging
import time

import numpy as np
from livekit import rtc
from livekit.agents import stt, utils
from livekit.agents.types import (
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
    APIConnectOptions,
    NotGivenOr,
    TimedString,
)
from livekit.agents.vad import VAD, VADEventType

from .audio import SAMPLE_RATE, to_mono_16k
from .client import SttClient
from .models import Priority

logger = logging.getLogger("local_stt.livekit")

# Drop VAD blips shorter than this; they are clicks, not words.
MIN_UTTERANCE_S = 0.3


def frames_to_samples(frames: list[rtc.AudioFrame]) -> np.ndarray:
    if not frames:
        return np.zeros(0, dtype=np.float32)
    merged = utils.merge_frames(frames)
    pcm = np.frombuffer(bytes(merged.data), dtype=np.int16).astype(np.float32) / 32768.0
    return to_mono_16k(pcm, merged.sample_rate, merged.num_channels)


class LocalQueueSTT(stt.STT):
    def __init__(
        self,
        *,
        client: SttClient,
        vad: VAD,
        scope: str,
        language: str | None = None,
        timeout_s: float = 20.0,
    ):
        super().__init__(
            capabilities=stt.STTCapabilities(
                streaming=True, interim_results=False, aligned_transcript="chunk"
            )
        )
        self._client = client
        self._vad = vad
        self._scope = scope
        self._language = language
        self._timeout_s = timeout_s

    @property
    def model(self) -> str:
        return "local-queue"

    @property
    def provider(self) -> str:
        return "macro-local-stt"

    async def transcribe_utterance(
        self, samples: np.ndarray, *, offset_s: float, language: str | None
    ) -> stt.SpeechEvent:
        duration = samples.size / SAMPLE_RATE
        result = await self._client.transcribe(
            samples,
            scope=f"{self._scope}:{offset_s:.3f}",
            priority=Priority.LIVE,
            language=language,
            timeout_s=self._timeout_s,
        )
        if not result.ok:
            raise RuntimeError(result.error or "transcription failed")
        text = result.text.strip()
        lang = result.language or language or "multi"
        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[
                stt.SpeechData(
                    language=lang,
                    text=text,
                    start_time=offset_s,
                    end_time=offset_s + duration,
                    confidence=1.0 if text else 0.0,
                    words=[
                        TimedString(
                            text, start_time=offset_s, end_time=offset_s + duration
                        )
                    ]
                    if text
                    else None,
                )
            ],
        )

    async def _recognize_impl(
        self,
        buffer: utils.AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions,
    ) -> stt.SpeechEvent:
        frames = buffer if isinstance(buffer, list) else [buffer]
        lang = language if isinstance(language, str) else self._language
        return await self.transcribe_utterance(
            frames_to_samples(frames), offset_s=0.0, language=lang
        )

    def stream(
        self,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.RecognizeStream:
        lang = language if isinstance(language, str) else self._language
        return _LocalQueueStream(self, language=lang, conn_options=conn_options)


class _LocalQueueStream(stt.RecognizeStream):
    def __init__(
        self,
        owner: LocalQueueSTT,
        *,
        language: str | None,
        conn_options: APIConnectOptions,
    ):
        super().__init__(stt=owner, conn_options=conn_options, sample_rate=SAMPLE_RATE)
        self._owner = owner
        self._language = language

    async def _run(self) -> None:
        vad_stream = self._owner._vad.stream()

        async def forward_input() -> None:
            async for item in self._input_ch:
                if isinstance(item, self._FlushSentinel):
                    vad_stream.flush()
                    continue
                vad_stream.push_frame(item)
            vad_stream.end_input()

        async def recognize() -> None:
            async for event in vad_stream:
                if event.type == VADEventType.START_OF_SPEECH:
                    self._event_ch.send_nowait(
                        stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH)
                    )
                    continue
                if event.type != VADEventType.END_OF_SPEECH:
                    continue
                self._event_ch.send_nowait(
                    stt.SpeechEvent(type=stt.SpeechEventType.END_OF_SPEECH)
                )
                samples = frames_to_samples(event.frames)
                if samples.size / SAMPLE_RATE < MIN_UTTERANCE_S:
                    continue
                # The VAD reports when it fired and how much silence and
                # speech preceded that: the utterance's place in the stream.
                end = max(0.0, event.timestamp - event.silence_duration)
                offset = (
                    max(0.0, end - samples.size / SAMPLE_RATE) + self.start_time_offset
                )
                started = time.perf_counter()
                try:
                    final = await self._owner.transcribe_utterance(
                        samples, offset_s=offset, language=self._language
                    )
                except Exception as exc:  # noqa: BLE001 - see below
                    # One lost utterance must not end the participant's stream.
                    logger.warning(
                        "utterance at %.2fs not transcribed: %s", offset, exc
                    )
                    continue
                logger.debug(
                    "utterance %.2fs at %.2fs transcribed in %.2fs",
                    samples.size / SAMPLE_RATE,
                    offset,
                    time.perf_counter() - started,
                )
                if final.alternatives and final.alternatives[0].text:
                    self._event_ch.send_nowait(final)

        tasks = [
            asyncio.create_task(forward_input(), name="local_stt_forward"),
            asyncio.create_task(recognize(), name="local_stt_recognize"),
        ]
        try:
            await asyncio.gather(*tasks)
        finally:
            await utils.aio.cancel_and_wait(*tasks)
            await vad_stream.aclose()

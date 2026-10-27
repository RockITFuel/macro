import asyncio
import unittest

import numpy as np
from livekit import rtc
from livekit.agents import stt
from livekit.agents.vad import VADEvent, VADEventType

from local_stt.livekit_stt import LocalQueueSTT
from local_stt.models import Result

RATE = 16_000


def frame(seconds: float) -> rtc.AudioFrame:
    samples = int(seconds * RATE)
    data = (np.sin(np.arange(samples) / 8) * 8000).astype(np.int16).tobytes()
    return rtc.AudioFrame(data, RATE, 1, samples)


class FakeClient:
    def __init__(self, text="hallo daar", ok=True):
        self.text = text
        self.ok = ok
        self.calls = []

    async def transcribe(self, samples, **kwargs):
        self.calls.append((samples.size, kwargs))
        return Result(
            job_id="j",
            ok=self.ok,
            text=self.text,
            language="nl",
            error=None if self.ok else "no worker available",
        )


class FakeVadStream:
    """Emits one utterance covering everything pushed, followed by 0.5 s of
    silence, as Silero would at end of input."""

    def __init__(self, lead_in_s: float):
        self.frames: list[rtc.AudioFrame] = []
        self.lead_in_s = lead_in_s
        self.events: asyncio.Queue = asyncio.Queue()

    def push_frame(self, f):
        self.frames.append(f)

    def flush(self):
        pass

    def end_input(self):
        speech = sum(f.samples_per_channel for f in self.frames) / RATE
        self.events.put_nowait(
            VADEvent(VADEventType.START_OF_SPEECH, 0, self.lead_in_s, 0.0, 0.0)
        )
        self.events.put_nowait(
            VADEvent(
                VADEventType.END_OF_SPEECH,
                0,
                timestamp=self.lead_in_s + speech + 0.5,
                speech_duration=speech,
                silence_duration=0.5,
                frames=list(self.frames),
            )
        )
        self.events.put_nowait(None)

    def __aiter__(self):
        return self

    async def __anext__(self):
        event = await self.events.get()
        if event is None:
            raise StopAsyncIteration
        return event

    async def aclose(self):
        pass


class FakeVad:
    def __init__(self, lead_in_s=2.0):
        self.lead_in_s = lead_in_s

    def stream(self):
        return FakeVadStream(self.lead_in_s)


async def collect(local: LocalQueueSTT, seconds: float) -> list[stt.SpeechEvent]:
    stream = local.stream()
    stream.push_frame(frame(seconds))
    stream.end_input()
    return [event async for event in stream]


class LocalQueueSttTest(unittest.IsolatedAsyncioTestCase):
    async def test_final_transcript_carries_stream_offsets(self):
        client = FakeClient()
        local = LocalQueueSTT(
            client=client, vad=FakeVad(lead_in_s=2.0), scope="call:c:p"
        )
        events = await collect(local, 1.5)

        types = [e.type for e in events]
        self.assertEqual(
            types,
            [
                stt.SpeechEventType.START_OF_SPEECH,
                stt.SpeechEventType.END_OF_SPEECH,
                stt.SpeechEventType.FINAL_TRANSCRIPT,
            ],
        )
        final = events[-1].alternatives[0]
        self.assertEqual(final.text, "hallo daar")
        self.assertAlmostEqual(final.words[0].start_time, 2.0, places=2)
        self.assertAlmostEqual(final.words[-1].end_time, 3.5, places=2)
        ((size, kwargs),) = client.calls
        self.assertEqual(size, 24_000)
        self.assertEqual(kwargs["priority"].value, "live")
        self.assertTrue(kwargs["scope"].startswith("call:c:p:"))

    async def test_failed_utterance_is_skipped_not_fatal(self):
        local = LocalQueueSTT(client=FakeClient(ok=False), vad=FakeVad(), scope="s")
        events = await collect(local, 1.0)
        self.assertNotIn(stt.SpeechEventType.FINAL_TRANSCRIPT, [e.type for e in events])

    async def test_clicks_are_not_sent(self):
        client = FakeClient()
        local = LocalQueueSTT(client=client, vad=FakeVad(), scope="s")
        await collect(local, 0.1)
        self.assertEqual(client.calls, [])


if __name__ == "__main__":
    unittest.main()

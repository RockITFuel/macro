import unittest
from unittest.mock import patch, sentinel

import transcriber
from local_stt.livekit_stt import LocalQueueSTT


class LocalSttGateTest(unittest.TestCase):
    def test_unset_keeps_deepgram(self):
        with patch.object(transcriber, "LOCAL_STT_REDIS_URL", None):
            self.assertIsNone(
                transcriber.build_local_stt(
                    sentinel.vad, channel_id="c", participant_identity="p"
                )
            )

    def test_set_routes_utterances_through_the_queue(self):
        with patch.object(transcriber, "LOCAL_STT_REDIS_URL", "redis://127.0.0.1:1/0"):
            local = transcriber.build_local_stt(
                sentinel.vad, channel_id="room", participant_identity="user"
            )
        self.assertIsInstance(local, LocalQueueSTT)

        with (
            patch.object(transcriber.inference, "STT") as deepgram,
            patch.object(
                transcriber.Agent, "__init__", return_value=None
            ) as init_agent,
        ):
            transcriber.Transcriber(
                participant_identity="user",
                channel_id="room",
                http_client=sentinel.http_client,
                stt=local,
            )
        deepgram.assert_not_called()
        init_agent.assert_called_once_with(
            instructions="Transcribe user speech.", stt=local
        )


if __name__ == "__main__":
    unittest.main()

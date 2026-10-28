"""The dictation gateway pins a model family only when Macro asks for one."""

import unittest

from local_stt.gateway import requested_model


class RequestedModelTest(unittest.TestCase):
    def test_known_families_are_pinned(self):
        self.assertEqual(requested_model("parakeet"), "parakeet")
        self.assertEqual(requested_model("whisper"), "whisper")

    def test_openai_model_names_and_junk_let_the_router_choose(self):
        for value in ("whisper-1", "", None, "gpt-4o-transcribe", 3):
            self.assertIsNone(requested_model(value))


if __name__ == "__main__":
    unittest.main()

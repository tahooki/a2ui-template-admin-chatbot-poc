import unittest

from app.a2a_client import A2A_SURFACE, extract_a2ui_result


class A2AClientTest(unittest.TestCase):
    def test_extracts_surface_artifact_trace(self) -> None:
        payload = {
            "task": {
                "status": {
                    "state": "TASK_STATE_COMPLETED",
                    "message": {
                        "parts": [{"text": "surface ready"}],
                    },
                },
                "artifacts": [
                    {
                        "parts": [
                            {
                                "mediaType": A2A_SURFACE,
                                "data": {
                                    "kind": "a2ui.surface.response",
                                    "surface": {"templateId": "equipment.statusBooleanList"},
                                    "decision": {
                                        "strategy": "derived_schema",
                                        "score": 0.91,
                                        "candidates": [{"templateId": "equipment.statusBooleanList"}],
                                        "mapping": {"templateId": "equipment.statusBooleanList"},
                                    },
                                },
                            }
                        ]
                    }
                ],
            }
        }

        result = extract_a2ui_result(payload)

        self.assertEqual(result["type"], "surface")
        self.assertEqual(result["surface"]["templateId"], "equipment.statusBooleanList")
        self.assertEqual(result["strategy"], "derived_schema")
        self.assertEqual(result["score"], 0.91)
        self.assertEqual(len(result["candidates"]), 1)
        self.assertEqual(result["text"], "surface ready")

    def test_extracts_text_fallback_with_matcher_trace(self) -> None:
        payload = {
            "task": {
                "status": {
                    "state": "TASK_STATE_COMPLETED",
                    "message": {
                        "parts": [{"text": "fallback text"}],
                    },
                },
                "artifacts": [
                    {
                        "parts": [
                            {
                                "mediaType": "application/json",
                                "data": {
                                    "kind": "a2ui.matcher.trace",
                                    "strategy": "derived_schema",
                                    "score": 0.42,
                                    "candidateCount": 2,
                                },
                            }
                        ]
                    }
                ],
            }
        }

        result = extract_a2ui_result(payload)

        self.assertEqual(result["type"], "text_fallback")
        self.assertEqual(result["text"], "fallback text")
        self.assertEqual(result["strategy"], "derived_schema")
        self.assertEqual(result["score"], 0.42)


if __name__ == "__main__":
    unittest.main()

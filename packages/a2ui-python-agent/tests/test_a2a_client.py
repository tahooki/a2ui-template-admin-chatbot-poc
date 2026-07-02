import unittest

from app.a2a_client import A2A_SURFACE, A2UIA2AClient, extract_a2ui_result


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
                                    "surface": {"templateId": "matrix.statusMatrix"},
                                    "decision": {
                                        "strategy": "derived_schema",
                                        "score": 0.91,
                                        "candidates": [{"templateId": "matrix.statusMatrix"}],
                                        "mapping": {"templateId": "matrix.statusMatrix"},
                                        "sourceTool": {"sourceToolName": "get_equipment_status"},
                                        "dataIntegrity": {"matched": True},
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
        self.assertEqual(result["surface"]["templateId"], "matrix.statusMatrix")
        self.assertEqual(result["strategy"], "derived_schema")
        self.assertEqual(result["score"], 0.91)
        self.assertEqual(len(result["candidates"]), 1)
        self.assertEqual(result["text"], "surface ready")
        self.assertEqual(result["sourceTool"]["sourceToolName"], "get_equipment_status")
        self.assertTrue(result["dataIntegrity"]["matched"])

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

    def test_render_request_preserves_tool_metadata_in_facts(self) -> None:
        data = {"items": [{"id": "eq-1", "isOnline": True}], "total": 1, "page": 1, "pageSize": 44}
        display_data = {"items": [{"id": "eq-1", "name": "CNC 1", "isOnline": True}], "total": 1, "page": 1, "pageSize": 44}
        payload = A2UIA2AClient.render_request(
            query="장비 상태 보여줘",
            api_id="equipment-status",
            data=data,
            display_data=display_data,
            profile={"rowCount": 1},
            fallback_text="fallback",
            tool_metadata={
                "sourceToolName": "get_equipment_status",
                "sourceToolResultId": "tool-result-1",
                "renderToolName": "a2ui_render",
                "renderToolCallPolicy": "deterministic_after_business_tool_result",
            },
        )

        render_data = payload["message"]["parts"][1]["data"]
        self.assertEqual(render_data["toolMetadata"]["sourceToolName"], "get_equipment_status")
        self.assertEqual(render_data["facts"]["sourceToolResultId"], "tool-result-1")
        self.assertNotIn("data", render_data["facts"])
        self.assertNotIn("displayData", render_data["facts"])
        self.assertIs(render_data["data"], data)
        self.assertIs(render_data["displayData"], display_data)
        self.assertTrue(render_data["a2uiOptions"]["allowIntentFallback"])

    def test_tool_metadata_cannot_override_core_render_facts(self) -> None:
        data = {"items": [{"id": "eq-1"}], "total": 1, "page": 1, "pageSize": 44}
        payload = A2UIA2AClient.render_request(
            query="장비 상태 보여줘",
            api_id="equipment-status",
            data=data,
            profile={"rowCount": 1},
            fallback_text="fallback",
            tool_metadata={
                "apiId": "equipment-catalog",
                "data": {"items": []},
                "fallbackText": "wrong fallback",
                "sourceToolName": "get_equipment_status",
            },
        )

        facts = payload["message"]["parts"][1]["data"]["facts"]
        render_data = payload["message"]["parts"][1]["data"]
        self.assertEqual(facts["apiId"], "equipment-status")
        self.assertIs(render_data["data"], data)
        self.assertNotIn("data", facts)
        self.assertEqual(facts["fallbackText"], "fallback")
        self.assertEqual(facts["sourceToolName"], "get_equipment_status")

    def test_render_request_uses_fixture_intent_for_generic_api(self) -> None:
        data = {"items": [{"id": "work-001", "title": "Work 1", "progress": 42}], "total": 1, "page": 1, "pageSize": 1}
        payload = A2UIA2AClient.render_request(
            query="work-items API를 진행률로 보여줘",
            api_id="work-items",
            data=data,
            profile={"rowCount": 1},
            fallback_text="fallback",
        )

        render_data = payload["message"]["parts"][1]["data"]
        self.assertEqual(render_data["intentKey"], "a2ui.fixture.work-items.lookup")
        self.assertEqual(render_data["facts"]["apiId"], "work-items")


if __name__ == "__main__":
    unittest.main()

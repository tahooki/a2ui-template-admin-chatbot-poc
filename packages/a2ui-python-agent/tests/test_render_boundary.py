import unittest
from unittest.mock import patch

from app.a2ui_agent import A2UIResponse
from app.business_tools import BusinessToolResult
from app.render_boundary import render_business_tool_result


class RenderBoundaryTest(unittest.IsolatedAsyncioTestCase):
    async def test_render_boundary_profiles_data_and_forwards_tool_metadata(self) -> None:
        business_result = BusinessToolResult(
            tool_name="get_equipment_status",
            api_id="equipment-status",
            data={"items": [{"id": "eq-1", "isOnline": True}], "total": 1, "page": 1, "pageSize": 44},
            metadata={
                "sourceToolName": "get_equipment_status",
                "sourceToolResultId": "tool-result-1",
                "sourceDataHash": "abc",
                "sourceRowCount": 1,
            },
        )
        captured = {}

        async def fake_fallback(**kwargs):
            captured["fallback_kwargs"] = kwargs
            return "fallback text"

        async def fake_render_or_fallback(
            query,
            api_id,
            data,
            profile,
            fallback_text,
            derived_schema,
            sample_data_preview,
            tool_metadata=None,
        ):
            captured["render"] = {
                "query": query,
                "api_id": api_id,
                "profile": profile,
                "derived_schema": derived_schema,
                "sample_data_preview": sample_data_preview,
                "tool_metadata": tool_metadata,
            }
            return A2UIResponse(
                type="surface",
                surface={"templateId": "equipment.statusBooleanList"},
                source_tool={"sourceToolName": "get_equipment_status"},
                data_integrity={"matched": True},
            )

        with (
            patch("app.render_boundary.generate_equipment_fallback_text", fake_fallback),
            patch("app.render_boundary.render_or_fallback", fake_render_or_fallback),
        ):
            result = await render_business_tool_result(
                "장비 상태 보여줘",
                business_result,
                {"intentSource": "llm", "sourceDataHash": "should-not-override"},
            )

        self.assertEqual(result.profile["rowCount"], 1)
        self.assertEqual(captured["render"]["tool_metadata"]["sourceToolName"], "get_equipment_status")
        self.assertEqual(captured["render"]["tool_metadata"]["sourceDataHash"], "abc")
        self.assertEqual(captured["render"]["tool_metadata"]["renderToolName"], "a2ui_render")
        self.assertEqual(captured["render"]["tool_metadata"]["renderToolCallPolicy"], "deterministic_after_business_tool_result")
        self.assertEqual(result.metadata["dataIntegrity"]["matched"], True)


if __name__ == "__main__":
    unittest.main()

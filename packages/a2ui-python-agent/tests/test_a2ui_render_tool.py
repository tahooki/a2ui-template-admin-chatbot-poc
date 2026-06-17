import unittest
from unittest.mock import patch

from app.a2ui_agent import A2UIResponse
from app.a2ui_render_tool import A2UIRenderToolInput, run_a2ui_render_tool
from app.business_tools import BusinessToolResult
from app.render_boundary import RenderBoundaryResult


class A2UIRenderToolTest(unittest.IsolatedAsyncioTestCase):
    async def test_render_tool_passes_business_result_through_boundary(self) -> None:
        business_result = BusinessToolResult(
            tool_name="get_equipment_status",
            api_id="equipment-status",
            data={"items": [{"id": "eq-1"}], "total": 1},
            metadata={"sourceToolName": "get_equipment_status", "sourceToolResultId": "tool-result-1"},
        )
        captured = {}

        async def fake_render_business_tool_result(query, business_tool_result, extra_metadata=None):
            captured["query"] = query
            captured["business_tool_result"] = business_tool_result
            captured["extra_metadata"] = extra_metadata
            return RenderBoundaryResult(
                a2ui=A2UIResponse(type="text_fallback", text="fallback text", reason="no template"),
                profile={"rowCount": 1},
                sample_data_preview={"rowCount": 1, "sampleSize": 1},
                derived_schema={"rowCount": 1},
                fallback_text="fallback text",
                metadata={"sourceToolName": "get_equipment_status", "sourceToolResultId": "tool-result-1"},
            )

        with patch("app.a2ui_render_tool.render_business_tool_result", fake_render_business_tool_result):
            result = await run_a2ui_render_tool(
                A2UIRenderToolInput(
                    query="장비 상태 보여줘",
                    business_tool_result=business_result,
                    context={"intentSource": "llm"},
                )
            )

        self.assertEqual(captured["query"], "장비 상태 보여줘")
        self.assertIs(captured["business_tool_result"], business_result)
        self.assertEqual(captured["extra_metadata"]["intentSource"], "llm")
        self.assertEqual(result.tool_name, "a2ui_render")
        self.assertEqual(result.type, "text_fallback")
        self.assertEqual(result.metadata["renderToolCallPolicy"], "deterministic_after_business_tool_result")


if __name__ == "__main__":
    unittest.main()

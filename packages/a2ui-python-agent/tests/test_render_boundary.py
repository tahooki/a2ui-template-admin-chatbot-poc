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
        fallback_called = False

        async def fake_fallback(**kwargs):
            nonlocal fallback_called
            fallback_called = True
            captured["fallback_kwargs"] = kwargs
            return "fallback text"

        async def fake_render_or_fallback(
            query,
            api_id,
            data,
            profile,
            fallback_text,
            display_data,
            derived_schema,
            sample_data_preview,
            tool_metadata=None,
        ):
            captured["render"] = {
                "query": query,
                "api_id": api_id,
                "data": data,
                "display_data": display_data,
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
        self.assertFalse(fallback_called)
        self.assertEqual(captured["render"]["tool_metadata"]["sourceToolName"], "get_equipment_status")
        self.assertEqual(captured["render"]["tool_metadata"]["sourceDataHash"], "abc")
        self.assertEqual(captured["render"]["tool_metadata"]["renderToolName"], "a2ui_render")
        self.assertEqual(captured["render"]["tool_metadata"]["renderToolCallPolicy"], "deterministic_after_business_tool_result")
        self.assertNotIn("normalizationTrace", captured["render"]["tool_metadata"])
        self.assertIs(captured["render"]["data"], business_result.data)
        self.assertIsNone(captured["render"]["display_data"])
        self.assertIsNone(captured["render"]["derived_schema"])
        self.assertIsNone(captured["render"]["sample_data_preview"])
        self.assertEqual(result.metadata["dataIntegrity"]["matched"], True)

    async def test_large_rows_keep_internal_preview_but_send_raw_only_to_a2ui(self) -> None:
        rows = [
            {
                "id": f"eq-large-{index}",
                "name": f"Large CNC {index}",
                "isOnline": True,
                "isRunning": index % 2 == 0,
                "hasAlarm": False,
                "needsInspection": False,
                "isReserved": False,
            }
            for index in range(1000)
        ]
        business_result = BusinessToolResult(
            tool_name="get_equipment_status_large_rows",
            api_id="equipment-status-large-rows",
            data={
                "result": {
                    "rows": rows,
                    "totalCount": 1000,
                    "pageNo": 1,
                    "rowsPerPage": 1000,
                },
                "success": True,
            },
            metadata={
                "sourceToolName": "get_equipment_status_large_rows",
                "sourceToolResultId": "tool-result-large",
                "sourceDataHash": "large-hash",
                "sourceRowCount": 1000,
            },
        )
        captured = {}
        fallback_called = False

        async def fake_fallback(**kwargs):
            nonlocal fallback_called
            fallback_called = True
            return "fallback text"

        async def fake_render_or_fallback(
            query,
            api_id,
            data,
            profile,
            fallback_text,
            display_data,
            derived_schema,
            sample_data_preview,
            tool_metadata=None,
        ):
            captured["api_id"] = api_id
            captured["display_data"] = display_data
            captured["sample_data_preview"] = sample_data_preview
            captured["derived_schema"] = derived_schema
            captured["profile"] = profile
            captured["tool_metadata"] = tool_metadata
            return A2UIResponse(
                type="surface",
                surface={"templateId": "equipment.statusBooleanList"},
                source_tool=tool_metadata,
                data_integrity={"matched": True},
            )

        with (
            patch("app.render_boundary.generate_equipment_fallback_text", fake_fallback),
            patch("app.render_boundary.render_or_fallback", fake_render_or_fallback),
        ):
            result = await render_business_tool_result("데이터가 많은 장비 상태 목록 보여줘", business_result)

        self.assertEqual(captured["api_id"], "equipment-status-large-rows")
        self.assertFalse(fallback_called)
        self.assertIsNone(captured["display_data"])
        self.assertIsNone(captured["sample_data_preview"])
        self.assertIsNone(captured["derived_schema"])
        self.assertEqual(captured["profile"]["rowCount"], 1000)
        self.assertEqual(captured["profile"]["listPath"], "result.rows")
        self.assertEqual(captured["tool_metadata"]["sourceToolName"], "get_equipment_status_large_rows")
        self.assertEqual(captured["tool_metadata"]["sourceRowCount"], 1000)
        self.assertEqual(result.metadata["previewRowCount"], 1000)

    async def test_text_fallback_generation_uses_bounded_preview_only(self) -> None:
        rows = [
            {
                "id": f"eq-large-{index}",
                "name": f"Large CNC {index}",
                "isOnline": True,
                "isRunning": index % 2 == 0,
                "hasAlarm": False,
                "needsInspection": False,
                "isReserved": False,
            }
            for index in range(1000)
        ]
        business_result = BusinessToolResult(
            tool_name="get_equipment_status_large_rows",
            api_id="equipment-status-large-rows",
            data={
                "result": {
                    "rows": rows,
                    "totalCount": 1000,
                    "pageNo": 1,
                    "rowsPerPage": 1000,
                },
                "success": True,
            },
            metadata={
                "sourceToolName": "get_equipment_status_large_rows",
                "sourceToolResultId": "tool-result-large",
                "sourceDataHash": "large-hash",
                "sourceRowCount": 1000,
            },
        )
        captured = {}

        async def fake_fallback(**kwargs):
            captured["fallback_kwargs"] = kwargs
            return "LLM fallback text"

        async def fake_render_or_fallback(
            query,
            api_id,
            data,
            profile,
            fallback_text,
            display_data,
            derived_schema,
            sample_data_preview,
            tool_metadata=None,
        ):
            captured["render_fallback_text"] = fallback_text
            return A2UIResponse(
                type="text_fallback",
                text=fallback_text,
                reason="No matching template.",
                source_tool=tool_metadata,
                data_integrity={"matched": True},
            )

        with (
            patch("app.render_boundary.generate_equipment_fallback_text", fake_fallback),
            patch("app.render_boundary.render_or_fallback", fake_render_or_fallback),
        ):
            result = await render_business_tool_result("데이터가 많은 장비 상태 목록 보여줘", business_result)

        fallback_data = captured["fallback_kwargs"]["data"]
        self.assertEqual(fallback_data["result"]["totalCount"], 1000)
        self.assertLess(len(fallback_data["result"]["rows"]), 1000)
        self.assertEqual(result.fallback_text, "LLM fallback text")
        self.assertEqual(result.a2ui.text, "LLM fallback text")
        self.assertIn("bounded preview", captured["render_fallback_text"])


if __name__ == "__main__":
    unittest.main()

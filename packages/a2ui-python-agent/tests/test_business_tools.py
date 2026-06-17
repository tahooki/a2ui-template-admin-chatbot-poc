import unittest
from unittest.mock import patch

from app.business_tools import run_business_tool
from app.tool_router import api_id_for_business_tool, business_tool_for_api


class BusinessToolsTest(unittest.IsolatedAsyncioTestCase):
    async def test_business_tool_calls_mapped_equipment_api_and_marks_source(self) -> None:
        async def fake_fetch(api_id):
            return {"items": [{"id": "eq-1", "isOnline": True}], "total": 1, "page": 1, "pageSize": 44}

        with patch("app.business_tools.fetch_equipment_data", fake_fetch):
            result = await run_business_tool("get_equipment_status")

        self.assertEqual(result.api_id, "equipment-status")
        self.assertEqual(result.tool_name, "get_equipment_status")
        self.assertEqual(result.metadata["operation"], "get_equipment_status")
        self.assertEqual(result.metadata["sourceToolName"], "get_equipment_status")
        self.assertEqual(result.metadata["sourceRowCount"], 1)
        self.assertTrue(result.metadata["sourceToolResultId"].startswith("tool-result-"))
        self.assertEqual(len(result.metadata["sourceDataHash"]), 64)
        self.assertEqual(result.metadata["inputSchema"]["type"], "object")
        self.assertEqual(result.metadata["outputShape"], "object{items:array<object>,total:number,page:number,pageSize:number}")

    async def test_large_data_business_tools_are_registered_and_mark_source_shape(self) -> None:
        async def fake_fetch(api_id):
            if api_id == "equipment-status-wide-columns":
                row = {
                    "id": "eq-wide-1",
                    "name": "Wide CNC",
                    "isOnline": True,
                    "isRunning": True,
                    "hasAlarm": False,
                    "needsInspection": False,
                    "isReserved": False,
                }
                row.update({f"metric_{index:03d}": index for index in range(120)})
                return {"items": [row for _ in range(6)], "total": 6, "page": 1, "pageSize": 6}
            return {
                "items": [
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
                ],
                "total": 1000,
                "page": 1,
                "pageSize": 1000,
            }

        with patch("app.business_tools.fetch_equipment_data", fake_fetch):
            wide = await run_business_tool("get_equipment_status_wide_columns")
            large = await run_business_tool("get_equipment_status_large_rows")

        self.assertEqual(wide.api_id, "equipment-status-wide-columns")
        self.assertEqual(wide.metadata["sourceToolName"], "get_equipment_status_wide_columns")
        self.assertEqual(wide.metadata["sourceRowCount"], 6)
        self.assertEqual(large.api_id, "equipment-status-large-rows")
        self.assertEqual(large.metadata["sourceToolName"], "get_equipment_status_large_rows")
        self.assertEqual(large.metadata["sourceRowCount"], 1000)

    def test_tool_router_is_bidirectional(self) -> None:
        self.assertEqual(business_tool_for_api("equipment-catalog"), "get_equipment_catalog")
        self.assertEqual(api_id_for_business_tool("get_equipment_status"), "equipment-status")
        self.assertEqual(business_tool_for_api("equipment-status-wide-columns"), "get_equipment_status_wide_columns")
        self.assertEqual(api_id_for_business_tool("get_equipment_status_large_rows"), "equipment-status-large-rows")


if __name__ == "__main__":
    unittest.main()

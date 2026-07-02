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
                "result": {
                    "rows": [
                        {
                            "eqp_id": f"eq-large-{index}",
                            "eqp_nm": f"Large CNC {index}",
                            "operation_yn": "Y",
                            "running_code": "RUN" if index % 2 == 0 else "STOP",
                        }
                        for index in range(1000)
                    ],
                    "totalCount": 1000,
                    "pageNo": 1,
                    "rowsPerPage": 1000,
                },
                "success": True,
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
        self.assertEqual(large.metadata["sourceDataShape"], "object{result.rows:array<object>}")

    async def test_fixture_business_tools_are_registered_and_mark_source(self) -> None:
        seen_api_ids = []

        async def fake_fetch(api_id):
            seen_api_ids.append(api_id)
            return {
                "items": [{"id": f"{api_id}-1", "title": f"{api_id} item", "progress": 42}],
                "total": 1,
                "page": 1,
                "pageSize": 44,
            }

        with patch("app.business_tools.fetch_equipment_data", fake_fetch):
            work = await run_business_tool("get_work_items")
            resources = await run_business_tool("get_resources")
            checks = await run_business_tool("get_status_checks")
            summary = await run_business_tool("get_summary_metrics")
            hierarchy = await run_business_tool("get_hierarchy")

        self.assertEqual(seen_api_ids, ["work-items", "resources", "status-checks", "summary", "hierarchy"])
        self.assertEqual(work.api_id, "work-items")
        self.assertEqual(resources.api_id, "resources")
        self.assertEqual(checks.api_id, "status-checks")
        self.assertEqual(summary.api_id, "summary")
        self.assertEqual(hierarchy.api_id, "hierarchy")
        self.assertEqual(work.metadata["sourceToolName"], "get_work_items")
        self.assertEqual(work.metadata["sourceRowCount"], 1)

    def test_tool_router_is_bidirectional(self) -> None:
        self.assertEqual(business_tool_for_api("equipment-catalog"), "get_equipment_catalog")
        self.assertEqual(api_id_for_business_tool("get_equipment_status"), "equipment-status")
        self.assertEqual(business_tool_for_api("equipment-status-wide-columns"), "get_equipment_status_wide_columns")
        self.assertEqual(api_id_for_business_tool("get_equipment_status_large_rows"), "equipment-status-large-rows")
        self.assertEqual(business_tool_for_api("work-items"), "get_work_items")
        self.assertEqual(api_id_for_business_tool("get_resources"), "resources")
        self.assertEqual(business_tool_for_api("status-checks"), "get_status_checks")
        self.assertEqual(api_id_for_business_tool("get_summary_metrics"), "summary")
        self.assertEqual(business_tool_for_api("hierarchy"), "get_hierarchy")


if __name__ == "__main__":
    unittest.main()

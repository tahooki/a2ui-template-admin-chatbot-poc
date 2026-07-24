import unittest

from app.business_tools import run_business_tool
from app.tool_router import api_id_for_business_tool, business_tool_for_api


class BusinessToolsTest(unittest.IsolatedAsyncioTestCase):
    async def test_business_tool_loads_local_equipment_data_and_marks_source(self) -> None:
        result = await run_business_tool("get_equipment_status")

        self.assertEqual(result.api_id, "equipment-status")
        self.assertEqual(result.tool_name, "get_equipment_status")
        self.assertEqual(result.data["items"][0]["id"], "eq-status-01")
        self.assertEqual(result.metadata["source"], "main_agent_local_data")
        self.assertEqual(result.metadata["operation"], "get_equipment_status")
        self.assertEqual(result.metadata["sourceToolName"], "get_equipment_status")
        self.assertEqual(result.metadata["sourceRowCount"], 44)
        self.assertTrue(result.metadata["sourceToolResultId"].startswith("tool-result-"))
        self.assertEqual(len(result.metadata["sourceDataHash"]), 64)
        self.assertEqual(result.metadata["inputSchema"]["type"], "object")
        self.assertEqual(result.metadata["outputShape"], "object{items:array<object>,total:number,page:number,pageSize:number}")

    async def test_large_data_business_tools_are_registered_and_mark_source_shape(self) -> None:
        wide = await run_business_tool("get_equipment_status_wide_columns")
        large = await run_business_tool("get_equipment_status_large_rows")

        self.assertEqual(wide.api_id, "equipment-status-wide-columns")
        self.assertEqual(wide.metadata["sourceToolName"], "get_equipment_status_wide_columns")
        self.assertEqual(wide.metadata["sourceRowCount"], 6)
        self.assertGreaterEqual(len(wide.data["items"][0]), 120)
        self.assertEqual(large.api_id, "equipment-status-large-rows")
        self.assertEqual(large.metadata["sourceToolName"], "get_equipment_status_large_rows")
        self.assertEqual(large.metadata["sourceRowCount"], 1000)
        self.assertEqual(large.metadata["sourceDataShape"], "object{result.rows:array<object>}")

    async def test_fixture_business_tools_are_registered_and_mark_source(self) -> None:
        work = await run_business_tool("get_work_items")
        resources = await run_business_tool("get_resources")
        checks = await run_business_tool("get_status_checks")
        summary = await run_business_tool("get_summary_metrics")
        hierarchy = await run_business_tool("get_hierarchy")

        self.assertEqual(work.api_id, "work-items")
        self.assertEqual(resources.api_id, "resources")
        self.assertEqual(checks.api_id, "status-checks")
        self.assertEqual(summary.api_id, "summary")
        self.assertEqual(hierarchy.api_id, "hierarchy")
        self.assertEqual(work.metadata["sourceToolName"], "get_work_items")
        self.assertEqual(work.metadata["sourceRowCount"], 18)
        self.assertEqual(resources.metadata["sourceRowCount"], 12)
        self.assertEqual(checks.metadata["sourceRowCount"], 14)
        self.assertEqual(summary.metadata["sourceRowCount"], 4)
        self.assertEqual(hierarchy.metadata["sourceRowCount"], 2)

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

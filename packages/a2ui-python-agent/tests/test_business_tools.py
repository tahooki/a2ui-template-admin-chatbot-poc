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

    def test_tool_router_is_bidirectional(self) -> None:
        self.assertEqual(business_tool_for_api("equipment-catalog"), "get_equipment_catalog")
        self.assertEqual(api_id_for_business_tool("get_equipment_status"), "equipment-status")


if __name__ == "__main__":
    unittest.main()

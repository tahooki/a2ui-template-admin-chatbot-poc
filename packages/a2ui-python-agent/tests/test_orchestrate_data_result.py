import json
import unittest
from unittest.mock import patch

from app.business_tools import BusinessToolResult
from app.orchestrate import run_chat_turn, stream_chat_turn


def parse_sse_chunk(chunk: str) -> tuple[str, dict]:
    lines = chunk.strip().splitlines()
    event = next(line.removeprefix("event:").strip() for line in lines if line.startswith("event:"))
    data = json.loads(next(line.removeprefix("data:").strip() for line in lines if line.startswith("data:")))
    return event, data


class OrchestrateDataResultTest(unittest.IsolatedAsyncioTestCase):
    async def test_data_request_returns_text_and_raw_business_result_without_a2ui(self) -> None:
        business_result = BusinessToolResult(
            tool_name="get_equipment_status",
            api_id="equipment-status",
            data={"items": [{"id": "eq-1", "name": "CNC-01"}], "total": 1, "page": 1, "pageSize": 1},
            metadata={
                "sourceToolResultId": "tool-result-1",
                "sourceDataHash": "hash-1",
                "sourceRowCount": 1,
                "sourceDataShape": "object{items:array<object>}",
            },
        )

        async def fake_run_business_tool(_tool_name):
            return business_result

        with patch("app.orchestrate.run_business_tool", fake_run_business_tool):
            result = await run_chat_turn("장비 상태 보여줘")
            chunks = [chunk async for chunk in stream_chat_turn("장비 상태 보여줘")]

        self.assertEqual(result["mode"], "data_result")
        self.assertEqual(result["data_result"]["data"], business_result.data)
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        event_names = [event for event, _data in events]
        self.assertIn("text", event_names)
        self.assertIn("data_result", event_names)
        self.assertNotIn("surface", event_names)
        statuses = [data.get("status") for event, data in events if event == "state"]
        self.assertNotIn("a2ui_tool_call", statuses)
        data_event = next(data for event, data in events if event == "data_result")
        self.assertEqual(data_event["data"], business_result.data)
        self.assertEqual(data_event["metadata"]["sourceToolResultId"], "tool-result-1")


if __name__ == "__main__":
    unittest.main()

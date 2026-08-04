import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from app.config import settings
from app.main_agent_client import create_main_agent_client
from app.mock_main_agent_client import (
    MockMainAgentClient,
    MockMainAgentDataError,
    load_mock_main_agent_data,
)


def mock_payload(title: str = "워크 아이템 1") -> dict:
    return {
        "apiId": "work-items",
        "sourceToolName": "mock_work_items",
        "data": {
            "items": [
                {
                    "id": "WORK-001",
                    "title": title,
                    "description": "테스트 작업입니다.",
                    "status": "queued",
                    "priority": "high",
                }
            ],
            "total": 1,
        },
        "metadata": {"sourceRowCount": 1},
    }


class MockMainAgentClientTest(
    unittest.IsolatedAsyncioTestCase
):
    def write_payload(
        self,
        directory: str,
        payload: dict,
    ) -> Path:
        path = Path(directory) / "work-items.json"
        path.write_text(
            json.dumps(payload, ensure_ascii=False),
            encoding="utf-8",
        )
        return path

    async def test_emits_main_agent_compatible_data_result(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_payload(
                directory,
                mock_payload(),
            )
            events = [
                (event, data)
                async for event, data in MockMainAgentClient(
                    path
                ).stream_chat(
                    message="워크 아이템을 표로 보여줘",
                )
            ]

        event_names = [event for event, _data in events]
        self.assertEqual(
            event_names,
            ["state", "state", "data_result", "done"],
        )
        data_result = next(
            data for event, data in events
            if event == "data_result"
        )
        self.assertEqual(data_result["apiId"], "work-items")
        self.assertEqual(
            data_result["query"],
            "워크 아이템을 표로 보여줘",
        )
        self.assertTrue(data_result["metadata"]["mock"])
        self.assertEqual(
            data_result["metadata"]["sourceRowCount"],
            1,
        )
        self.assertEqual(
            len(data_result["metadata"]["sourceDataHash"]),
            64,
        )

    async def test_reads_replaced_json_on_next_request(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_payload(
                directory,
                mock_payload("교체 전"),
            )
            client = MockMainAgentClient(path)
            before = [
                data
                async for event, data in client.stream_chat(
                    message="조회",
                )
                if event == "data_result"
            ][0]
            self.write_payload(
                directory,
                mock_payload("교체 후"),
            )
            after = [
                data
                async for event, data in client.stream_chat(
                    message="조회",
                )
                if event == "data_result"
            ][0]

        self.assertEqual(
            before["data"]["items"][0]["title"],
            "교체 전",
        )
        self.assertEqual(
            after["data"]["items"][0]["title"],
            "교체 후",
        )
        self.assertNotEqual(
            before["metadata"]["sourceDataHash"],
            after["metadata"]["sourceDataHash"],
        )

    async def test_text_mode_returns_data_for_proxy_summary(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_payload(
                directory,
                mock_payload(),
            )
            events = [
                event
                async for event, _data in MockMainAgentClient(
                    path
                ).stream_chat(
                    message="워크 아이템 알려줘",
                    presentation_mode="text",
                )
            ]

        self.assertNotIn("text", events)
        self.assertIn("done", events)
        self.assertIn("data_result", events)

    async def test_factory_selects_mock_client(self) -> None:
        with patch(
            "app.main_agent_client.settings",
            replace(settings, main_agent_mode="mock"),
        ):
            client = create_main_agent_client()

        self.assertIsInstance(client, MockMainAgentClient)

    def test_rejects_invalid_json_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_payload(
                directory,
                {"apiId": "work-items"},
            )
            with self.assertRaises(MockMainAgentDataError):
                load_mock_main_agent_data(path)

    def test_rejects_non_work_items_scenario(self) -> None:
        payload = mock_payload()
        payload["apiId"] = "equipment-status"
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_payload(directory, payload)
            with self.assertRaises(MockMainAgentDataError):
                load_mock_main_agent_data(path)


if __name__ == "__main__":
    unittest.main()

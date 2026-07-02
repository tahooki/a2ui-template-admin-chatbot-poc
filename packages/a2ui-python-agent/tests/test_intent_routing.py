import json
import unittest

from app.orchestrate import _choose_api
from app.orchestrate import stream_chat_turn
from app.intent_router import choose_api_by_regex


class IntentRoutingTest(unittest.IsolatedAsyncioTestCase):
    async def test_regex_routes_equipment_status_without_llm(self) -> None:
        api_id, source = await _choose_api("장비 상태 보여줘")

        self.assertEqual(api_id, "equipment-status")
        self.assertEqual(source, "regex")

    async def test_regex_routes_quick_prompt_api_badges(self) -> None:
        cases = {
            "장비 상태 목록 보여줘": "equipment-status",
            "장비 목록 보여줘": "equipment-catalog",
            "컬럼이 많은 장비 상태 목록 보여줘": "equipment-status-wide-columns",
            "데이터가 많은 장비 상태 목록 보여줘": "equipment-status-large-rows",
            "work-items API를 진행률로 보여줘": "work-items",
            "work-items API를 처리 큐처럼 보여줘": "work-items",
            "resources API를 카드로 보여줘": "resources",
            "status-checks API를 상태표로 보여줘": "status-checks",
            "summary API를 숫자 카드로 보여줘": "summary",
            "hierarchy API를 트리로 보여줘": "hierarchy",
        }

        for prompt, expected_api_id in cases.items():
            with self.subTest(prompt=prompt):
                self.assertEqual(choose_api_by_regex(prompt).api_id, expected_api_id)

    async def test_regex_routes_fixture_requests(self) -> None:
        self.assertEqual(choose_api_by_regex("작업 항목 진행률 보여줘").api_id, "work-items")
        self.assertEqual(choose_api_by_regex("계층 트리 데이터 보여줘").api_id, "hierarchy")
        self.assertEqual(choose_api_by_regex("KPI 요약 지표 보여줘").api_id, "summary")

    async def test_regex_general_classification_is_final(self) -> None:
        api_id, source = await _choose_api("안녕")

        self.assertIsNone(api_id)
        self.assertEqual(source, "regex")

    async def test_stream_intent_event_reports_regex_router(self) -> None:
        chunks = []
        async for chunk in stream_chat_turn("장비 상태 보여줘"):
            chunks.append(chunk)
            if '"status": "intent"' in chunk:
                break

        intent_chunk = next(chunk for chunk in chunks if '"status": "intent"' in chunk)
        payload = json.loads(intent_chunk.split("data: ", 1)[1])
        self.assertEqual(payload["label"], "equipment-status")
        self.assertEqual(payload["source"], "regex")
        self.assertEqual(payload["intentRouter"], "regex")
        self.assertNotIn("llmConfigured", payload)


if __name__ == "__main__":
    unittest.main()

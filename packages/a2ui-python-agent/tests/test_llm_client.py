import unittest
from unittest.mock import patch

from app.ai import llm_client


class LLMClientFallbackPromptTest(unittest.IsolatedAsyncioTestCase):
    async def test_equipment_fallback_prompt_uses_compact_summary(self) -> None:
        wide_row = {
            "id": "wide-1",
            "name": "Wide telemetry node",
            "isOnline": True,
            "isRunning": True,
            "hasAlarm": False,
            "needsInspection": False,
            "isReserved": False,
            **{f"telemetry_{index:03d}": index for index in range(120)},
        }
        profile = {
            "shape": "array<object>",
            "rowCount": 1000,
            "booleanFieldCount": 5,
            "hasImageField": False,
            "fields": [
                {"key": key, "type": "boolean" if isinstance(value, bool) else "number", "roleCandidates": []}
                for key, value in wide_row.items()
            ],
        }
        captured = {}

        async def fake_chat_completion(messages, **kwargs):
            captured["messages"] = messages
            captured["kwargs"] = kwargs
            return "- 데이터 많은 장비 상태 1,000건을 확인했습니다."

        with patch("app.ai.llm_client._chat_completion", fake_chat_completion):
            text = await llm_client.generate_equipment_fallback_text(
                message="데이터 많은 상태 보여줘",
                api_id="equipment-status-large-rows",
                data={"items": [wide_row for _ in range(1000)], "total": 1000},
                profile=profile,
                reason="No matching template.",
            )

        user_prompt = captured["messages"][1]["content"]
        self.assertIn("Total rows: 1000", user_prompt)
        self.assertIn("omittedFieldCount", user_prompt)
        self.assertNotIn("telemetry_119", user_prompt)
        self.assertLess(len(user_prompt), 3600)
        self.assertEqual(captured["kwargs"]["max_tokens"], 360)
        self.assertIn("1,000건", text)


if __name__ == "__main__":
    unittest.main()

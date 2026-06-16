import unittest
from unittest.mock import patch

from app.orchestrate import AgentRuntimeError, _choose_api


class IntentRoutingTest(unittest.IsolatedAsyncioTestCase):
    async def test_llm_null_classification_is_final(self) -> None:
        async def llm_general(message, history=None):
            return {"api_id": None, "confidence": 0.91, "reason": "greeting"}

        with (
            patch("app.orchestrate.is_llm_available", return_value=True),
            patch("app.orchestrate.classify_equipment_intent_with_llm", llm_general),
        ):
            api_id, source = await _choose_api("장비 상태 보여줘")

        self.assertIsNone(api_id)
        self.assertEqual(source, "llm")

    async def test_llm_failure_raises_without_rule_fallback(self) -> None:
        async def llm_unavailable(message, history=None):
            return None

        with (
            patch("app.orchestrate.is_llm_available", return_value=True),
            patch("app.orchestrate.classify_equipment_intent_with_llm", llm_unavailable),
        ):
            with self.assertRaises(AgentRuntimeError):
                await _choose_api("장비 상태 보여줘")

    async def test_missing_llm_configuration_raises_without_rule_fallback(self) -> None:
        with patch("app.orchestrate.is_llm_available", return_value=False):
            with self.assertRaises(AgentRuntimeError):
                await _choose_api("장비 상태 보여줘")


if __name__ == "__main__":
    unittest.main()

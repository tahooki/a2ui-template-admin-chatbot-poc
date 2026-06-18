import json
import unittest
from unittest.mock import patch

from app.ai.llm_client import LLMClientError
from app.orchestrate import AgentRuntimeError, _choose_api
from app.orchestrate import stream_chat_turn


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

    async def test_stream_error_includes_llm_failure_details(self) -> None:
        async def llm_error(message, history=None):
            raise LLMClientError(
                "intent_classification",
                "LLM request returned a non-success response.",
                status_code=401,
                response_body='{"error":"invalid_api_key"}',
            )

        with (
            patch("app.orchestrate.is_llm_available", return_value=True),
            patch("app.orchestrate.classify_equipment_intent_with_llm", llm_error),
        ):
            with self.assertLogs("uvicorn.error", level="ERROR") as logs:
                chunks = [chunk async for chunk in stream_chat_turn("장비 상태 보여줘")]

        error_chunk = next(chunk for chunk in chunks if chunk.startswith("event: error"))
        payload = json.loads(error_chunk.split("data: ", 1)[1])
        self.assertEqual(payload["errorType"], "AgentRuntimeError")
        self.assertIn("LLM intent classification failed", payload["details"])
        self.assertIn("status=401", payload["details"])
        self.assertIn("invalid_api_key", payload["details"])
        self.assertIn("chat stream failed", "\n".join(logs.output))
        self.assertIn("status=401", "\n".join(logs.output))


if __name__ == "__main__":
    unittest.main()

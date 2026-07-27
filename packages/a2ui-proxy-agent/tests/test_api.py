import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


async def fake_chat_stream(*_args, **_kwargs):
    yield 'event: done\ndata: {"mode":"text"}\n\n'


class ApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_health_does_not_expose_internal_addresses(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertNotIn("mainAgentUrl", body)
        self.assertNotIn("openaiModel", body)
        self.assertIn("selectionMaxEntries", body)

    def test_cors_allows_configured_chatbot_origin(self) -> None:
        origin = settings.allowed_origins[0]
        response = self.client.options(
            "/chat/stream",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,accept",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("access-control-allow-origin"),
            origin,
        )

    def test_chat_log_contains_lengths_not_request_body(self) -> None:
        with (
            patch("app.main.stream_chat_turn", fake_chat_stream),
            patch("app.main.log_flow") as flow_log,
        ):
            response = self.client.post(
                "/chat/stream",
                json={
                    "message": "장비 보여줘",
                    "history": [
                        {
                            "role": "user",
                            "content": "이전 질문",
                        }
                    ],
                },
            )
        self.assertEqual(response.status_code, 200)
        result = flow_log.call_args.kwargs["result"]
        self.assertEqual(result["messageLength"], 6)
        self.assertEqual(result["historyCount"], 1)
        self.assertNotIn("rawRequestBody", result)
        self.assertNotIn("message", result)
        self.assertNotIn("history", result)


if __name__ == "__main__":
    unittest.main()

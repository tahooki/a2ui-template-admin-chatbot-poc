import unittest

from app.flow_logging import (
    flow_json,
    redact_flow_value,
    summarize_flow_value,
)


class FlowLoggingTest(unittest.TestCase):
    def test_masks_sensitive_values_but_keeps_business_values(
        self,
    ) -> None:
        redacted = redact_flow_value(
            {
                "query": "장비 목록",
                "data": {
                    "name": "장비 1",
                    "email": "hidden@example.com",
                    "apiKey": "secret-key",
                    "nested": {
                        "authorization": "Bearer secret"
                    },
                },
            }
        )

        self.assertEqual(redacted["query"], "장비 목록")
        self.assertEqual(
            redacted["data"]["name"],
            "장비 1",
        )
        self.assertEqual(
            redacted["data"]["email"],
            "[masked]",
        )
        self.assertEqual(
            redacted["data"]["apiKey"],
            "[masked]",
        )
        self.assertEqual(
            redacted["data"]["nested"][
                "authorization"
            ],
            "[masked]",
        )

    def test_marks_truncated_flow_logs(self) -> None:
        serialized = flow_json(
            {"rows": [{"description": "x" * 1000}]},
            max_chars=100,
        )
        self.assertIn("<truncated", serialized)
        self.assertLess(len(serialized), 160)

    def test_default_summary_omits_request_and_data_payloads(
        self,
    ) -> None:
        summary = summarize_flow_value(
            {
                "rawRequestBody": '{"apiKey":"secret"}',
                "data": {"name": "장비 1"},
                "apiId": "equipment-status",
                "templateId": "matrix.table",
            }
        )
        self.assertEqual(
            summary,
            {
                "apiId": "equipment-status",
                "templateId": "matrix.table",
            },
        )


if __name__ == "__main__":
    unittest.main()

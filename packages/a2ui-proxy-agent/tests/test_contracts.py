import unittest

from pydantic import ValidationError

from app.contracts import ChatRequest, DisplaySelectionRequest


class ContractsTest(unittest.TestCase):
    def test_normalizes_supported_history(self) -> None:
        request = ChatRequest(
            message=" 장비를 보여줘 ",
            history=[
                {
                    "role": "user",
                    "content": "이전 질문",
                    "ignored": "value",
                }
            ],
        )
        self.assertEqual(
            request.normalized_message(),
            "장비를 보여줘",
        )
        self.assertEqual(
            request.normalized_history(),
            [
                {
                    "role": "user",
                    "content": "이전 질문",
                }
            ],
        )

    def test_rejects_oversized_or_invalid_input(self) -> None:
        with self.assertRaises(ValidationError):
            ChatRequest(message="x" * 8_001)
        with self.assertRaises(ValidationError):
            ChatRequest(
                message="hello",
                history=[
                    {
                        "role": "invalid",
                        "content": "value",
                    }
                ],
            )
        with self.assertRaises(ValidationError):
            DisplaySelectionRequest(
                selectionId="x" * 201,
                templateId="matrix.table",
            )


if __name__ == "__main__":
    unittest.main()

import json
import unittest

import httpx

from app.ai_planner import (
    AIPlannerError,
    ProxyAIPlanner,
    validate_chat_route,
    validate_mapping,
    validate_recommendation,
)
from app.derived_schema import (
    build_derived_schema,
    build_sample_data_preview,
)
from app.static_templates import STATIC_TEMPLATE_IDS


def schema_fixture() -> tuple[dict, dict]:
    data = {
        "items": [
            {
                "id": "eq-1",
                "name": "장비 1",
                "description": "프레스",
                "imageUrl": "/images/press.svg",
                "status": "RUNNING",
                "location": "A동",
            }
        ]
    }
    preview = build_sample_data_preview(data)
    return (
        build_derived_schema(
            data,
            sample_data_preview=preview,
        ),
        preview,
    )


def recommendation_fixture() -> dict:
    candidates = []
    for template_id in STATIC_TEMPLATE_IDS:
        selected = template_id == "matrix.table"
        candidates.append(
            {
                "templateId": template_id,
                "decision": (
                    "select" if selected else "reject"
                ),
                "score": 0.95 if selected else 0.5,
                "schemaFit": 0.95 if selected else 0.6,
                "intentFit": 0.9 if selected else 0.4,
                "reason": f"{template_id} 평가",
            }
        )
    return {
        "selectedTemplateId": "matrix.table",
        "reason": "다중 컬럼 비교에 적합합니다.",
        "candidates": candidates,
    }


class AIPlannerValidationTest(unittest.TestCase):
    def test_chat_route_must_match_presentation_mode(self) -> None:
        general = {
            "intent": "general",
            "shouldUseA2UI": False,
            "reason": "일반 대화입니다.",
            "responseText": "안녕하세요!",
        }
        self.assertEqual(
            validate_chat_route(
                general,
                presentation_mode="a2ui",
            ),
            general,
        )
        invalid = {
            "intent": "work-items",
            "shouldUseA2UI": True,
            "reason": "워크 아이템 요청입니다.",
            "responseText": "",
        }
        with self.assertRaises(AIPlannerError):
            validate_chat_route(
                invalid,
                presentation_mode="text",
            )

    def test_recommendation_requires_all_three_candidates(self) -> None:
        result = recommendation_fixture()
        self.assertEqual(
            validate_recommendation(result),
            result,
        )
        result["candidates"] = result["candidates"][:2]
        with self.assertRaises(AIPlannerError):
            validate_recommendation(result)

    def test_recommendation_requires_selected_highest_score(self) -> None:
        result = recommendation_fixture()
        result["candidates"][1]["score"] = 1
        with self.assertRaises(AIPlannerError):
            validate_recommendation(result)

    def test_mapping_rejects_unknown_paths(self) -> None:
        schema, _preview = schema_fixture()
        with self.assertRaises(AIPlannerError):
            validate_mapping(
                {
                    "selectedTemplateId": "collection.list",
                    "reason": "매핑",
                    "titleSourcePath": "items.unknown",
                    "contentSourcePath": None,
                    "imageSourcePath": None,
                    "categorySourcePath": None,
                    "statusSourcePath": None,
                    "fieldSourcePaths": [],
                },
                template_id="collection.list",
                derived_schema=schema,
            )

    def test_table_mapping_requires_two_non_title_columns(self) -> None:
        schema, _preview = schema_fixture()
        with self.assertRaises(AIPlannerError):
            validate_mapping(
                {
                    "selectedTemplateId": "matrix.table",
                    "reason": "매핑",
                    "titleSourcePath": "items.name",
                    "contentSourcePath": None,
                    "imageSourcePath": None,
                    "categorySourcePath": None,
                    "statusSourcePath": "items.status",
                    "fieldSourcePaths": ["items.id"],
                },
                template_id="matrix.table",
                derived_schema=schema,
            )


class ProxyAIPlannerTest(unittest.IsolatedAsyncioTestCase):
    async def test_routes_general_and_work_item_messages(
        self,
    ) -> None:
        requests: list[dict] = []

        async def handler(
            request: httpx.Request,
        ) -> httpx.Response:
            payload = json.loads(request.content)
            requests.append(payload)
            prompt = json.loads(
                payload["messages"][1]["content"]
            )
            work_items = "워크 아이템" in prompt["message"]
            result = {
                "intent": (
                    "work-items" if work_items else "general"
                ),
                "shouldUseA2UI": (
                    work_items
                    and prompt["presentationMode"] == "a2ui"
                ),
                "reason": (
                    "워크 아이템 요청입니다."
                    if work_items
                    else "일반 대화입니다."
                ),
                "responseText": (
                    "안녕하세요! 무엇을 도와드릴까요?"
                    if not work_items
                    else ""
                ),
            }
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {
                                "content": json.dumps(
                                    result,
                                    ensure_ascii=False,
                                )
                            },
                        }
                    ]
                },
            )

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            planner = ProxyAIPlanner(
                api_key="test-key",
                base_url="https://openai.test/v1",
                client=client,
            )
            general = await planner.route_chat(
                message="안녕",
                history=[],
                presentation_mode="a2ui",
            )
            work_items = await planner.route_chat(
                message="워크 아이템을 표로 보여줘",
                history=[],
                presentation_mode="a2ui",
            )
            work_items_text = await planner.route_chat(
                message="워크 아이템을 알려줘",
                history=[],
                presentation_mode="text",
            )

        self.assertEqual(general["intent"], "general")
        self.assertFalse(general["shouldUseA2UI"])
        self.assertEqual(work_items["intent"], "work-items")
        self.assertTrue(work_items["shouldUseA2UI"])
        self.assertFalse(work_items_text["shouldUseA2UI"])
        self.assertEqual(len(requests), 3)
        self.assertTrue(
            all(request["max_tokens"] == 800 for request in requests)
        )
        self.assertTrue(
            all(
                "response_format" not in request
                for request in requests
            )
        )

    async def test_missing_api_key_fails_without_static_fallback(
        self,
    ) -> None:
        schema, preview = schema_fixture()
        planner = ProxyAIPlanner(api_key="")
        with self.assertRaises(AIPlannerError):
            await planner.recommend(
                query="장비 보여줘",
                api_id="equipment-status",
                derived_schema=schema,
                sample_data_preview=preview,
            )

    async def test_calls_openai_without_response_format_for_both_stages(
        self,
    ) -> None:
        schema, preview = schema_fixture()
        requests: list[dict] = []

        async def handler(
            request: httpx.Request,
        ) -> httpx.Response:
            payload = json.loads(request.content)
            requests.append(payload)
            prompt = json.loads(
                payload["messages"][1]["content"]
            )
            if "templates" in prompt:
                result = recommendation_fixture()
            else:
                result = {
                    "selectedTemplateId": "matrix.table",
                    "reason": "테이블 슬롯에 필드를 매핑했습니다.",
                    "titleSourcePath": "items.name",
                    "contentSourcePath": None,
                    "imageSourcePath": None,
                    "categorySourcePath": "items.location",
                    "statusSourcePath": "items.status",
                    "fieldSourcePaths": [
                        "items.id",
                        "items.status",
                        "items.location",
                    ],
                }
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(
                                    result,
                                    ensure_ascii=False,
                                )
                            }
                        }
                    ]
                },
            )

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            planner = ProxyAIPlanner(
                api_key="test-key",
                model="test-model",
                base_url="https://openai.test/v1",
                client=client,
            )
            selection = await planner.recommend(
                query="장비를 테이블로 보여줘",
                api_id="equipment-status",
                derived_schema=schema,
                sample_data_preview=preview,
            )
            mapping = await planner.map_fields(
                query="장비를 테이블로 보여줘",
                api_id="equipment-status",
                template_id="matrix.table",
                derived_schema=schema,
                sample_data_preview=preview,
            )

        self.assertEqual(
            selection["selectedTemplateId"],
            "matrix.table",
        )
        self.assertEqual(
            mapping["titleSourcePath"],
            "items.name",
        )
        self.assertEqual(len(requests), 2)
        self.assertTrue(
            all(
                "response_format" not in request
                for request in requests
            )
        )
        self.assertTrue(
            all(request["max_tokens"] == 6000 for request in requests)
        )
        selection_prompt = json.loads(
            requests[0]["messages"][1]["content"]
        )
        self.assertEqual(
            len(selection_prompt["templates"]),
            3,
        )
        self.assertEqual(
            selection_prompt["outputJsonSchema"]["type"],
            "object",
        )
        self.assertIn(
            "Return exactly one JSON object",
            requests[0]["messages"][0]["content"],
        )
        mapping_prompt = json.loads(
            requests[1]["messages"][1]["content"]
        )
        self.assertEqual(
            mapping_prompt["outputJsonSchema"]["type"],
            "object",
        )

    async def test_accepts_text_array_and_json_code_fence(
        self,
    ) -> None:
        schema, preview = schema_fixture()
        result = recommendation_fixture()

        async def handler(
            _request: httpx.Request,
        ) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {
                                "content": [
                                    {
                                        "type": "text",
                                        "text": (
                                            "```json\n"
                                            + json.dumps(
                                                result,
                                                ensure_ascii=False,
                                            )
                                            + "\n```"
                                        ),
                                    }
                                ]
                            },
                        }
                    ]
                },
            )

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            planner = ProxyAIPlanner(
                api_key="test-key",
                base_url="https://openai.test/v1",
                client=client,
            )
            selection = await planner.recommend(
                query="장비 보여줘",
                api_id="equipment-status",
                derived_schema=schema,
                sample_data_preview=preview,
            )

        self.assertEqual(
            selection["selectedTemplateId"],
            "matrix.table",
        )

    async def test_extracts_json_object_from_wrapped_text(
        self,
    ) -> None:
        schema, preview = schema_fixture()
        result = recommendation_fixture()

        async def handler(
            _request: httpx.Request,
        ) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {
                                "content": (
                                    "structured result follows:\n"
                                    + json.dumps(
                                        result,
                                        ensure_ascii=False,
                                    )
                                    + "\nend"
                                )
                            },
                        }
                    ]
                },
            )

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            planner = ProxyAIPlanner(
                api_key="test-key",
                base_url="https://openai.test/v1",
                client=client,
            )
            selection = await planner.recommend(
                query="장비 보여줘",
                api_id="equipment-status",
                derived_schema=schema,
                sample_data_preview=preview,
            )

        self.assertEqual(
            selection["selectedTemplateId"],
            "matrix.table",
        )

    async def test_retries_when_first_response_is_not_valid_json(
        self,
    ) -> None:
        schema, preview = schema_fixture()
        result = recommendation_fixture()
        request_count = 0

        async def handler(
            _request: httpx.Request,
        ) -> httpx.Response:
            nonlocal request_count
            request_count += 1
            content = (
                "not-json"
                if request_count == 1
                else json.dumps(result, ensure_ascii=False)
            )
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {"content": content},
                        }
                    ]
                },
            )

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            planner = ProxyAIPlanner(
                api_key="test-key",
                base_url="https://openai.test/v1",
                client=client,
            )
            selection = await planner.recommend(
                query="장비 보여줘",
                api_id="equipment-status",
                derived_schema=schema,
                sample_data_preview=preview,
            )

        self.assertEqual(request_count, 2)
        self.assertEqual(
            selection["selectedTemplateId"],
            "matrix.table",
        )

    async def test_reports_token_truncated_response(
        self,
    ) -> None:
        schema, preview = schema_fixture()

        async def handler(
            _request: httpx.Request,
        ) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "finish_reason": "length",
                            "message": {
                                "content": '{"selectedTemplateId":'
                            },
                        }
                    ]
                },
            )

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            planner = ProxyAIPlanner(
                api_key="test-key",
                base_url="https://openai.test/v1",
                client=client,
            )
            with self.assertRaisesRegex(
                AIPlannerError,
                "finish_reason=length",
            ):
                await planner.recommend(
                    query="장비 보여줘",
                    api_id="equipment-status",
                    derived_schema=schema,
                    sample_data_preview=preview,
                )

    async def test_reports_responses_api_shape_from_gateway(
        self,
    ) -> None:
        schema, preview = schema_fixture()

        async def handler(
            _request: httpx.Request,
        ) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "object": "response",
                    "output": [],
                },
            )

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            planner = ProxyAIPlanner(
                api_key="test-key",
                base_url="https://openai.test/v1",
                client=client,
            )
            with self.assertRaisesRegex(
                AIPlannerError,
                "Responses API 형태",
            ):
                await planner.recommend(
                    query="장비 보여줘",
                    api_id="equipment-status",
                    derived_schema=schema,
                    sample_data_preview=preview,
                )


if __name__ == "__main__":
    unittest.main()

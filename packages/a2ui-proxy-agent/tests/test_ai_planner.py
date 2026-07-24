import json
import unittest

import httpx

from app.ai_planner import (
    AIPlannerError,
    ProxyAIPlanner,
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

    async def test_calls_openai_with_strict_schema_for_both_stages(
        self,
    ) -> None:
        schema, preview = schema_fixture()
        requests: list[dict] = []

        async def handler(
            request: httpx.Request,
        ) -> httpx.Response:
            payload = json.loads(request.content)
            requests.append(payload)
            schema_name = payload["response_format"][
                "json_schema"
            ]["name"]
            if schema_name == "a2ui_template_selection":
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
                request["response_format"]["json_schema"][
                    "strict"
                ]
                for request in requests
            )
        )
        selection_prompt = json.loads(
            requests[0]["messages"][1]["content"]
        )
        self.assertEqual(
            len(selection_prompt["templates"]),
            3,
        )


if __name__ == "__main__":
    unittest.main()

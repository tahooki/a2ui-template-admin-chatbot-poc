import unittest

from app.derived_schema import (
    build_derived_schema,
    build_sample_data_preview,
)
from app.static_templates import STATIC_TEMPLATE_IDS
from app.surface_builder import (
    SurfaceBuildError,
    build_surface,
    normalize_data,
)


def recommendation(
    selected_template_id: str = "matrix.table",
) -> dict:
    candidates = []
    for template_id in STATIC_TEMPLATE_IDS:
        selected = template_id == selected_template_id
        candidates.append(
            {
                "templateId": template_id,
                "decision": (
                    "select" if selected else "reject"
                ),
                "score": 0.9 if selected else 0.5,
                "schemaFit": 0.9 if selected else 0.6,
                "intentFit": 0.9 if selected else 0.4,
                "reason": f"{template_id} 평가",
            }
        )
    return {
        "selectedTemplateId": selected_template_id,
        "reason": "AI가 데이터 스키마와 요청을 비교했습니다.",
        "candidates": candidates,
    }


class SurfaceBuilderTest(unittest.TestCase):
    def setUp(self) -> None:
        self.data = {
            "rows": [
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
        preview = build_sample_data_preview(
            self.data,
            source_id="equipment-status",
        )
        self.schema = build_derived_schema(
            self.data,
            source_id="equipment-status",
            sample_data_preview=preview,
        )

    def test_normalizes_supported_row_shapes(self) -> None:
        fixtures = [
            ([{"name": "A"}], "$"),
            ({"items": [{"name": "A"}]}, "items"),
            ({"rows": [{"name": "A"}]}, "rows"),
            (
                {
                    "result": {
                        "data": {
                            "list": [{"name": "A"}]
                        }
                    }
                },
                "result.data.list",
            ),
        ]

        for raw_data, expected_path in fixtures:
            with self.subTest(expected_path=expected_path):
                normalized = normalize_data(raw_data)
                self.assertEqual(
                    normalized.source_array_path,
                    expected_path,
                )
                self.assertEqual(
                    normalized.canonical_data["items"],
                    [{"name": "A"}],
                )
                self.assertEqual(normalized.row_count, 1)

    def test_normalizes_arbitrary_primary_array_path(self) -> None:
        normalized = normalize_data(
            {
                "response": {
                    "records": [{"name": "A"}]
                }
            },
            primary_array_path="response.records",
        )
        self.assertEqual(
            normalized.source_array_path,
            "response.records",
        )

    def test_rejects_empty_and_primitive_data(self) -> None:
        for raw_data in ([], [1, 2], "value"):
            with self.subTest(raw_data=raw_data):
                with self.assertRaises(SurfaceBuildError):
                    normalize_data(raw_data)

    def test_builds_all_three_surfaces_from_ai_mapping(self) -> None:
        mappings = {
            "collection.list": {
                "selectedTemplateId": "collection.list",
                "reason": "제목과 설명을 목록 슬롯에 매핑했습니다.",
                "titleSourcePath": "rows.name",
                "contentSourcePath": "rows.description",
                "imageSourcePath": None,
                "categorySourcePath": "rows.location",
                "statusSourcePath": "rows.status",
                "fieldSourcePaths": [],
            },
            "collection.cardGrid": {
                "selectedTemplateId": "collection.cardGrid",
                "reason": "이미지를 카드 슬롯에 매핑했습니다.",
                "titleSourcePath": "rows.name",
                "contentSourcePath": "rows.description",
                "imageSourcePath": "rows.imageUrl",
                "categorySourcePath": "rows.location",
                "statusSourcePath": "rows.status",
                "fieldSourcePaths": [],
            },
            "matrix.table": {
                "selectedTemplateId": "matrix.table",
                "reason": "비교 컬럼을 테이블 슬롯에 매핑했습니다.",
                "titleSourcePath": "rows.name",
                "contentSourcePath": None,
                "imageSourcePath": None,
                "categorySourcePath": None,
                "statusSourcePath": "rows.status",
                "fieldSourcePaths": [
                    "rows.id",
                    "rows.status",
                    "rows.location",
                ],
            },
        }

        for template_id in STATIC_TEMPLATE_IDS:
            with self.subTest(template_id=template_id):
                surface = build_surface(
                    template_id=template_id,
                    query="장비를 보여줘",
                    api_id="equipment-status",
                    data=self.data,
                    derived_schema=self.schema,
                    ai_recommendation=recommendation(
                        template_id
                    ),
                    ai_mapping=mappings[template_id],
                    metadata={"sourceDataHash": "hash-1"},
                )
                render_plan = surface["payload"][
                    "renderPlan"
                ]
                self.assertEqual(
                    surface["templateId"],
                    template_id,
                )
                self.assertEqual(
                    render_plan["strategy"],
                    "proxy_ai_schema_planner",
                )
                self.assertEqual(
                    render_plan["fieldMapping"]["title"],
                    "items[].title",
                )
                self.assertEqual(
                    surface["payload"]["data"]["items"][
                        0
                    ]["title"],
                    "장비 1",
                )
                self.assertEqual(
                    surface["meta"]["sourceDataHash"],
                    "hash-1",
                )
                self.assertIn(
                    "planner:proxy-openai-slot-mapping",
                    surface["meta"]["trace"],
                )
                self.assertTrue(
                    all(
                        "examples" not in field
                        for field in surface["meta"][
                            "derivedSchema"
                        ]["fields"]
                    )
                )

        table = build_surface(
            template_id="matrix.table",
            query="장비를 보여줘",
            api_id="equipment-status",
            data=self.data,
            derived_schema=self.schema,
            ai_recommendation=recommendation(
                "matrix.table"
            ),
            ai_mapping=mappings["matrix.table"],
        )
        self.assertEqual(
            table["payload"]["renderPlan"]["fieldMapping"][
                "fields"
            ],
            [
                "items[].id",
                "items[].status",
                "items[].location",
            ],
        )

    def test_card_mapping_can_omit_optional_image(self) -> None:
        data = {
            "items": [
                {"title": "작업 1", "status": "queued"}
            ]
        }
        preview = build_sample_data_preview(data)
        schema = build_derived_schema(
            data,
            sample_data_preview=preview,
        )
        surface = build_surface(
            template_id="collection.cardGrid",
            query="카드로 보여줘",
            api_id="work-items",
            data=data,
            derived_schema=schema,
            ai_recommendation=recommendation(
                "collection.cardGrid"
            ),
            ai_mapping={
                "selectedTemplateId": "collection.cardGrid",
                "reason": "이미지가 없어 제목과 상태만 매핑했습니다.",
                "titleSourcePath": "items.title",
                "contentSourcePath": None,
                "imageSourcePath": None,
                "categorySourcePath": None,
                "statusSourcePath": "items.status",
                "fieldSourcePaths": [],
            },
        )
        mapping = surface["payload"]["renderPlan"][
            "fieldMapping"
        ]
        self.assertEqual(mapping["title"], "items[].title")
        self.assertNotIn("image", mapping)

    def test_rejects_unknown_template(self) -> None:
        with self.assertRaises(SurfaceBuildError):
            build_surface(
                template_id="record.detail",
                query="상세",
                api_id="equipment-status",
                data=self.data,
                derived_schema=self.schema,
                ai_recommendation=recommendation(),
                ai_mapping={},
            )


if __name__ == "__main__":
    unittest.main()

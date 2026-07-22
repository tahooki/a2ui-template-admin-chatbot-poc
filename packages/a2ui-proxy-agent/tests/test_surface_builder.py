import unittest

from app.surface_builder import (
    SurfaceBuildError,
    build_surface,
    display_options,
    normalize_data,
    profile_data,
)


class SurfaceBuilderTest(unittest.TestCase):
    def test_normalizes_supported_row_shapes(self) -> None:
        fixtures = [
            ([{"name": "A"}], "$"),
            ({"items": [{"name": "A"}]}, "items"),
            ({"rows": [{"name": "A"}]}, "rows"),
            ({"result": {"data": {"list": [{"name": "A"}]}}}, "result.data.list"),
        ]

        for raw_data, expected_path in fixtures:
            with self.subTest(expected_path=expected_path):
                normalized = normalize_data(raw_data)
                self.assertEqual(normalized.source_array_path, expected_path)
                self.assertEqual(normalized.canonical_data["items"], [{"name": "A"}])
                self.assertEqual(normalized.row_count, 1)

    def test_wraps_a_single_object_as_one_row(self) -> None:
        normalized = normalize_data({"name": "A", "status": "RUNNING"})
        self.assertEqual(normalized.source_array_path, "$")
        self.assertEqual(normalized.row_count, 1)

    def test_rejects_empty_and_primitive_data(self) -> None:
        for raw_data in ([], [1, 2], "value"):
            with self.subTest(raw_data=raw_data):
                with self.assertRaises(SurfaceBuildError):
                    normalize_data(raw_data)

    def test_profiles_known_fields_and_ignores_nested_table_values(self) -> None:
        profile = profile_data(
            {
                "items": [
                    {
                        "id": "eq-1",
                        "name": "장비 1",
                        "description": "프레스",
                        "imageUrl": "/press.svg",
                        "status": "RUNNING",
                        "nested": {"secret": True},
                    }
                ]
            }
        )
        self.assertEqual(profile.title_key, "name")
        self.assertEqual(profile.content_key, "description")
        self.assertEqual(profile.image_key, "imageUrl")
        self.assertEqual(profile.status_key, "status")
        self.assertNotIn("nested", profile.scalar_keys)

    def test_falls_back_to_first_string_for_title(self) -> None:
        profile = profile_data({"items": [{"code": 7, "caption": "장비 A"}]})
        self.assertEqual(profile.title_key, "caption")

    def test_returns_exactly_three_options_with_one_recommendation(self) -> None:
        data = {"items": [{"name": "A", "status": "RUNNING", "location": "A동", "count": 3}]}
        options = display_options("장비를 보여줘", data)
        self.assertEqual(len(options), 3)
        self.assertEqual(options[0]["templateId"], "matrix.table")
        self.assertEqual(sum(option["recommended"] for option in options), 1)

    def test_recommendation_prefers_explicit_query_then_image_then_simple_list(self) -> None:
        image_data = {"items": [{"name": "A", "imageUrl": "/a.svg", "description": "설명"}]}
        simple_data = {"items": [{"name": "A", "status": "RUNNING"}]}

        self.assertEqual(display_options("테이블로 보여줘", image_data)[0]["templateId"], "matrix.table")
        self.assertEqual(display_options("보여줘", image_data)[0]["templateId"], "collection.cardGrid")
        self.assertEqual(display_options("보여줘", simple_data)[0]["templateId"], "collection.list")

    def test_builds_all_three_browser_compatible_surfaces(self) -> None:
        data = {
            "rows": [
                {
                    "id": "eq-1",
                    "name": "장비 1",
                    "description": "프레스",
                    "imageUrl": "/press.svg",
                    "status": "RUNNING",
                }
            ]
        }
        for template_id in ("collection.list", "collection.cardGrid", "matrix.table"):
            with self.subTest(template_id=template_id):
                surface = build_surface(
                    template_id=template_id,
                    query="장비를 보여줘",
                    api_id="equipment-status",
                    data=data,
                    metadata={"sourceDataHash": "hash-1"},
                )
                payload = surface["payload"]
                self.assertEqual(surface["templateId"], template_id)
                self.assertEqual(payload["profile"]["rowCount"], 1)
                self.assertEqual(payload["renderPlan"]["viewType"], template_id)
                self.assertTrue(payload["renderPlan"]["fieldMapping"]["title"])
                self.assertEqual(surface["meta"]["sourceDataHash"], "hash-1")

        table = build_surface(
            template_id="matrix.table",
            query="장비를 보여줘",
            api_id="equipment-status",
            data=data,
        )
        self.assertNotIn("items[].nested", table["payload"]["renderPlan"]["fieldMapping"]["fields"])

    def test_builds_card_without_image_mapping(self) -> None:
        surface = build_surface(
            template_id="collection.cardGrid",
            query="카드로 보여줘",
            api_id="work-items",
            data={"items": [{"title": "작업 1", "status": "queued"}]},
        )
        mapping = surface["payload"]["renderPlan"]["fieldMapping"]
        self.assertEqual(mapping["title"], "items[].title")
        self.assertNotIn("image", mapping)

    def test_rejects_unknown_template(self) -> None:
        with self.assertRaises(SurfaceBuildError):
            build_surface(
                template_id="record.detail",
                query="상세",
                api_id="equipment-status",
                data={"items": [{"name": "A"}]},
            )


if __name__ == "__main__":
    unittest.main()

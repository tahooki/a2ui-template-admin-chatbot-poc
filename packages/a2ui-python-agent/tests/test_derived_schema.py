import unittest

from app.schema import build_derived_schema, build_sample_data_preview


class DerivedSchemaTest(unittest.TestCase):
    def test_preview_preserves_original_row_count(self) -> None:
        data = {
            "items": [{"id": str(index), "name": f"장비 {index}", "imageUrl": "/images/item.svg"} for index in range(44)],
            "total": 44,
            "page": 1,
            "pageSize": 44,
        }

        preview = build_sample_data_preview(data, source_id="equipment-catalog")
        derived = build_derived_schema(data, source_id="equipment-catalog", sample_data_preview=preview)

        self.assertEqual(preview["sampleSize"], 10)
        self.assertEqual(preview["rowCount"], 44)
        self.assertEqual(derived["rowCount"], 44)
        self.assertTrue(derived["capabilities"]["hasImages"])

    def test_status_data_infers_boolean_capabilities(self) -> None:
        data = {
            "items": [
                {
                    "id": "eq-1",
                    "name": "CNC 1",
                    "isOnline": True,
                    "isRunning": False,
                    "hasAlarm": False,
                }
            ],
            "total": 1,
        }

        derived = build_derived_schema(data, source_id="equipment-status")
        field_paths = {field["path"] for field in derived["fields"]}

        self.assertEqual(derived["shape"], "array<object>")
        self.assertIn("items.isOnline", field_paths)
        self.assertTrue(derived["capabilities"]["hasBooleans"])
        self.assertTrue(derived["capabilities"]["hasStatus"])


if __name__ == "__main__":
    unittest.main()

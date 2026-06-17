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

    def test_large_rows_are_bounded_in_preview(self) -> None:
        data = {
            "items": [{"id": f"eq-{index}", "name": f"장비 {index}", "isOnline": index % 2 == 0} for index in range(1000)],
            "total": 1000,
        }

        preview = build_sample_data_preview(data, source_id="large-equipment-status")
        derived = build_derived_schema(data, source_id="large-equipment-status", sample_data_preview=preview)

        self.assertEqual(preview["sampleSize"], 10)
        self.assertEqual(preview["rowCount"], 1000)
        self.assertTrue(preview["truncated"])
        self.assertEqual(derived["rowCount"], 1000)

    def test_wide_columns_build_schema_without_crashing(self) -> None:
        row = {
            "id": "eq-1",
            "name": "CNC 1",
            "isOnline": True,
            "isRunning": False,
            "hasAlarm": False,
        }
        row.update({f"metric_{index:03d}": index for index in range(120)})
        data = {"items": [row], "total": 1}

        derived = build_derived_schema(data, source_id="wide-equipment-status")
        field_keys = {field["key"] for field in derived["fields"]}

        self.assertIn("metric_119", field_keys)
        self.assertGreaterEqual(len(derived["fields"]), 120)
        self.assertTrue(derived["capabilities"]["hasNumericMetrics"])

    def test_preview_masks_sensitive_fields_without_changing_row_count(self) -> None:
        data = {
            "items": [
                {
                    "id": "eq-1",
                    "name": "CNC 1",
                    "operatorEmail": "operator@example.com",
                    "supportPhone": "010-1111-2222",
                    "apiToken": "secret-token",
                }
            ],
            "total": 1,
        }

        preview = build_sample_data_preview(data, source_id="sensitive-status")
        preview_row = preview["data"]["items"][0]

        self.assertEqual(preview["rowCount"], 1)
        self.assertEqual(preview_row["operatorEmail"], "[masked]")
        self.assertEqual(preview_row["supportPhone"], "[masked]")
        self.assertEqual(preview_row["apiToken"], "[masked]")
        self.assertIn("items.0.operatorEmail", preview["maskedFields"])


if __name__ == "__main__":
    unittest.main()

import unittest

from app.data_integrity import build_data_integrity_snapshot, compare_data_integrity


class DataIntegrityTest(unittest.TestCase):
    def test_hash_is_stable_for_object_key_order(self) -> None:
        left = {"items": [{"id": "eq-1", "name": "CNC"}], "total": 1}
        right = {"total": 1, "items": [{"name": "CNC", "id": "eq-1"}]}

        self.assertEqual(build_data_integrity_snapshot(left)["dataHash"], build_data_integrity_snapshot(right)["dataHash"])

    def test_snapshot_records_rows_bytes_and_shape(self) -> None:
        snapshot = build_data_integrity_snapshot({"items": [{"id": "eq-1"}, {"id": "eq-2"}], "total": 7})

        self.assertEqual(snapshot["rowCount"], 7)
        self.assertEqual(snapshot["shape"], "object{items:array<object>}")
        self.assertGreater(snapshot["byteLength"], 0)
        self.assertIn("items", snapshot["topLevelKeys"])

    def test_snapshot_counts_nested_result_rows(self) -> None:
        snapshot = build_data_integrity_snapshot(
            {
                "result": {
                    "rows": [{"eqp_id": "bulk-1"}, {"eqp_id": "bulk-2"}],
                    "totalCount": 1000,
                },
                "success": True,
            }
        )

        self.assertEqual(snapshot["rowCount"], 1000)
        self.assertEqual(snapshot["shape"], "object{result.rows:array<object>}")
        self.assertIn("result", snapshot["topLevelKeys"])

    def test_detects_missing_row(self) -> None:
        source = {"items": [{"id": "eq-1"}, {"id": "eq-2"}], "total": 2}
        received = {"items": [{"id": "eq-1"}], "total": 1}

        comparison = compare_data_integrity(build_data_integrity_snapshot(source), received)

        self.assertFalse(comparison["matched"])
        self.assertFalse(comparison["hashMatched"])
        self.assertFalse(comparison["rowCountMatched"])

    def test_detects_changed_field_value(self) -> None:
        source = {"items": [{"id": "eq-1", "isOnline": True}], "total": 1}
        received = {"items": [{"id": "eq-1", "isOnline": False}], "total": 1}

        comparison = compare_data_integrity(build_data_integrity_snapshot(source), received)

        self.assertFalse(comparison["matched"])
        self.assertFalse(comparison["hashMatched"])
        self.assertTrue(comparison["rowCountMatched"])

    def test_array_order_is_significant(self) -> None:
        source = {"items": [{"id": "eq-1"}, {"id": "eq-2"}], "total": 2}
        received = {"items": [{"id": "eq-2"}, {"id": "eq-1"}], "total": 2}

        comparison = compare_data_integrity(build_data_integrity_snapshot(source), received)

        self.assertFalse(comparison["matched"])
        self.assertFalse(comparison["hashMatched"])
        self.assertTrue(comparison["rowCountMatched"])


if __name__ == "__main__":
    unittest.main()

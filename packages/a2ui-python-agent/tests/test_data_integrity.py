import unittest

from app.data_integrity import build_data_integrity_snapshot


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


if __name__ == "__main__":
    unittest.main()

import unittest

from app.data_normalization import build_display_data_trace


class DataNormalizationTest(unittest.TestCase):
    def test_canonical_boolean_rows_keep_identity_trace(self) -> None:
        raw = {
            "items": [
                {
                    "id": "EQ-001",
                    "name": "CNC 1",
                    "isOnline": True,
                    "isRunning": False,
                    "hasAlarm": False,
                    "needsInspection": False,
                    "isReserved": False,
                }
            ],
            "total": 1,
        }

        result = build_display_data_trace(raw)

        self.assertFalse(result["trace"]["applied"])
        self.assertEqual(result["trace"]["strategy"], "identity")
        self.assertEqual(result["trace"]["rules"], [])
        self.assertEqual(result["trace"]["sourceDataHash"], result["trace"]["displayDataHash"])

    def test_alias_status_rows_are_normalized_to_canonical_display_data(self) -> None:
        raw = {
            "items": [
                {
                    "eqpId": "EQ-001",
                    "eqpNm": "CNC 1",
                    "opYn": "Y",
                    "runYn": "N",
                    "alrmCnt": 2,
                    "inspReqYn": "N",
                    "lastDtm": "2026-06-17T09:00:00Z",
                }
            ],
            "total": 1,
        }

        result = build_display_data_trace(raw)
        row = result["data"]["items"][0]
        trace = result["trace"]

        self.assertTrue(trace["applied"])
        self.assertEqual(trace["strategy"], "equipment_alias_and_status_code_to_canonical")
        self.assertEqual(row["id"], "EQ-001")
        self.assertEqual(row["name"], "CNC 1")
        self.assertTrue(row["isOnline"])
        self.assertFalse(row["isRunning"])
        self.assertTrue(row["hasAlarm"])
        self.assertFalse(row["needsInspection"])
        self.assertEqual(trace["sourceRowCount"], 1)
        self.assertEqual(trace["displayRowCount"], 1)
        self.assertNotEqual(trace["sourceDataHash"], trace["displayDataHash"])

    def test_default_boolean_status_is_not_reported_as_alias(self) -> None:
        raw = {
            "items": [
                {
                    "id": "EQ-001",
                    "name": "CNC 1",
                    "isOnline": True,
                    "isRunning": False,
                    "hasAlarm": False,
                    "needsInspection": False,
                }
            ],
            "total": 1,
        }

        result = build_display_data_trace(raw)

        self.assertTrue(result["trace"]["applied"])
        self.assertEqual(result["trace"]["strategy"], "equipment_default_status_to_canonical")
        self.assertEqual(result["trace"]["rules"][0]["transform"], "default_false")
        self.assertFalse(result["data"]["items"][0]["isReserved"])

    def test_identity_trace_for_non_item_response(self) -> None:
        raw = {"result": {"rows": [{"eqpId": "EQ-001"}]}}

        result = build_display_data_trace(raw)

        self.assertFalse(result["trace"]["applied"])
        self.assertIs(result["data"], raw)


if __name__ == "__main__":
    unittest.main()

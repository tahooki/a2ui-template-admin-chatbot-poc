import unittest

from app.derived_schema import (
    build_derived_schema,
    build_sample_data_preview,
)


class DerivedSchemaTest(unittest.TestCase):
    def test_builds_roles_capabilities_and_bounded_preview(self) -> None:
        data = {
            "result": {
                "rows": [
                    {
                        "name": "장비 1",
                        "imageUrl": "/images/one.svg",
                        "status": "RUNNING",
                        "count": 3,
                        "email": "hidden@example.com",
                    }
                    for _index in range(20)
                ],
                "total": 20,
                "debug": "x" * 100_000,
            }
        }
        preview = build_sample_data_preview(data)
        schema = build_derived_schema(
            data,
            sample_data_preview=preview,
        )

        self.assertEqual(preview["sampleSize"], 10)
        self.assertTrue(preview["truncated"])
        self.assertLessEqual(preview["byteLength"], 20_000)
        self.assertNotIn(
            "debug",
            preview["data"]["result"],
        )
        self.assertEqual(
            preview["data"]["result"]["rows"][0]["email"],
            "[masked]",
        )
        self.assertEqual(
            schema["primaryArrayPath"],
            "result.rows",
        )
        self.assertTrue(
            schema["capabilities"]["hasImages"]
        )
        self.assertTrue(
            schema["capabilities"]["hasStatus"]
        )
        self.assertTrue(
            schema["capabilities"]["hasNumericMetrics"]
        )
        self.assertIn(
            "result.rows.name",
            {
                field["path"]
                for field in schema["fields"]
            },
        )
        self.assertNotIn(
            "result.rows.email",
            {
                field["path"]
                for field in schema["fields"]
            },
        )


if __name__ == "__main__":
    unittest.main()

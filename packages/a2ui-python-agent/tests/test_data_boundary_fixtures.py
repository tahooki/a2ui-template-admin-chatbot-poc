import unittest

from app.data_boundary_fixtures import data_boundary_fixture, mutation_pair
from app.data_integrity import build_data_integrity_snapshot, compare_data_integrity


class DataBoundaryFixturesTest(unittest.TestCase):
    def test_standard_alias_wide_fixtures_return_business_tool_shape(self) -> None:
        for scenario in ["standard", "alias", "wide_columns"]:
            with self.subTest(scenario=scenario):
                data = data_boundary_fixture(scenario)

                self.assertIsInstance(data["items"], list)
                self.assertGreater(data["total"], 0)
                self.assertEqual(data["page"], 1)
                self.assertEqual(data["pageSize"], len(data["items"]))

    def test_wide_fixture_has_many_columns(self) -> None:
        data = data_boundary_fixture("wide_columns")

        self.assertGreaterEqual(len(data["items"][0].keys()), 120)

    def test_mutation_pair_detects_missing_row(self) -> None:
        source, received = mutation_pair("missing_row")
        comparison = compare_data_integrity(build_data_integrity_snapshot(source), received)

        self.assertFalse(comparison["matched"])
        self.assertFalse(comparison["rowCountMatched"])

    def test_mutation_pair_detects_changed_field(self) -> None:
        source, received = mutation_pair("changed_field")
        comparison = compare_data_integrity(build_data_integrity_snapshot(source), received)

        self.assertFalse(comparison["matched"])
        self.assertFalse(comparison["hashMatched"])
        self.assertTrue(comparison["rowCountMatched"])


if __name__ == "__main__":
    unittest.main()

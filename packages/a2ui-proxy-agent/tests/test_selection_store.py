import unittest

from app.selection_store import SelectionBusyError, SelectionStore


class SelectionStoreTest(unittest.TestCase):
    def test_put_get_and_delete(self) -> None:
        store = SelectionStore(ttl_seconds=30)
        context = store.put(
            query="query",
            api_id="equipment-status",
            data={"items": []},
            metadata={},
            allowed_template_ids=["matrix.table"],
        )
        self.assertEqual(store.get(context.selection_id), context)
        store.delete(context.selection_id)
        self.assertIsNone(store.get(context.selection_id))

    def test_expired_context_is_removed(self) -> None:
        store = SelectionStore(ttl_seconds=-1)
        context = store.put(
            query="query",
            api_id="equipment-status",
            data={"items": [{"name": "장비 1"}]},
            metadata={},
            allowed_template_ids=["matrix.table"],
        )
        self.assertIsNone(store.get(context.selection_id))

    def test_claim_prevents_duplicate_selection_until_release(
        self,
    ) -> None:
        store = SelectionStore(ttl_seconds=30)
        context = store.put(
            query="query",
            api_id="equipment-status",
            data={"items": [{"name": "장비 1"}]},
            metadata={},
            allowed_template_ids=["matrix.table"],
        )
        self.assertEqual(
            store.claim(context.selection_id),
            context,
        )
        with self.assertRaises(SelectionBusyError):
            store.claim(context.selection_id)
        store.release(context.selection_id)
        self.assertEqual(
            store.claim(context.selection_id),
            context,
        )

    def test_capacity_evicts_oldest_available_context(
        self,
    ) -> None:
        store = SelectionStore(
            ttl_seconds=30,
            max_entries=2,
        )
        first = store.put(
            query="first",
            api_id="equipment-status",
            data={"items": []},
            metadata={},
            allowed_template_ids=["matrix.table"],
        )
        second = store.put(
            query="second",
            api_id="equipment-status",
            data={"items": []},
            metadata={},
            allowed_template_ids=["matrix.table"],
        )
        third = store.put(
            query="third",
            api_id="equipment-status",
            data={"items": []},
            metadata={},
            allowed_template_ids=["matrix.table"],
        )
        self.assertIsNone(store.get(first.selection_id))
        self.assertIsNotNone(store.get(second.selection_id))
        self.assertIsNotNone(store.get(third.selection_id))


if __name__ == "__main__":
    unittest.main()

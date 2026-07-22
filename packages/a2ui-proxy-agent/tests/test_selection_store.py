import unittest

from app.selection_store import SelectionStore


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


if __name__ == "__main__":
    unittest.main()

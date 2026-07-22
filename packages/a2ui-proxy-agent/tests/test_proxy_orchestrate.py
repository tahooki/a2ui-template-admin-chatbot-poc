import json
import unittest

from app.orchestrate import stream_chat_turn, stream_display_selection
from app.selection_store import SelectionStore
from app.static_templates import STATIC_TEMPLATE_IDS


def parse_sse_chunk(chunk: str) -> tuple[str, dict]:
    lines = chunk.strip().splitlines()
    event = next(line.removeprefix("event:").strip() for line in lines if line.startswith("event:"))
    data = json.loads(next(line.removeprefix("data:").strip() for line in lines if line.startswith("data:")))
    return event, data


class FakeMainAgentClient:
    def __init__(self, with_data: bool = True) -> None:
        self.with_data = with_data
        self.presentation_modes: list[str] = []

    async def stream_chat(self, *, message, history=None, presentation_mode="a2ui"):
        self.presentation_modes.append(presentation_mode)
        yield "state", {"status": "intent", "label": "equipment-status"}
        yield "text", {"text": "장비 상태 데이터를 조회했습니다."}
        if self.with_data:
            yield "data_result", {
                "query": message,
                "apiId": "equipment-status",
                "sourceToolName": "get_equipment_status",
                "sourceToolResultId": "tool-result-1",
                "data": {
                    "items": [
                        {
                            "id": "eq-1",
                            "name": "장비 1",
                            "description": "프레스",
                            "status": "RUNNING",
                            "location": "A동",
                        },
                        {
                            "id": "eq-2",
                            "name": "장비 2",
                            "description": "펌프",
                            "status": "STOPPED",
                            "location": "B동",
                        },
                    ],
                    "total": 2,
                    "page": 1,
                    "pageSize": 2,
                },
                "metadata": {"sourceDataHash": "hash-1", "sourceRowCount": 2},
            }
        yield "done", {"mode": "data_result" if self.with_data else "text"}


class FakeEmptyDataMainAgentClient:
    async def stream_chat(self, *, message, history=None, presentation_mode="a2ui"):
        yield "text", {"text": "조회 결과가 없습니다."}
        yield "data_result", {
            "query": message,
            "apiId": "equipment-status",
            "data": {"items": []},
            "metadata": {"sourceRowCount": 0},
        }
        yield "done", {"mode": "data_result"}


class FakeFailingMainAgentClient:
    async def stream_chat(self, *, message, history=None, presentation_mode="a2ui"):
        yield "error", {"message": "Main Agent failed"}
        yield "done", {"mode": "error", "branch": "error"}


class ProxyOrchestrateTest(unittest.IsolatedAsyncioTestCase):
    async def test_proxy_keeps_data_result_server_side_and_returns_static_options(self) -> None:
        store = SelectionStore(ttl_seconds=30)
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "장비 상태 보여줘",
                main_agent_client=FakeMainAgentClient(),
                store=store,
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        event_names = [event for event, _data in events]

        self.assertNotIn("data_result", event_names)
        self.assertIn("text", event_names)
        self.assertIn("display_options", event_names)
        self.assertNotIn("surface", event_names)
        options_event = next(data for event, data in events if event == "display_options")
        self.assertEqual(len(options_event["options"]), 3)
        self.assertEqual(
            {option["templateId"] for option in options_event["options"]},
            set(STATIC_TEMPLATE_IDS),
        )
        self.assertEqual(sum(option["recommended"] for option in options_event["options"]), 1)
        self.assertNotIn("장비 1", "".join(chunks))
        self.assertNotIn("hash-1", "".join(chunks))
        self.assertIsNotNone(store.get(options_event["selectionId"]))

    async def test_explicit_display_query_controls_recommendation(self) -> None:
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "장비를 카드로 보여줘",
                main_agent_client=FakeMainAgentClient(),
                store=SelectionStore(ttl_seconds=30),
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        options = next(data["options"] for event, data in events if event == "display_options")
        self.assertEqual(options[0]["templateId"], "collection.cardGrid")
        self.assertTrue(options[0]["recommended"])

    async def test_general_chat_does_not_prepare_templates(self) -> None:
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "안녕",
                main_agent_client=FakeMainAgentClient(with_data=False),
                store=SelectionStore(ttl_seconds=30),
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        self.assertNotIn("display_options", [event for event, _data in events])
        self.assertNotIn("proxy_template_options", [data.get("status") for _event, data in events])

    async def test_empty_data_returns_text_fallback(self) -> None:
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "빈 데이터",
                main_agent_client=FakeEmptyDataMainAgentClient(),
                store=SelectionStore(ttl_seconds=30),
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        self.assertNotIn("display_options", [event for event, _data in events])
        done = next(data for event, data in events if event == "done")
        self.assertEqual(done["mode"], "text_fallback")
        self.assertEqual(done["branch"], "no_template")

    async def test_text_mode_never_prepares_templates_for_data_request(self) -> None:
        store = SelectionStore(ttl_seconds=30)
        main_agent = FakeMainAgentClient()
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "장비 상태 보여줘",
                presentation_mode="text",
                main_agent_client=main_agent,
                store=store,
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        event_names = [event for event, _data in events]

        self.assertIn("text", event_names)
        self.assertNotIn("data_result", event_names)
        self.assertNotIn("display_options", event_names)
        self.assertNotIn("surface", event_names)
        self.assertEqual(main_agent.presentation_modes, ["text"])
        done = next(data for event, data in events if event == "done")
        self.assertEqual(done["mode"], "text")
        self.assertEqual(done["presentationMode"], "text")

    async def test_text_mode_preserves_main_agent_error_completion(self) -> None:
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "장비 상태 보여줘",
                presentation_mode="text",
                main_agent_client=FakeFailingMainAgentClient(),
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        done = next(data for event, data in events if event == "done")

        self.assertEqual(done["mode"], "error")
        self.assertEqual(done["branch"], "error")

    async def test_a2ui_mode_preserves_main_agent_error_completion(self) -> None:
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "장비 상태 보여줘",
                main_agent_client=FakeFailingMainAgentClient(),
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]

        self.assertIn("error", [event for event, _data in events])
        done = next(data for event, data in events if event == "done")
        self.assertEqual(done["mode"], "error")
        self.assertEqual(done["branch"], "error")

    async def test_each_static_template_is_rendered_directly_and_consumes_selection(self) -> None:
        for template_id in STATIC_TEMPLATE_IDS:
            with self.subTest(template_id=template_id):
                store = SelectionStore(ttl_seconds=30)
                context = store.put(
                    query="장비 상태 보여줘",
                    api_id="equipment-status",
                    data={"items": [{"id": "eq-1", "name": "장비 1", "status": "RUNNING"}]},
                    metadata={"sourceDataHash": "hash-1"},
                    allowed_template_ids=list(STATIC_TEMPLATE_IDS),
                )
                chunks = [
                    chunk
                    async for chunk in stream_display_selection(
                        context.selection_id,
                        template_id,
                        store=store,
                    )
                ]
                events = [parse_sse_chunk(chunk) for chunk in chunks]
                surface_event = next(data for event, data in events if event == "surface")
                surface = surface_event["surface"]
                self.assertEqual(surface_event["templateId"], template_id)
                self.assertEqual(surface["templateId"], template_id)
                self.assertEqual(surface["payload"]["profile"]["rowCount"], 1)
                self.assertEqual(surface["payload"]["renderPlan"]["strategy"], "proxy_static_templates")
                self.assertIsNone(store.get(context.selection_id))

    async def test_disallowed_template_is_rejected_without_consuming_selection(self) -> None:
        store = SelectionStore(ttl_seconds=30)
        context = store.put(
            query="장비 상태 보여줘",
            api_id="equipment-status",
            data={"items": [{"name": "장비 1"}]},
            metadata={},
            allowed_template_ids=list(STATIC_TEMPLATE_IDS),
        )
        chunks = [
            chunk
            async for chunk in stream_display_selection(
                context.selection_id,
                "record.detail",
                store=store,
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        self.assertIn("error", [event for event, _data in events])
        self.assertNotIn("surface", [event for event, _data in events])
        self.assertIsNotNone(store.get(context.selection_id))

    async def test_missing_selection_is_rejected(self) -> None:
        chunks = [
            chunk
            async for chunk in stream_display_selection(
                "selection-missing",
                "matrix.table",
                store=SelectionStore(ttl_seconds=30),
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        self.assertIn("error", [event for event, _data in events])
        self.assertNotIn("surface", [event for event, _data in events])


if __name__ == "__main__":
    unittest.main()

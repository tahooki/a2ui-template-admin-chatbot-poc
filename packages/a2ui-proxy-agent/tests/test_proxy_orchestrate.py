import json
import unittest

from app.orchestrate import stream_chat_turn, stream_display_selection
from app.selection_store import SelectionStore


def parse_sse_chunk(chunk: str) -> tuple[str, dict]:
    lines = chunk.strip().splitlines()
    event = next(line.removeprefix("event:").strip() for line in lines if line.startswith("event:"))
    data = json.loads(next(line.removeprefix("data:").strip() for line in lines if line.startswith("data:")))
    return event, data


def completed_surface_task(surface: dict, candidates: list[dict] | None = None) -> dict:
    return {
        "task": {
            "id": "task-1",
            "status": {"state": "TASK_STATE_COMPLETED"},
            "artifacts": [
                {
                    "parts": [
                        {
                            "mediaType": "application/vnd.a2ui.surface+json",
                            "data": {
                                "surface": surface,
                                "decision": {
                                    "strategy": "ai_surface_planner",
                                    "score": 0.92,
                                    "candidates": candidates or [],
                                },
                            },
                        }
                    ]
                }
            ],
        }
    }


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
                        {"id": "eq-1", "title": "장비 1", "name": "장비 1"},
                        {"id": "eq-2", "title": "장비 2", "name": "장비 2"},
                    ],
                    "total": 2,
                    "page": 1,
                    "pageSize": 2,
                },
                "metadata": {"sourceDataHash": "hash-1", "sourceRowCount": 2},
            }
        yield "done", {"mode": "data_result" if self.with_data else "text"}


class FakeA2UIAgentClient:
    def __init__(self) -> None:
        self.recommendation_calls = 0
        self.selected_calls = 0

    async def stream_recommendation(self, *, query, api_id, data, metadata):
        self.recommendation_calls += 1
        yield {
            "progressUpdate": {
                "taskId": "task-1",
                "status": "matcher",
                "label": "템플릿 비교",
                "data": {
                    "mode": "template_selection",
                    "sourceSampleRows": [{"secret": "must-not-reach-browser"}],
                },
            }
        }
        yield completed_surface_task(
            {"templateId": "matrix.table", "payload": {"data": data}},
            [
                {"templateId": "matrix.table", "score": 0.92, "decision": "select", "reason": "best"},
                {"templateId": "collection.list", "score": 0.80, "decision": "reject", "reason": "alternate"},
                {"templateId": "collection.cardGrid", "score": 0.72, "decision": "reject", "reason": "alternate"},
            ],
        )

    async def render_selected(self, *, query, api_id, data, metadata, template_id):
        self.selected_calls += 1
        return completed_surface_task({"templateId": template_id, "payload": {"data": data}})


class FakeFailingMainAgentClient:
    async def stream_chat(self, *, message, history=None, presentation_mode="a2ui"):
        yield "error", {"message": "Main Agent failed"}
        yield "done", {"mode": "error", "branch": "error"}


class ProxyOrchestrateTest(unittest.IsolatedAsyncioTestCase):
    async def test_proxy_keeps_data_result_server_side_and_returns_display_options(self) -> None:
        store = SelectionStore(ttl_seconds=30)
        a2ui = FakeA2UIAgentClient()
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "장비 상태 보여줘",
                main_agent_client=FakeMainAgentClient(),
                a2ui_agent_client=a2ui,
                store=store,
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        event_names = [event for event, _data in events]

        self.assertNotIn("data_result", event_names)
        self.assertIn("text", event_names)
        self.assertIn("display_options", event_names)
        self.assertNotIn("surface", event_names)
        self.assertEqual(a2ui.recommendation_calls, 1)
        options_event = next(data for event, data in events if event == "display_options")
        self.assertEqual(len(options_event["options"]), 3)
        self.assertEqual(options_event["options"][0]["templateId"], "matrix.table")
        self.assertNotIn("record.detail", [option["templateId"] for option in options_event["options"]])
        self.assertNotIn("sourceSampleRows", "".join(chunks))
        self.assertNotIn("must-not-reach-browser", "".join(chunks))
        self.assertIsNotNone(store.get(options_event["selectionId"]))

    async def test_general_chat_does_not_call_a2ui(self) -> None:
        store = SelectionStore(ttl_seconds=30)
        a2ui = FakeA2UIAgentClient()
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "안녕",
                main_agent_client=FakeMainAgentClient(with_data=False),
                a2ui_agent_client=a2ui,
                store=store,
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        self.assertNotIn("display_options", [event for event, _data in events])
        self.assertEqual(a2ui.recommendation_calls, 0)

    async def test_text_mode_never_calls_a2ui_for_data_request(self) -> None:
        store = SelectionStore(ttl_seconds=30)
        main_agent = FakeMainAgentClient()
        a2ui = FakeA2UIAgentClient()
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "장비 상태 보여줘",
                presentation_mode="text",
                main_agent_client=main_agent,
                a2ui_agent_client=a2ui,
                store=store,
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        event_names = [event for event, _data in events]

        self.assertIn("text", event_names)
        self.assertNotIn("data_result", event_names)
        self.assertNotIn("display_options", event_names)
        self.assertNotIn("surface", event_names)
        self.assertEqual(a2ui.recommendation_calls, 0)
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
                a2ui_agent_client=FakeA2UIAgentClient(),
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        done = next(data for event, data in events if event == "done")

        self.assertEqual(done["mode"], "error")
        self.assertEqual(done["branch"], "error")

    async def test_prepared_recommended_surface_is_returned_after_selection(self) -> None:
        store = SelectionStore(ttl_seconds=30)
        context = store.put(
            query="장비 상태 보여줘",
            api_id="equipment-status",
            data={"items": [{"id": "eq-1"}]},
            metadata={},
            allowed_template_ids=["matrix.table"],
            prepared_surface={"templateId": "matrix.table", "payload": {"data": {"items": []}}},
        )
        a2ui = FakeA2UIAgentClient()
        chunks = [
            chunk
            async for chunk in stream_display_selection(
                context.selection_id,
                "matrix.table",
                a2ui_agent_client=a2ui,
                store=store,
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        surface = next(data for event, data in events if event == "surface")
        self.assertEqual(surface["templateId"], "matrix.table")
        self.assertEqual(a2ui.selected_calls, 0)
        self.assertIsNone(store.get(context.selection_id))

    async def test_alternate_template_calls_a2ui_selected_render(self) -> None:
        store = SelectionStore(ttl_seconds=30)
        context = store.put(
            query="장비 상태 보여줘",
            api_id="equipment-status",
            data={"items": [{"id": "eq-1"}]},
            metadata={},
            allowed_template_ids=["matrix.table", "collection.list"],
            prepared_surface={"templateId": "matrix.table", "payload": {}},
        )
        a2ui = FakeA2UIAgentClient()
        chunks = [
            chunk
            async for chunk in stream_display_selection(
                context.selection_id,
                "collection.list",
                a2ui_agent_client=a2ui,
                store=store,
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        surface = next(data for event, data in events if event == "surface")
        self.assertEqual(surface["templateId"], "collection.list")
        self.assertEqual(a2ui.selected_calls, 1)


if __name__ == "__main__":
    unittest.main()

import json
import unittest
from dataclasses import replace
from unittest.mock import patch

from app.config import settings
from app.derived_schema import (
    build_derived_schema,
    build_sample_data_preview,
)
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
        self.authorizations: list[str | None] = []

    async def stream_chat(
        self,
        *,
        message,
        history=None,
        presentation_mode="a2ui",
        authorization=None,
    ):
        self.presentation_modes.append(presentation_mode)
        self.authorizations.append(authorization)
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


class FakeAIPlanner:
    def __init__(self) -> None:
        self.route_calls: list[dict] = []
        self.summary_calls: list[dict] = []
        self.recommend_calls: list[dict] = []
        self.mapping_calls: list[dict] = []

    async def route_chat(
        self,
        *,
        message,
        history=None,
        presentation_mode="a2ui",
    ):
        self.route_calls.append(
            {
                "message": message,
                "history": history,
                "presentationMode": presentation_mode,
            }
        )
        work_items = any(
            keyword in message.casefold()
            for keyword in (
                "워크 아이템",
                "work item",
                "work-item",
                "작업 항목",
                "태스크",
            )
        )
        return {
            "intent": (
                "work-items" if work_items else "general"
            ),
            "shouldUseA2UI": (
                work_items and presentation_mode == "a2ui"
            ),
            "reason": (
                "워크 아이템 데이터 요청입니다."
                if work_items
                else "일반 대화 요청입니다."
            ),
            "responseText": (
                "안녕하세요! 무엇을 도와드릴까요?"
                if not work_items
                else ""
            ),
        }

    async def summarize_data(
        self,
        *,
        query,
        api_id,
        sample_data_preview,
    ):
        self.summary_calls.append(
            {
                "query": query,
                "apiId": api_id,
                "sampleDataPreview": sample_data_preview,
            }
        )
        return {
            "responseText": (
                "워크 아이템 목록입니다. 총 8건이며, 진행 중·검토·대기 "
                "항목과 완료 및 차단 항목이 포함되어 있습니다."
            )
        }

    async def recommend(
        self,
        *,
        query,
        api_id,
        derived_schema,
        sample_data_preview,
    ):
        self.recommend_calls.append(
            {
                "query": query,
                "apiId": api_id,
                "derivedSchema": derived_schema,
                "sampleDataPreview": sample_data_preview,
            }
        )
        selected = (
            "collection.cardGrid"
            if "카드" in query
            else "matrix.table"
        )
        candidates = []
        for template_id in STATIC_TEMPLATE_IDS:
            is_selected = template_id == selected
            candidates.append(
                {
                    "templateId": template_id,
                    "decision": (
                        "select"
                        if is_selected
                        else "reject"
                    ),
                    "score": 0.95 if is_selected else 0.5,
                    "schemaFit": (
                        0.95 if is_selected else 0.6
                    ),
                    "intentFit": (
                        0.95 if is_selected else 0.4
                    ),
                    "reason": f"{template_id} AI 평가",
                }
            )
        return {
            "selectedTemplateId": selected,
            "reason": "AI가 요청과 데이터 스키마를 비교했습니다.",
            "candidates": candidates,
        }

    async def map_fields(
        self,
        *,
        query,
        api_id,
        template_id,
        derived_schema,
        sample_data_preview,
    ):
        self.mapping_calls.append(
            {
                "query": query,
                "apiId": api_id,
                "templateId": template_id,
                "derivedSchema": derived_schema,
                "sampleDataPreview": sample_data_preview,
            }
        )
        work_items = api_id == "work-items"
        return {
            "selectedTemplateId": template_id,
            "reason": "AI가 선택 템플릿 슬롯에 필드를 매핑했습니다.",
            "titleSourcePath": (
                "items.title" if work_items else "items.name"
            ),
            "contentSourcePath": "items.description",
            "imageSourcePath": None,
            "categorySourcePath": (
                "items.lane" if work_items else "items.location"
            ),
            "statusSourcePath": "items.status",
            "fieldSourcePaths": (
                [
                    "items.id",
                    "items.status",
                    (
                        "items.priority"
                        if work_items
                        else "items.location"
                    ),
                ]
                if template_id == "matrix.table"
                else []
            ),
        }


class FailingMappingPlanner(FakeAIPlanner):
    async def map_fields(self, **_kwargs):
        raise RuntimeError("private upstream detail")


def planning_fixture(
    data: dict,
) -> dict:
    preview = build_sample_data_preview(
        data,
        source_id="equipment-status",
    )
    schema = build_derived_schema(
        data,
        source_id="equipment-status",
        sample_data_preview=preview,
    )
    candidates = []
    for template_id in STATIC_TEMPLATE_IDS:
        selected = template_id == "matrix.table"
        candidates.append(
            {
                "templateId": template_id,
                "decision": (
                    "select" if selected else "reject"
                ),
                "score": 0.95 if selected else 0.5,
                "schemaFit": 0.95 if selected else 0.6,
                "intentFit": 0.8 if selected else 0.4,
                "reason": f"{template_id} AI 평가",
            }
        )
    return {
        "sampleDataPreview": preview,
        "derivedSchema": schema,
        "recommendation": {
            "selectedTemplateId": "matrix.table",
            "reason": "AI가 데이터 스키마를 비교했습니다.",
            "candidates": candidates,
        },
    }


class ProxyOrchestrateTest(unittest.IsolatedAsyncioTestCase):
    async def test_logs_previous_and_result_for_each_ai_flow_step(
        self,
    ) -> None:
        store = SelectionStore(ttl_seconds=30)
        ai_planner = FakeAIPlanner()
        with patch(
            "app.orchestrate.log_flow"
        ) as flow_log:
            chunks = [
                chunk
                async for chunk in stream_chat_turn(
                    "장비 목록을 보고 싶어",
                    main_agent_client=FakeMainAgentClient(),
                    ai_planner=ai_planner,
                    store=store,
                )
            ]
            events = [
                parse_sse_chunk(chunk) for chunk in chunks
            ]
            options_event = next(
                data
                for event, data in events
                if event == "display_options"
            )
            selection_chunks = [
                chunk
                async for chunk in stream_display_selection(
                    options_event["selectionId"],
                    "matrix.table",
                    ai_planner=ai_planner,
                    store=store,
                )
            ]
            self.assertTrue(selection_chunks)

        steps = [
            call.args[0]
            for call in flow_log.call_args_list
        ]
        self.assertEqual(
            steps,
            [
                "01_before_main_agent_call",
                "02_main_agent_event_received",
                "02_main_agent_event_received",
                "02_main_agent_event_received",
                "02_main_agent_event_received",
                "03_before_schema_derivation",
                "04_schema_derived",
                "05_before_ai_template_selection",
                "06_ai_template_selection_completed",
                "07_display_options_ready",
                "09_before_ai_slot_mapping",
                "10_ai_slot_mapping_completed",
                "11_before_surface_build",
                "12_surface_built",
            ],
        )
        before_schema = next(
            call
            for call in flow_log.call_args_list
            if call.args[0]
            == "03_before_schema_derivation"
        )
        self.assertIn(
            "dataResult",
            before_schema.kwargs["previous_result"],
        )
        mapping_completed = next(
            call
            for call in flow_log.call_args_list
            if call.args[0]
            == "10_ai_slot_mapping_completed"
        )
        self.assertEqual(
            mapping_completed.kwargs["result"][
                "selectedTemplateId"
            ],
            "matrix.table",
        )

    async def test_proxy_keeps_data_server_side_and_returns_ai_scored_options(self) -> None:
        store = SelectionStore(ttl_seconds=30)
        ai_planner = FakeAIPlanner()
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "장비 상태 보여줘",
                main_agent_client=FakeMainAgentClient(),
                ai_planner=ai_planner,
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
        self.assertTrue(
            all(
                "score" in option
                and "schemaFit" in option
                and "intentFit" in option
                and "reason" in option
                for option in options_event["options"]
            )
        )
        self.assertEqual(len(ai_planner.recommend_calls), 1)
        self.assertNotIn("장비 1", "".join(chunks))
        self.assertNotIn("hash-1", "".join(chunks))
        self.assertIsNotNone(
            store.get(options_event["selectionId"])
        )

    async def test_mock_mode_reaches_existing_ai_planner_without_remote_call(
        self,
    ) -> None:
        store = SelectionStore(ttl_seconds=30)
        ai_planner = FakeAIPlanner()
        with patch(
            "app.main_agent_client.settings",
            replace(settings, main_agent_mode="mock"),
        ):
            chunks = [
                chunk
                async for chunk in stream_chat_turn(
                    "워크 아이템을 표로 보여줘",
                    ai_planner=ai_planner,
                    store=store,
                )
            ]

        events = [parse_sse_chunk(chunk) for chunk in chunks]
        event_names = [event for event, _data in events]
        self.assertIn("display_options", event_names)
        self.assertNotIn("data_result", event_names)
        visible_text = "".join(
            data.get("text", "")
            for event, data in events
            if event == "text"
        )
        self.assertIn("표시 방식을 선택", visible_text)
        self.assertNotIn("목 데이터를 불러왔습니다", visible_text)
        self.assertEqual(len(ai_planner.recommend_calls), 1)
        self.assertEqual(
            ai_planner.recommend_calls[0]["apiId"],
            "work-items",
        )
        options_event = next(
            data for event, data in events
            if event == "display_options"
        )
        selection_chunks = [
            chunk
            async for chunk in stream_display_selection(
                options_event["selectionId"],
                "matrix.table",
                ai_planner=ai_planner,
                store=store,
            )
        ]
        selection_events = [
            parse_sse_chunk(chunk)
            for chunk in selection_chunks
        ]
        surface = next(
            data for event, data in selection_events
            if event == "surface"
        )
        self.assertEqual(
            surface["surface"]["payload"]["data"]["items"][0]["title"],
            "관리자 챗봇 접근 권한 검토",
        )

    async def test_mock_mode_general_chat_skips_a2ui_even_when_enabled(
        self,
    ) -> None:
        ai_planner = FakeAIPlanner()
        with patch(
            "app.main_agent_client.settings",
            replace(settings, main_agent_mode="mock"),
        ):
            chunks = [
                chunk
                async for chunk in stream_chat_turn(
                    "안녕, 오늘 기분 어때?",
                    presentation_mode="a2ui",
                    ai_planner=ai_planner,
                    store=SelectionStore(ttl_seconds=30),
                )
            ]

        events = [parse_sse_chunk(chunk) for chunk in chunks]
        event_names = [event for event, _data in events]
        self.assertIn("text", event_names)
        self.assertNotIn("display_options", event_names)
        self.assertNotIn("data_result", event_names)
        self.assertEqual(len(ai_planner.route_calls), 1)
        self.assertEqual(len(ai_planner.recommend_calls), 0)
        done = next(
            data for event, data in events if event == "done"
        )
        self.assertEqual(done["mode"], "text")
        self.assertEqual(done["intent"], "general")
        self.assertFalse(done["shouldUseA2UI"])

    async def test_mock_work_items_text_mode_skips_a2ui_planner(
        self,
    ) -> None:
        ai_planner = FakeAIPlanner()
        with patch(
            "app.main_agent_client.settings",
            replace(settings, main_agent_mode="mock"),
        ):
            chunks = [
                chunk
                async for chunk in stream_chat_turn(
                    "워크 아이템을 알려줘",
                    presentation_mode="text",
                    ai_planner=ai_planner,
                    store=SelectionStore(ttl_seconds=30),
                )
            ]

        events = [parse_sse_chunk(chunk) for chunk in chunks]
        event_names = [event for event, _data in events]
        self.assertIn("text", event_names)
        self.assertNotIn("display_options", event_names)
        self.assertEqual(len(ai_planner.route_calls), 1)
        self.assertEqual(len(ai_planner.summary_calls), 1)
        self.assertEqual(len(ai_planner.recommend_calls), 0)
        visible_text = "".join(
            data.get("text", "")
            for event, data in events
            if event == "text"
        )
        self.assertIn("워크 아이템 목록입니다", visible_text)
        self.assertNotIn("목 데이터를 불러왔습니다", visible_text)
        done = next(
            data for event, data in events if event == "done"
        )
        self.assertEqual(done["mode"], "text")
        self.assertFalse(done["shouldUseA2UI"])

    async def test_explicit_display_query_controls_recommendation(self) -> None:
        ai_planner = FakeAIPlanner()
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "장비를 카드로 보여줘",
                main_agent_client=FakeMainAgentClient(),
                ai_planner=ai_planner,
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
                ai_planner=FakeAIPlanner(),
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
                ai_planner=FakeAIPlanner(),
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
                ai_planner=FakeAIPlanner(),
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

    async def test_forwards_authorization_to_main_agent(self) -> None:
        main_agent = FakeMainAgentClient(with_data=False)
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "장비 상태 보여줘",
                upstream_authorization="Bearer browser-token",
                main_agent_client=main_agent,
                ai_planner=FakeAIPlanner(),
            )
        ]

        self.assertTrue(chunks)
        self.assertEqual(
            main_agent.authorizations,
            ["Bearer browser-token"],
        )

    async def test_text_mode_preserves_main_agent_error_completion(self) -> None:
        chunks = [
            chunk
            async for chunk in stream_chat_turn(
                "장비 상태 보여줘",
                presentation_mode="text",
                main_agent_client=FakeFailingMainAgentClient(),
                ai_planner=FakeAIPlanner(),
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
                ai_planner=FakeAIPlanner(),
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]

        self.assertIn("error", [event for event, _data in events])
        done = next(data for event, data in events if event == "done")
        self.assertEqual(done["mode"], "error")
        self.assertEqual(done["branch"], "error")

    async def test_each_template_uses_ai_mapping_and_consumes_selection(self) -> None:
        for template_id in STATIC_TEMPLATE_IDS:
            with self.subTest(template_id=template_id):
                store = SelectionStore(ttl_seconds=30)
                ai_planner = FakeAIPlanner()
                data = {
                    "items": [
                        {
                            "id": "eq-1",
                            "name": "장비 1",
                            "description": "프레스",
                            "status": "RUNNING",
                            "location": "A동",
                        }
                    ]
                }
                context = store.put(
                    query="장비 상태 보여줘",
                    api_id="equipment-status",
                    data=data,
                    metadata={"sourceDataHash": "hash-1"},
                    allowed_template_ids=list(STATIC_TEMPLATE_IDS),
                    planning=planning_fixture(
                        data,
                    ),
                )
                chunks = [
                    chunk
                    async for chunk in stream_display_selection(
                        context.selection_id,
                        template_id,
                        ai_planner=ai_planner,
                        store=store,
                    )
                ]
                events = [parse_sse_chunk(chunk) for chunk in chunks]
                surface_event = next(data for event, data in events if event == "surface")
                surface = surface_event["surface"]
                self.assertEqual(surface_event["templateId"], template_id)
                self.assertEqual(surface["templateId"], template_id)
                self.assertEqual(surface["payload"]["profile"]["rowCount"], 1)
                self.assertEqual(surface["payload"]["renderPlan"]["strategy"], "proxy_ai_schema_planner")
                self.assertEqual(
                    ai_planner.mapping_calls[0][
                        "templateId"
                    ],
                    template_id,
                )
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
                ai_planner=FakeAIPlanner(),
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
                ai_planner=FakeAIPlanner(),
                store=SelectionStore(ttl_seconds=30),
            )
        ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        self.assertIn("error", [event for event, _data in events])
        self.assertNotIn("surface", [event for event, _data in events])

    async def test_mapping_failure_hides_details_and_releases_claim(
        self,
    ) -> None:
        store = SelectionStore(ttl_seconds=30)
        data = {
            "items": [
                {
                    "name": "장비 1",
                    "status": "RUNNING",
                }
            ]
        }
        context = store.put(
            query="장비 상태 보여줘",
            api_id="equipment-status",
            data=data,
            metadata={},
            allowed_template_ids=list(STATIC_TEMPLATE_IDS),
            planning=planning_fixture(data),
        )
        with (
            patch(
                "app.orchestrate.settings",
                replace(settings, expose_error_details=False),
            ),
            patch("app.orchestrate.logger.exception"),
        ):
            chunks = [
                chunk
                async for chunk in stream_display_selection(
                    context.selection_id,
                    "matrix.table",
                    ai_planner=FailingMappingPlanner(),
                    store=store,
                )
            ]
        events = [parse_sse_chunk(chunk) for chunk in chunks]
        error = next(
            data for event, data in events if event == "error"
        )
        self.assertNotIn("details", error)
        self.assertNotIn("errorType", error)
        self.assertNotIn("private upstream detail", json.dumps(error))
        self.assertEqual(
            store.claim(context.selection_id),
            context,
        )


if __name__ == "__main__":
    unittest.main()

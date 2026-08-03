import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .ai_planner import AIPlanner, ProxyAIPlanner
from .config import settings
from .contracts import PresentationMode
from .derived_schema import (
    build_derived_schema,
    build_sample_data_preview,
)
from .flow_logging import log_flow
from .main_agent_client import (
    MainAgentStreamClient,
    create_main_agent_client,
)
from .selection_store import SelectionStore, selection_store
from .static_templates import STATIC_TEMPLATE_BY_ID
from .surface_builder import SurfaceBuildError, build_surface


logger = logging.getLogger("uvicorn.error")


def sse_event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def proxy_payload(data: dict[str, Any], *, turn_id: str, branch: str | None = None) -> dict[str, Any]:
    payload = {
        "turnId": turn_id,
        "physicalEmitter": "a2ui-proxy-agent",
        "emittedAt": datetime.now(timezone.utc).isoformat(),
        **data,
    }
    if branch:
        payload["branch"] = branch
    return payload


def _public_error(
    message: str,
    exc: Exception,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"message": message}
    if settings.expose_error_details:
        payload.update(
            {
                "details": str(exc),
                "errorType": exc.__class__.__name__,
            }
        )
    return payload


def _template_options(
    recommendation: dict[str, Any],
) -> list[dict[str, Any]]:
    selected_template_id = recommendation[
        "selectedTemplateId"
    ]
    candidates = sorted(
        recommendation["candidates"],
        key=lambda candidate: (
            candidate["templateId"]
            != selected_template_id,
            -candidate["score"],
        ),
    )
    return [
        {
            "templateId": candidate["templateId"],
            "label": STATIC_TEMPLATE_BY_ID[
                candidate["templateId"]
            ].label,
            "score": candidate["score"],
            "schemaFit": candidate["schemaFit"],
            "intentFit": candidate["intentFit"],
            "reason": candidate["reason"],
            "recommended": candidate["templateId"]
            == selected_template_id,
        }
        for candidate in candidates
    ]


async def stream_chat_turn(
    message: str,
    history: list[dict[str, Any]] | None = None,
    *,
    presentation_mode: PresentationMode = "a2ui",
    upstream_authorization: str | None = None,
    main_agent_client: MainAgentStreamClient | None = None,
    ai_planner: AIPlanner | None = None,
    store: SelectionStore = selection_store,
) -> AsyncIterator[str]:
    turn_id = f"proxy-turn-{uuid4()}"
    main_client = main_agent_client
    source_mode = "custom"
    planner = ai_planner or ProxyAIPlanner()
    data_result: dict[str, Any] | None = None
    main_done: dict[str, Any] | None = None

    try:
        if main_client is None:
            main_client = create_main_agent_client()
        source_mode = getattr(
            main_client,
            "source_mode",
            "custom",
        )
        log_flow(
            "01_before_main_agent_call",
            turn_id=turn_id,
            previous_result={
                "message": message,
                "history": history or [],
                "presentationMode": presentation_mode,
                "mainAgentMode": source_mode,
                "mainAgentUrl": getattr(
                    main_client,
                    "server_url",
                    None,
                ),
            },
        )
        yield sse_event(
            "state",
            proxy_payload(
                {
                    "status": "proxy_main_agent_call",
                    "label": (
                        "Main Agent 목 응답 로드"
                        if source_mode == "mock"
                        else "Main Agent 호출"
                    ),
                    "sourceMode": source_mode,
                    "presentationMode": presentation_mode,
                },
                turn_id=turn_id,
            ),
        )

        stream_options: dict[str, Any] = {
            "message": message,
            "history": history,
            "presentation_mode": presentation_mode,
        }
        if upstream_authorization:
            stream_options["authorization"] = (
                upstream_authorization
            )
        async for event, data in main_client.stream_chat(
            **stream_options,
        ):
            log_flow(
                "02_main_agent_event_received",
                turn_id=turn_id,
                result={
                    "event": event,
                    "data": data,
                },
            )
            if event == "data_result":
                data_result = data
                yield sse_event(
                    "state",
                    proxy_payload(
                        {
                            "status": "proxy_data_received",
                            "label": "Main Agent 조회 데이터 수신",
                            "apiId": data.get("apiId"),
                            "sourceToolName": data.get("sourceToolName"),
                            "sourceToolResultId": data.get("sourceToolResultId"),
                            "sourceRowCount": (data.get("metadata") or {}).get("sourceRowCount")
                            if isinstance(data.get("metadata"), dict)
                            else None,
                        },
                        turn_id=turn_id,
                        branch="data",
                    ),
                )
                continue
            if event == "done":
                main_done = data
                continue
            if event in {"state", "text", "delta", "error"}:
                yield sse_event(event, data)

        if presentation_mode == "text":
            log_flow(
                "03_text_mode_completed",
                turn_id=turn_id,
                previous_result={
                    "mainDone": main_done,
                    "dataResultReceived": data_result
                    is not None,
                },
            )
            if isinstance(main_done, dict) and main_done.get("mode") == "error":
                yield sse_event("done", main_done)
                return
            branch = (
                main_done.get("branch")
                if isinstance(main_done, dict) and isinstance(main_done.get("branch"), str)
                else "data" if data_result else "general"
            )
            yield sse_event(
                "done",
                proxy_payload(
                    {
                        "mode": "text",
                        "branch": branch,
                        "presentationMode": "text",
                    },
                    turn_id=turn_id,
                    branch=branch,
                ),
            )
            return

        if not data_result:
            log_flow(
                "03_no_data_result_completed",
                turn_id=turn_id,
                previous_result={
                    "mainDone": main_done,
                },
            )
            yield sse_event(
                "done",
                main_done
                or proxy_payload({"mode": "text", "branch": "general"}, turn_id=turn_id, branch="general"),
            )
            return

        api_id = data_result.get("apiId")
        raw_data = data_result.get("data")
        metadata = data_result.get("metadata") if isinstance(data_result.get("metadata"), dict) else {}
        query = data_result.get("query") if isinstance(data_result.get("query"), str) else message
        if not isinstance(api_id, str) or raw_data is None:
            raise RuntimeError("Main Agent data_result requires apiId and data.")

        log_flow(
            "03_before_schema_derivation",
            turn_id=turn_id,
            previous_result={
                "dataResult": data_result,
            },
        )
        try:
            sample_data_preview = build_sample_data_preview(
                raw_data,
                source_id=api_id,
            )
            derived_schema = build_derived_schema(
                raw_data,
                source_id=api_id,
                sample_data_preview=sample_data_preview,
            )
            if (
                not derived_schema.get("rowCount")
                or not derived_schema.get("fields")
            ):
                raise SurfaceBuildError(
                    "A2UI 화면으로 표시할 row 또는 field가 없습니다."
                )
        except SurfaceBuildError as build_error:
            log_flow(
                "04_schema_derivation_failed",
                turn_id=turn_id,
                previous_result={
                    "dataResult": data_result,
                },
                result={
                    "error": str(build_error),
                },
            )
            yield sse_event(
                "state",
                proxy_payload(
                    {
                        "status": "matcher",
                        "label": "적용 가능한 A2UI 템플릿 없음",
                        "mode": "text_fallback",
                        "reason": str(build_error),
                        "candidateCount": 0,
                        "strategy": "proxy_ai_schema_planner",
                    },
                    turn_id=turn_id,
                    branch="no_template",
                ),
            )
            yield sse_event(
                "done",
                proxy_payload(
                    {"mode": "text_fallback", "branch": "no_template", "reason": str(build_error)},
                    turn_id=turn_id,
                    branch="no_template",
                ),
            )
            return

        log_flow(
            "04_schema_derived",
            turn_id=turn_id,
            result={
                "sampleDataPreview": sample_data_preview,
                "derivedSchema": derived_schema,
            },
        )
        yield sse_event(
            "state",
            proxy_payload(
                {
                    "status": "proxy_schema_derived",
                    "label": "업무 데이터 스키마 추출",
                    "apiId": api_id,
                    "sourceToolResultId": data_result.get(
                        "sourceToolResultId"
                    ),
                    "shape": derived_schema.get("shape"),
                    "fieldCount": len(
                        derived_schema.get("fields") or []
                    ),
                    "sampleSize": derived_schema.get(
                        "sampleSize"
                    ),
                    "strategy": "proxy_ai_schema_planner",
                },
                turn_id=turn_id,
                branch="data",
            ),
        )
        log_flow(
            "05_before_ai_template_selection",
            turn_id=turn_id,
            previous_result={
                "query": query,
                "apiId": api_id,
                "sampleDataPreview": sample_data_preview,
                "derivedSchema": derived_schema,
                "templateIds": list(
                    STATIC_TEMPLATE_BY_ID
                ),
            },
        )
        yield sse_event(
            "state",
            proxy_payload(
                {
                    "status": "proxy_ai_template_selection",
                    "label": "AI가 데이터 스키마와 템플릿 비교",
                    "apiId": api_id,
                    "candidateCount": len(
                        STATIC_TEMPLATE_BY_ID
                    ),
                    "strategy": "proxy_ai_schema_planner",
                },
                turn_id=turn_id,
                branch="data",
            ),
        )
        recommendation = await planner.recommend(
            query=query,
            api_id=api_id,
            derived_schema=derived_schema,
            sample_data_preview=sample_data_preview,
        )
        log_flow(
            "06_ai_template_selection_completed",
            turn_id=turn_id,
            result=recommendation,
        )
        options = _template_options(recommendation)

        context = store.put(
            query=query,
            api_id=api_id,
            data=raw_data,
            metadata=metadata,
            allowed_template_ids=[option["templateId"] for option in options],
            planning={
                "sampleDataPreview": sample_data_preview,
                "derivedSchema": derived_schema,
                "recommendation": recommendation,
            },
        )

        log_flow(
            "07_display_options_ready",
            turn_id=turn_id,
            selection_id=context.selection_id,
            previous_result={
                "recommendation": recommendation,
            },
            result={
                "options": options,
            },
        )
        yield sse_event(
            "state",
            proxy_payload(
                {
                    "status": "matcher",
                    "label": "A2UI 표시 방식 후보 준비",
                    "mode": "display_options",
                    "strategy": "proxy_ai_schema_planner",
                    "candidateCount": len(options),
                    "recommendedTemplateId": recommendation[
                        "selectedTemplateId"
                    ],
                    "reason": recommendation["reason"],
                },
                turn_id=turn_id,
                branch="matched",
            ),
        )
        yield sse_event(
            "display_options",
            proxy_payload(
                {
                    "selectionId": context.selection_id,
                    "message": "어떤 방식으로 보시겠습니까?",
                    "options": options,
                },
                turn_id=turn_id,
                branch="matched",
            ),
        )
        yield sse_event(
            "done",
            proxy_payload(
                {
                    "mode": "display_options",
                    "branch": "matched",
                    "selectionId": context.selection_id,
                    "candidateCount": len(options),
                },
                turn_id=turn_id,
                branch="matched",
            ),
        )
    except Exception as exc:
        log_flow(
            "99_chat_flow_failed",
            turn_id=turn_id,
            result={
                "errorType": exc.__class__.__name__,
                "details": str(exc),
            },
        )
        logger.exception("[a2ui-proxy-agent] chat stream failed turnId=%s detail=%s", turn_id, exc)
        yield sse_event(
            "error",
            proxy_payload(
                _public_error(
                    "A2UI Proxy Agent가 요청을 처리하지 못했습니다.",
                    exc,
                ),
                turn_id=turn_id,
                branch="error",
            ),
        )
        yield sse_event(
            "done",
            proxy_payload({"mode": "error", "branch": "error"}, turn_id=turn_id, branch="error"),
        )


async def stream_display_selection(
    selection_id: str,
    template_id: str,
    *,
    ai_planner: AIPlanner | None = None,
    store: SelectionStore = selection_store,
) -> AsyncIterator[str]:
    turn_id = f"proxy-selection-{uuid4()}"
    claimed = False
    try:
        context = store.claim(selection_id)
        if not context:
            raise ValueError("선택 정보가 만료되었거나 존재하지 않습니다. 데이터를 다시 조회해 주세요.")
        claimed = True
        if template_id not in context.allowed_template_ids:
            raise ValueError("선택할 수 없는 템플릿입니다.")
        planner = ai_planner or ProxyAIPlanner()
        derived_schema = context.planning.get(
            "derivedSchema"
        )
        sample_data_preview = context.planning.get(
            "sampleDataPreview"
        )
        recommendation = context.planning.get(
            "recommendation"
        )
        if not all(
            isinstance(value, dict)
            for value in (
                derived_schema,
                sample_data_preview,
                recommendation,
            )
        ):
            raise ValueError(
                "선택 정보에 AI 플래닝 컨텍스트가 없습니다. 데이터를 다시 조회해 주세요."
            )

        log_flow(
            "09_before_ai_slot_mapping",
            turn_id=turn_id,
            selection_id=selection_id,
            previous_result={
                "query": context.query,
                "apiId": context.api_id,
                "selectedTemplateId": template_id,
                "recommendation": recommendation,
                "sampleDataPreview": sample_data_preview,
                "derivedSchema": derived_schema,
            },
        )
        yield sse_event(
            "state",
            proxy_payload(
                {
                    "status": "render_selected",
                    "label": "선택한 A2UI 화면 생성",
                    "selectionId": selection_id,
                    "templateId": template_id,
                },
                turn_id=turn_id,
                branch="matched",
            ),
        )

        yield sse_event(
            "state",
            proxy_payload(
                {
                    "status": "proxy_ai_slot_mapping",
                    "label": "AI가 선택 템플릿에 데이터 필드 매핑",
                    "selectionId": selection_id,
                    "templateId": template_id,
                    "strategy": "proxy_ai_schema_planner",
                },
                turn_id=turn_id,
                branch="matched",
            ),
        )
        ai_mapping = await planner.map_fields(
            query=context.query,
            api_id=context.api_id,
            template_id=template_id,
            derived_schema=derived_schema,
            sample_data_preview=sample_data_preview,
        )
        log_flow(
            "10_ai_slot_mapping_completed",
            turn_id=turn_id,
            selection_id=selection_id,
            result=ai_mapping,
        )
        log_flow(
            "11_before_surface_build",
            turn_id=turn_id,
            selection_id=selection_id,
            previous_result={
                "selectedTemplateId": template_id,
                "aiRecommendation": recommendation,
                "aiMapping": ai_mapping,
                "sourceMetadata": context.metadata,
            },
        )
        surface = build_surface(
            api_id=context.api_id,
            data=context.data,
            metadata=context.metadata,
            template_id=template_id,
            derived_schema=derived_schema,
            ai_recommendation=recommendation,
            ai_mapping=ai_mapping,
        )
        log_flow(
            "12_surface_built",
            turn_id=turn_id,
            selection_id=selection_id,
            result=surface,
        )
        store.delete(selection_id)
        claimed = False
        yield sse_event(
            "surface",
            proxy_payload(
                {"surface": surface, "templateId": template_id, "selectionId": selection_id},
                turn_id=turn_id,
                branch="matched",
            ),
        )
        yield sse_event(
            "done",
            proxy_payload(
                {
                    "mode": "render_surface",
                    "branch": "matched",
                    "templateId": template_id,
                    "selectionId": selection_id,
                },
                turn_id=turn_id,
                branch="matched",
            ),
        )
    except Exception as exc:
        if claimed:
            store.release(selection_id)
        log_flow(
            "99_display_selection_flow_failed",
            turn_id=turn_id,
            selection_id=selection_id,
            result={
                "templateId": template_id,
                "errorType": exc.__class__.__name__,
                "details": str(exc),
            },
        )
        if isinstance(exc, (ValueError, SurfaceBuildError)):
            logger.warning("[a2ui-proxy-agent] display selection rejected turnId=%s detail=%s", turn_id, exc)
        else:
            logger.exception("[a2ui-proxy-agent] display selection failed turnId=%s detail=%s", turn_id, exc)
        yield sse_event(
            "error",
            proxy_payload(
                _public_error(
                    "선택한 A2UI 화면을 생성하지 못했습니다.",
                    exc,
                ),
                turn_id=turn_id,
                branch="error",
            ),
        )
        yield sse_event(
            "done",
            proxy_payload({"mode": "error", "branch": "error"}, turn_id=turn_id, branch="error"),
        )

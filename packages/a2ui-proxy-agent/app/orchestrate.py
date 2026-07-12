import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .a2ui_agent_client import (
    A2UIAgentClient,
    completed_task_from_stream_event,
    extract_a2ui_result,
)
from .main_agent_client import MainAgentClient
from .selection_store import SelectionStore, selection_store


logger = logging.getLogger("uvicorn.error")

TEMPLATE_LABELS = {
    "collection.list": "목록",
    "collection.cardGrid": "카드 그리드",
    "record.detail": "상세",
    "matrix.table": "데이터 테이블",
    "matrix.statusMatrix": "상태 매트릭스",
    "metric.statCards": "지표 카드",
    "metric.progressList": "진행률 목록",
    "time.timeline": "타임라인",
    "process.queue": "처리 대기열",
    "relation.tree": "계층 트리",
}

SAFE_A2UI_PROGRESS_KEYS = {
    "mode",
    "templateId",
    "strategy",
    "score",
    "candidateCount",
    "fieldMappingCount",
    "slotMappingCount",
    "renderRowCount",
    "rowCount",
    "previewRowCount",
    "previewSampleSize",
    "sourceShape",
    "sourceArrayPath",
    "sourceFieldCount",
    "registryVersion",
    "templateCount",
    "validation",
    "diagnostic",
}


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


def _rows_from_data(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("items", "rows", "list"):
        value = data.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    for parent_key in ("result", "data", "payload"):
        parent = data.get(parent_key)
        if not isinstance(parent, dict):
            continue
        rows = _rows_from_data(parent)
        if rows:
            return rows
    return [data]


def _is_template_compatible(template_id: str, data: Any) -> bool:
    rows = _rows_from_data(data)
    if not rows:
        return False
    keys = {key.lower() for row in rows[:5] for key in row}
    numeric_keys = {
        key.lower()
        for row in rows[:5]
        for key, value in row.items()
        if isinstance(value, (int, float)) and not isinstance(value, bool)
    }
    has_title = bool(keys & {"title", "name", "label", "displayname", "eqp_nm"})
    has_status = bool(keys & {"status", "state", "isrunning", "isonline", "hasalarm", "operation_yn", "running_code"})

    if template_id == "record.detail":
        return len(rows) == 1 and has_title
    if template_id in {"collection.list", "collection.cardGrid"}:
        return has_title
    if template_id == "matrix.table":
        return len(keys) >= 2
    if template_id == "matrix.statusMatrix":
        return has_title and has_status
    if template_id == "metric.statCards":
        return bool(numeric_keys)
    if template_id == "metric.progressList":
        return has_title and bool(numeric_keys & {"progress", "percent", "percentage", "completion"})
    if template_id == "time.timeline":
        return has_title and bool(keys & {"startat", "endat", "dueat", "updatedat", "timestamp", "time"})
    if template_id == "process.queue":
        return has_title and has_status
    if template_id == "relation.tree":
        return has_title and bool(keys & {"parentid", "children", "parent_id"})
    return True


def _template_options(result: dict[str, Any], data: Any, max_candidates: int = 3) -> list[dict[str, Any]]:
    selected_template_id = result.get("templateId")
    raw_candidates = result.get("candidates") if isinstance(result.get("candidates"), list) else []
    by_id: dict[str, dict[str, Any]] = {}

    if isinstance(selected_template_id, str) and selected_template_id:
        by_id[selected_template_id] = {
            "templateId": selected_template_id,
            "label": TEMPLATE_LABELS.get(selected_template_id, selected_template_id),
            "score": result.get("score"),
            "recommended": True,
        }

    sorted_candidates = sorted(
        [item for item in raw_candidates if isinstance(item, dict)],
        key=lambda item: float(item.get("score") or 0),
        reverse=True,
    )
    for candidate in sorted_candidates:
        template_id = candidate.get("templateId")
        if not isinstance(template_id, str) or not template_id or template_id in by_id:
            continue
        if not _is_template_compatible(template_id, data):
            continue
        ai = candidate.get("ai") if isinstance(candidate.get("ai"), dict) else {}
        missing_slots = ai.get("missingRequiredSlots") if isinstance(ai.get("missingRequiredSlots"), list) else []
        if missing_slots:
            continue
        by_id[template_id] = {
            "templateId": template_id,
            "label": TEMPLATE_LABELS.get(template_id, template_id),
            "score": candidate.get("score"),
            "recommended": False,
        }
        if len(by_id) >= max_candidates:
            break

    return list(by_id.values())[:max_candidates]


async def stream_chat_turn(
    message: str,
    history: list[dict[str, Any]] | None = None,
    *,
    main_agent_client: MainAgentClient | None = None,
    a2ui_agent_client: A2UIAgentClient | None = None,
    store: SelectionStore = selection_store,
) -> AsyncIterator[str]:
    turn_id = f"proxy-turn-{uuid4()}"
    main_client = main_agent_client or MainAgentClient()
    a2ui_client = a2ui_agent_client or A2UIAgentClient()
    data_result: dict[str, Any] | None = None
    main_done: dict[str, Any] | None = None

    try:
        yield sse_event(
            "state",
            proxy_payload(
                {"status": "proxy_main_agent_call", "label": "Main Agent 호출"},
                turn_id=turn_id,
            ),
        )

        async for event, data in main_client.stream_chat(message=message, history=history):
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
                            "sourceDataHash": (data.get("metadata") or {}).get("sourceDataHash")
                            if isinstance(data.get("metadata"), dict)
                            else None,
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

        if not data_result:
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

        yield sse_event(
            "state",
            proxy_payload(
                {
                    "status": "proxy_a2ui_call",
                    "label": "조회 데이터로 A2UI Agent 호출",
                    "apiId": api_id,
                    "sourceToolResultId": data_result.get("sourceToolResultId"),
                },
                turn_id=turn_id,
                branch="data",
            ),
        )

        completed_task: dict[str, Any] | None = None
        async for a2a_event in a2ui_client.stream_recommendation(
            query=query,
            api_id=api_id,
            data=raw_data,
            metadata=metadata,
        ):
            progress = a2a_event.get("progressUpdate") if isinstance(a2a_event.get("progressUpdate"), dict) else None
            if progress:
                progress_data = progress.get("data") if isinstance(progress.get("data"), dict) else {}
                safe_progress_data = {
                    key: value for key, value in progress_data.items() if key in SAFE_A2UI_PROGRESS_KEYS
                }
                yield sse_event(
                    "state",
                    proxy_payload(
                        {
                            **safe_progress_data,
                            "status": progress.get("status") or "a2ui_progress",
                            "label": progress.get("label") or "A2UI 처리",
                            "detail": progress.get("detail"),
                            "physicalSource": "a2ui-agent",
                            "a2aTaskId": progress.get("taskId"),
                        },
                        turn_id=turn_id,
                        branch="data",
                    ),
                )
            task = completed_task_from_stream_event(a2a_event)
            if task:
                completed_task = task

        if not completed_task:
            raise RuntimeError("A2UI Agent stream completed without a final task.")

        result = extract_a2ui_result(completed_task)
        if result.get("type") != "surface" or not isinstance(result.get("surface"), dict):
            yield sse_event(
                "state",
                proxy_payload(
                    {
                        "status": "matcher",
                        "label": "적용 가능한 A2UI 템플릿 없음",
                        "mode": "text_fallback",
                        "reason": result.get("reason"),
                        "candidateCount": 0,
                    },
                    turn_id=turn_id,
                    branch="no_template",
                ),
            )
            yield sse_event(
                "done",
                proxy_payload(
                    {"mode": "text_fallback", "branch": "no_template", "reason": result.get("reason")},
                    turn_id=turn_id,
                    branch="no_template",
                ),
            )
            return

        options = _template_options(result, raw_data)
        if not options:
            raise RuntimeError("A2UI Agent returned a Surface without a selectable template.")
        context = store.put(
            query=query,
            api_id=api_id,
            data=raw_data,
            metadata=metadata,
            allowed_template_ids=[option["templateId"] for option in options],
            prepared_surface=result["surface"],
        )

        yield sse_event(
            "state",
            proxy_payload(
                {
                    "status": "matcher",
                    "label": "A2UI 표시 방식 후보 준비",
                    "mode": "display_options",
                    "strategy": result.get("strategy"),
                    "score": result.get("score"),
                    "candidateCount": len(options),
                    "candidates": result.get("candidates"),
                    "dataIntegrity": result.get("dataIntegrity"),
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
        logger.exception("[a2ui-proxy-agent] chat stream failed turnId=%s detail=%s", turn_id, exc)
        yield sse_event(
            "error",
            proxy_payload(
                {
                    "message": "A2UI Proxy Agent가 요청을 처리하지 못했습니다.",
                    "details": str(exc),
                    "errorType": exc.__class__.__name__,
                },
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
    a2ui_agent_client: A2UIAgentClient | None = None,
    store: SelectionStore = selection_store,
) -> AsyncIterator[str]:
    turn_id = f"proxy-selection-{uuid4()}"
    client = a2ui_agent_client or A2UIAgentClient()
    try:
        context = store.get(selection_id)
        if not context:
            raise ValueError("선택 정보가 만료되었거나 존재하지 않습니다. 데이터를 다시 조회해 주세요.")
        if template_id not in context.allowed_template_ids:
            raise ValueError("선택할 수 없는 템플릿입니다.")

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

        prepared_template_id = context.prepared_surface.get("templateId") if context.prepared_surface else None
        if prepared_template_id == template_id:
            surface = context.prepared_surface
        else:
            payload = await client.render_selected(
                query=context.query,
                api_id=context.api_id,
                data=context.data,
                metadata=context.metadata,
                template_id=template_id,
            )
            result = extract_a2ui_result(payload)
            surface = result.get("surface") if result.get("type") == "surface" else None
            if not isinstance(surface, dict) or surface.get("templateId") != template_id:
                raise RuntimeError(result.get("reason") or "선택한 템플릿으로 Surface를 생성하지 못했습니다.")

        if not isinstance(surface, dict):
            raise RuntimeError("선택한 A2UI Surface가 없습니다.")
        store.delete(selection_id)
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
        logger.exception("[a2ui-proxy-agent] display selection failed turnId=%s detail=%s", turn_id, exc)
        yield sse_event(
            "error",
            proxy_payload(
                {
                    "message": "선택한 A2UI 화면을 생성하지 못했습니다.",
                    "details": str(exc),
                    "errorType": exc.__class__.__name__,
                },
                turn_id=turn_id,
                branch="error",
            ),
        )
        yield sse_event(
            "done",
            proxy_payload({"mode": "error", "branch": "error"}, turn_id=turn_id, branch="error"),
        )

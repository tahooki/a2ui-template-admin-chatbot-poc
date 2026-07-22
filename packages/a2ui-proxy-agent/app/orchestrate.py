import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .contracts import PresentationMode
from .main_agent_client import MainAgentClient
from .selection_store import SelectionStore, selection_store
from .surface_builder import SurfaceBuildError, build_surface, display_options


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


async def stream_chat_turn(
    message: str,
    history: list[dict[str, Any]] | None = None,
    *,
    presentation_mode: PresentationMode = "a2ui",
    main_agent_client: MainAgentClient | None = None,
    store: SelectionStore = selection_store,
) -> AsyncIterator[str]:
    turn_id = f"proxy-turn-{uuid4()}"
    main_client = main_agent_client or MainAgentClient()
    data_result: dict[str, Any] | None = None
    main_done: dict[str, Any] | None = None

    try:
        yield sse_event(
            "state",
            proxy_payload(
                {
                    "status": "proxy_main_agent_call",
                    "label": "Main Agent 호출",
                    "presentationMode": presentation_mode,
                },
                turn_id=turn_id,
            ),
        )

        async for event, data in main_client.stream_chat(
            message=message,
            history=history,
            presentation_mode=presentation_mode,
        ):
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
                    "status": "proxy_template_options",
                    "label": "고정 A2UI 표시 방식 준비",
                    "apiId": api_id,
                    "sourceToolResultId": data_result.get("sourceToolResultId"),
                    "strategy": "proxy_static_templates",
                },
                turn_id=turn_id,
                branch="data",
            ),
        )

        try:
            options = display_options(query, raw_data)
        except SurfaceBuildError as build_error:
            yield sse_event(
                "state",
                proxy_payload(
                    {
                        "status": "matcher",
                        "label": "적용 가능한 A2UI 템플릿 없음",
                        "mode": "text_fallback",
                        "reason": str(build_error),
                        "candidateCount": 0,
                        "strategy": "proxy_static_templates",
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

        context = store.put(
            query=query,
            api_id=api_id,
            data=raw_data,
            metadata=metadata,
            allowed_template_ids=[option["templateId"] for option in options],
        )

        yield sse_event(
            "state",
            proxy_payload(
                {
                    "status": "matcher",
                    "label": "A2UI 표시 방식 후보 준비",
                    "mode": "display_options",
                    "strategy": "proxy_static_templates",
                    "candidateCount": len(options),
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
    store: SelectionStore = selection_store,
) -> AsyncIterator[str]:
    turn_id = f"proxy-selection-{uuid4()}"
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

        surface = build_surface(
            query=context.query,
            api_id=context.api_id,
            data=context.data,
            metadata=context.metadata,
            template_id=template_id,
        )
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
        if isinstance(exc, (ValueError, SurfaceBuildError)):
            logger.warning("[a2ui-proxy-agent] display selection rejected turnId=%s detail=%s", turn_id, exc)
        else:
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

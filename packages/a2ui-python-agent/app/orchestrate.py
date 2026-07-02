import json
import logging
from datetime import datetime, timezone
from typing import Any, AsyncIterator
from uuid import uuid4

from .a2ui_render_tool import A2UIRenderToolInput, A2UIRenderToolResult, run_a2ui_render_tool, stream_a2ui_render_tool
from .ai.llm_client import LLMClientError, generate_general_response_with_llm
from .equipment_tools import equipment_api_title
from .intent_router import choose_api_by_regex
from .business_tools import BusinessToolResult, run_business_tool
from .render_boundary import RenderBoundaryError
from .tool_router import business_tool_for_api


logger = logging.getLogger("uvicorn.error")


class AgentRuntimeError(RuntimeError):
    pass


async def _choose_api(message: str, history: list[dict[str, Any]] | None = None) -> tuple[str | None, str]:
    _ = history
    classification = choose_api_by_regex(message)
    return classification.api_id, "regex"


async def _general_response(message: str, history: list[dict[str, Any]] | None = None) -> str:
    try:
        llm_text = await generate_general_response_with_llm(message=message, history=history)
    except LLMClientError as exc:
        raise AgentRuntimeError(f"LLM general response generation failed: {exc}") from exc
    if llm_text:
        return llm_text
    raise AgentRuntimeError("LLM general response generation failed: empty response text.")


def sse_event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def trace_payload(turn_id: str, data: dict[str, Any], branch: str | None = None) -> dict[str, Any]:
    payload = {
        "turnId": turn_id,
        "physicalEmitter": "main-agent",
        "emittedAt": datetime.now(timezone.utc).isoformat(),
        **data,
    }
    if branch:
        payload["branch"] = branch
    return payload


def surface_template_id(surface: dict[str, Any] | None) -> str | None:
    if not surface:
        return None
    template_id = surface.get("templateId")
    return template_id if isinstance(template_id, str) else None


def business_tool_event_payload(tool_result: BusinessToolResult) -> dict[str, Any]:
    return {
        "label": tool_result.tool_name,
        "apiId": tool_result.api_id,
        "sourceToolName": tool_result.tool_name,
        "sourceToolResultId": tool_result.metadata.get("sourceToolResultId"),
        "sourceDataHash": tool_result.metadata.get("sourceDataHash"),
        "sourceRowCount": tool_result.metadata.get("sourceRowCount"),
        "sourceDataShape": tool_result.metadata.get("sourceDataShape"),
        "rawToolResult": tool_result.data,
    }


def render_tool_event_payload(a2ui_tool_result: A2UIRenderToolResult) -> dict[str, Any]:
    metadata = a2ui_tool_result.metadata
    return {
        "label": a2ui_tool_result.tool_name,
        "renderToolName": a2ui_tool_result.tool_name,
        "renderToolCallPolicy": metadata.get("renderToolCallPolicy"),
        "sourceToolName": metadata.get("sourceToolName"),
        "sourceToolResultId": metadata.get("sourceToolResultId"),
        "dataIntegrity": metadata.get("dataIntegrity"),
        "sourceTool": metadata.get("sourceTool"),
    }


def a2ui_progress_event_payload(progress: dict[str, Any]) -> dict[str, Any]:
    data = progress.get("data") if isinstance(progress.get("data"), dict) else {}
    status = progress.get("status")
    label = progress.get("label") or status or "a2ui_progress"
    detail = progress.get("detail")
    return {
        **data,
        "status": status,
        "label": label,
        "detail": detail,
        "liveA2UIProgress": True,
        "physicalEmitter": "a2ui-agent",
        "a2aTaskId": progress.get("taskId"),
        "a2aProgressEmittedAt": progress.get("emittedAt"),
    }


async def _run_a2ui_tool(
    message: str,
    business_tool_result: BusinessToolResult,
    intent_source: str,
) -> A2UIRenderToolResult:
    try:
        return await run_a2ui_render_tool(
            A2UIRenderToolInput(
                query=message,
                business_tool_result=business_tool_result,
                context={"intentSource": intent_source},
            )
        )
    except RenderBoundaryError as exc:
        raise AgentRuntimeError(str(exc)) from exc


async def _stream_a2ui_tool(
    message: str,
    business_tool_result: BusinessToolResult,
    intent_source: str,
) -> AsyncIterator[dict[str, Any]]:
    try:
        async for event in stream_a2ui_render_tool(
            A2UIRenderToolInput(
                query=message,
                business_tool_result=business_tool_result,
                context={"intentSource": intent_source},
            )
        ):
            yield event
    except RenderBoundaryError as exc:
        raise AgentRuntimeError(str(exc)) from exc


async def run_chat_turn(message: str, history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    api_id, intent_source = await _choose_api(message, history)
    if not api_id:
        return {
            "text": await _general_response(message, history),
            "surface": None,
            "mode": "text_fallback",
            "reason": "No equipment intent detected by regex router.",
            "intent_source": intent_source,
            "matcher": {
                "strategy": None,
                "score": None,
                "candidates": None,
                "mapping": None,
            },
        }

    business_tool_name = business_tool_for_api(api_id)
    business_tool_result = await run_business_tool(business_tool_name)
    a2ui_tool_result = await _run_a2ui_tool(message, business_tool_result, intent_source)

    if a2ui_tool_result.type == "surface" and a2ui_tool_result.surface:
        return {
            "text": f"{equipment_api_title(api_id)}입니다. 등록된 A2UI 템플릿으로 정리했습니다.",
            "surface": a2ui_tool_result.surface,
            "mode": "render_surface",
            "reason": a2ui_tool_result.reason,
            "intent_source": intent_source,
            "tool_metadata": a2ui_tool_result.metadata,
            "matcher": {
                "strategy": a2ui_tool_result.strategy,
                "score": a2ui_tool_result.score,
                "candidates": a2ui_tool_result.candidates,
                "mapping": a2ui_tool_result.mapping,
            },
        }

    return {
        "text": a2ui_tool_result.text or a2ui_tool_result.fallback_text,
        "surface": None,
        "mode": "text_fallback",
        "reason": a2ui_tool_result.reason,
        "intent_source": intent_source,
        "tool_metadata": a2ui_tool_result.metadata,
        "matcher": {
            "strategy": a2ui_tool_result.strategy,
            "score": a2ui_tool_result.score,
            "candidates": a2ui_tool_result.candidates,
            "mapping": a2ui_tool_result.mapping,
        },
    }


async def stream_chat_turn(message: str, history: list[dict[str, Any]] | None = None) -> AsyncIterator[str]:
    turn_id = f"turn-{uuid4()}"
    try:
        yield sse_event("state", trace_payload(turn_id, {"status": "planning", "label": "장비 요청 해석"}))
        api_id, intent_source = await _choose_api(message, history)
        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": "intent",
                    "label": api_id or "general",
                    "source": intent_source,
                    "intentRouter": "regex",
                },
                "data" if api_id else "general",
            ),
        )
        if not api_id:
            yield sse_event("text", trace_payload(turn_id, {"text": await _general_response(message, history)}, "general"))
            yield sse_event(
                "done",
                trace_payload(
                    turn_id,
                    {
                        "mode": "text_fallback",
                        "branch": "general",
                        "reason": "No equipment intent detected by regex router.",
                        "intent_source": intent_source,
                    },
                    "general",
                ),
            )
            return

        business_tool_name = business_tool_for_api(api_id)
        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": "business_tool_selected",
                    "label": business_tool_name,
                    "apiId": api_id,
                    "source": intent_source,
                },
                "data",
            ),
        )
        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": "business_tool_call",
                    "label": business_tool_name,
                    "apiId": api_id,
                },
                "data",
            ),
        )

        business_tool_result = await run_business_tool(business_tool_name)
        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": "business_tool_result",
                    **business_tool_event_payload(business_tool_result),
                },
                "data",
            ),
        )

        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": "a2ui_tool_selected",
                    "label": "a2ui_render",
                    "sourceToolName": business_tool_result.tool_name,
                    "sourceToolResultId": business_tool_result.metadata.get("sourceToolResultId"),
                },
                "data",
            ),
        )
        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": "a2ui_tool_call",
                    "label": "a2ui_render",
                    "sourceToolName": business_tool_result.tool_name,
                    "sourceToolResultId": business_tool_result.metadata.get("sourceToolResultId"),
                    "renderToolCallPolicy": "deterministic_after_business_tool_result",
                },
                "data",
            ),
        )

        a2ui_tool_result: A2UIRenderToolResult | None = None
        async for a2ui_event in _stream_a2ui_tool(message, business_tool_result, intent_source):
            if a2ui_event.get("type") == "progress":
                progress = a2ui_event.get("progress") if isinstance(a2ui_event.get("progress"), dict) else {}
                yield sse_event(
                    "state",
                    trace_payload(
                        turn_id,
                        a2ui_progress_event_payload(progress),
                        "data",
                    ),
                )
                continue
            if a2ui_event.get("type") == "result" and isinstance(a2ui_event.get("result"), A2UIRenderToolResult):
                a2ui_tool_result = a2ui_event["result"]

        if a2ui_tool_result is None:
            raise AgentRuntimeError("A2UI render stream completed without a result.")

        template_id = surface_template_id(a2ui_tool_result.surface)
        matcher_mode = "render_surface" if a2ui_tool_result.type == "surface" and a2ui_tool_result.surface else "no_template"
        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": "matcher",
                    "label": "AI Surface Planner result",
                    "mode": matcher_mode,
                    "templateId": template_id,
                    "reason": a2ui_tool_result.reason,
                    "strategy": a2ui_tool_result.strategy,
                    "score": a2ui_tool_result.score,
                    "candidates": a2ui_tool_result.candidates,
                    "candidateCount": len(a2ui_tool_result.candidates or []),
                    "mapping": a2ui_tool_result.mapping,
                    "dataIntegrity": a2ui_tool_result.metadata.get("dataIntegrity"),
                },
                "matched" if matcher_mode == "render_surface" else "no_template",
            ),
        )
        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": "a2ui_tool_result",
                    "mode": matcher_mode,
                    "templateId": template_id,
                    "reason": a2ui_tool_result.reason,
                    "strategy": a2ui_tool_result.strategy,
                    "score": a2ui_tool_result.score,
                    "candidateCount": len(a2ui_tool_result.candidates or []),
                    **render_tool_event_payload(a2ui_tool_result),
                },
                "data",
            ),
        )

        if a2ui_tool_result.type == "surface" and a2ui_tool_result.surface:
            yield sse_event(
                "text",
                trace_payload(
                    turn_id,
                    {"text": f"{equipment_api_title(api_id)}입니다. 등록된 A2UI 템플릿으로 정리했습니다."},
                    "matched",
                ),
            )
            yield sse_event("surface", trace_payload(turn_id, {"surface": a2ui_tool_result.surface, "templateId": template_id}, "matched"))
            yield sse_event(
                "done",
                trace_payload(
                    turn_id,
                    {
                        "mode": "render_surface",
                        "branch": "matched",
                        "templateId": template_id,
                        "reason": a2ui_tool_result.reason,
                        "strategy": a2ui_tool_result.strategy,
                        "score": a2ui_tool_result.score,
                        "candidates": a2ui_tool_result.candidates,
                        "mapping": a2ui_tool_result.mapping,
                        "tool_metadata": a2ui_tool_result.metadata,
                    },
                    "matched",
                ),
            )
            return

        yield sse_event("text", trace_payload(turn_id, {"text": a2ui_tool_result.text or a2ui_tool_result.fallback_text}, "no_template"))
        yield sse_event(
            "done",
            trace_payload(
                turn_id,
                {
                    "mode": "text_fallback",
                    "branch": "no_template",
                    "reason": a2ui_tool_result.reason,
                    "strategy": a2ui_tool_result.strategy,
                    "score": a2ui_tool_result.score,
                    "candidates": a2ui_tool_result.candidates,
                    "mapping": a2ui_tool_result.mapping,
                    "tool_metadata": a2ui_tool_result.metadata,
                },
                "no_template",
            ),
        )
    except Exception as exc:
        logger.exception(
            "[main-agent] chat stream failed turnId=%s errorType=%s detail=%s",
            turn_id,
            exc.__class__.__name__,
            exc,
        )
        yield sse_event(
            "error",
            trace_payload(
                turn_id,
                {
                    "message": "Agent가 장비 데이터를 조회하거나 처리하지 못했습니다. Python 실행 로그를 확인해 주세요.",
                },
                "error",
            ),
        )
        yield sse_event("done", trace_payload(turn_id, {"mode": "error", "branch": "error"}, "error"))

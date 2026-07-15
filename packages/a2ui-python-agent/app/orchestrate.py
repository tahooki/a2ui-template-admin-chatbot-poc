import json
import logging
from datetime import datetime, timezone
from typing import Any, AsyncIterator
from uuid import uuid4

from .ai.llm_client import LLMClientError, generate_general_response_with_llm
from .business_tools import BusinessToolResult, run_business_tool
from .equipment_tools import equipment_api_title
from .intent_router import choose_api_by_regex
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


def business_tool_event_payload(tool_result: BusinessToolResult) -> dict[str, Any]:
    return {
        "label": tool_result.tool_name,
        "apiId": tool_result.api_id,
        "sourceToolName": tool_result.tool_name,
        "sourceToolResultId": tool_result.metadata.get("sourceToolResultId"),
        "sourceDataHash": tool_result.metadata.get("sourceDataHash"),
        "sourceRowCount": tool_result.metadata.get("sourceRowCount"),
        "sourceDataShape": tool_result.metadata.get("sourceDataShape"),
    }


def data_result_payload(
    tool_result: BusinessToolResult,
    *,
    query: str,
    intent_source: str,
) -> dict[str, Any]:
    return {
        "kind": "main_agent.data_result",
        "query": query,
        "apiId": tool_result.api_id,
        "intentSource": intent_source,
        "sourceToolName": tool_result.tool_name,
        "sourceToolResultId": tool_result.metadata.get("sourceToolResultId"),
        "data": tool_result.data,
        "metadata": tool_result.metadata,
    }


def data_response_text(api_id: str) -> str:
    return f"{equipment_api_title(api_id)} 데이터를 조회 중입니다. 데이터 조회 후 원하는 화면 형식을 선택할 수 있습니다."


async def run_chat_turn(message: str, history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    api_id, intent_source = await _choose_api(message, history)
    if not api_id:
        return {
            "text": await _general_response(message, history),
            "data_result": None,
            "mode": "text",
            "intent_source": intent_source,
        }

    business_tool_name = business_tool_for_api(api_id)
    business_tool_result = await run_business_tool(business_tool_name)
    return {
        "text": data_response_text(api_id),
        "data_result": data_result_payload(
            business_tool_result,
            query=message,
            intent_source=intent_source,
        ),
        "mode": "data_result",
        "intent_source": intent_source,
    }


async def stream_chat_turn(message: str, history: list[dict[str, Any]] | None = None) -> AsyncIterator[str]:
    turn_id = f"turn-{uuid4()}"
    try:
        yield sse_event("state", trace_payload(turn_id, {"status": "planning", "label": "요청 해석"}))
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
                        "mode": "text",
                        "branch": "general",
                        "reason": "No business data intent detected by regex router.",
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
            "text",
            trace_payload(turn_id, {"text": data_response_text(api_id)}, "data"),
        )
        yield sse_event(
            "data_result",
            trace_payload(
                turn_id,
                data_result_payload(
                    business_tool_result,
                    query=message,
                    intent_source=intent_source,
                ),
                "data",
            ),
        )
        yield sse_event(
            "done",
            trace_payload(
                turn_id,
                {
                    "mode": "data_result",
                    "branch": "data",
                    "apiId": api_id,
                    "sourceToolName": business_tool_result.tool_name,
                    "sourceToolResultId": business_tool_result.metadata.get("sourceToolResultId"),
                },
                "data",
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
                    "message": "Main Agent가 요청을 처리하지 못했습니다. 실행 로그를 확인해 주세요.",
                    "errorType": exc.__class__.__name__,
                },
                "error",
            ),
        )
        yield sse_event("done", trace_payload(turn_id, {"mode": "error", "branch": "error"}, "error"))

import json
from datetime import datetime, timezone
from typing import Any, AsyncIterator
from uuid import uuid4

from .a2ui_agent import render_or_fallback
from .ai.llm_client import (
    classify_equipment_intent_with_llm,
    generate_equipment_fallback_text,
    generate_general_response_with_llm,
    is_llm_available,
)
from .config import settings
from .equipment_tools import (
    build_data_profile,
    equipment_api_title,
    fetch_equipment_data,
)
from .schema import build_derived_schema, build_sample_data_preview


class AgentRuntimeError(RuntimeError):
    pass


async def _choose_api(message: str, history: list[dict[str, Any]] | None = None) -> tuple[str | None, str]:
    if not is_llm_available():
        raise AgentRuntimeError("LLM is not configured. Set OPENAI_API_KEY before using the agent.")

    llm_classification = await classify_equipment_intent_with_llm(message, history)
    if llm_classification is None:
        raise AgentRuntimeError("LLM intent classification failed.")
    return llm_classification["api_id"], "llm"


async def _general_response(message: str, history: list[dict[str, Any]] | None = None) -> str:
    llm_text = await generate_general_response_with_llm(message=message, history=history)
    if llm_text:
        return llm_text
    raise AgentRuntimeError("LLM general response generation failed.")


async def _fallback_text(
    message: str,
    api_id: str,
    data: dict[str, Any],
    profile: dict[str, Any],
    reason: str | None = None,
) -> str:
    llm_text = await generate_equipment_fallback_text(
        message=message,
        api_id=api_id,
        data=data,
        profile=profile,
        reason=reason,
    )
    if llm_text:
        return llm_text
    raise AgentRuntimeError("LLM equipment fallback generation failed.")


def sse_event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def trace_payload(turn_id: str, data: dict[str, Any], branch: str | None = None) -> dict[str, Any]:
    payload = {
        "turnId": turn_id,
        "physicalEmitter": "python-agent",
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


async def run_chat_turn(message: str, history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    api_id, intent_source = await _choose_api(message, history)
    if not api_id:
        return {
            "text": await _general_response(message, history),
            "surface": None,
            "mode": "text_fallback",
            "reason": "No equipment intent detected by LLM.",
            "intent_source": intent_source,
            "matcher": {
                "strategy": None,
                "score": None,
                "candidates": None,
                "mapping": None,
            },
        }

    data = await fetch_equipment_data(api_id)
    profile = build_data_profile(data)
    sample_data_preview = build_sample_data_preview(data, source_id=api_id)
    derived_schema = build_derived_schema(data, source_id=api_id, sample_data_preview=sample_data_preview)
    fallback_text = await _fallback_text(message, api_id, data, profile)
    a2ui = await render_or_fallback(message, api_id, data, profile, fallback_text, derived_schema, sample_data_preview)

    if a2ui.type == "surface" and a2ui.surface:
        return {
            "text": f"{equipment_api_title(api_id)}입니다. 등록된 A2UI 템플릿으로 정리했습니다.",
            "surface": a2ui.surface,
            "mode": "render_surface",
            "reason": a2ui.reason,
            "intent_source": intent_source,
            "matcher": {
                "strategy": a2ui.strategy,
                "score": a2ui.score,
                "candidates": a2ui.candidates,
                "mapping": a2ui.mapping,
            },
        }

    return {
        "text": a2ui.text or fallback_text,
        "surface": None,
        "mode": "text_fallback",
        "reason": a2ui.reason,
        "intent_source": intent_source,
        "matcher": {
            "strategy": a2ui.strategy,
            "score": a2ui.score,
            "candidates": a2ui.candidates,
            "mapping": a2ui.mapping,
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
                    "llmConfigured": is_llm_available(),
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
                        "reason": "No equipment intent detected by LLM.",
                        "intent_source": intent_source,
                    },
                    "general",
                ),
            )
            return

        yield sse_event("state", trace_payload(turn_id, {"status": "tool", "label": api_id}, "data"))

        data = await fetch_equipment_data(api_id)
        profile = build_data_profile(data)
        sample_data_preview = build_sample_data_preview(data, source_id=api_id)
        derived_schema = build_derived_schema(data, source_id=api_id, sample_data_preview=sample_data_preview)
        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": "data_loaded",
                    "label": api_id,
                    "rowCount": profile["rowCount"],
                    "previewRowCount": sample_data_preview["rowCount"],
                    "previewSampleSize": sample_data_preview["sampleSize"],
                },
                "data",
            ),
        )
        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": "profile",
                    "rowCount": profile["rowCount"],
                    "hasImageField": profile["hasImageField"],
                    "booleanFieldCount": profile["booleanFieldCount"],
                    "previewRowCount": sample_data_preview["rowCount"],
                    "previewSampleSize": sample_data_preview["sampleSize"],
                },
                "data",
            ),
        )
        fallback_text = await _fallback_text(message, api_id, data, profile)
        transport = "a2a" if settings.a2a_enabled else "mcp"
        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": transport,
                    "label": "A2UI Agent" if settings.a2a_enabled else "a2ui.recommendTemplate",
                    "transport": transport,
                },
                "data",
            ),
        )
        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": "registry_loaded",
                    "label": "A2UI Registry",
                    "transport": transport,
                },
                "data",
            ),
        )

        a2ui = await render_or_fallback(message, api_id, data, profile, fallback_text, derived_schema, sample_data_preview)
        template_id = surface_template_id(a2ui.surface)
        matcher_mode = "render_surface" if a2ui.type == "surface" and a2ui.surface else "no_template"
        yield sse_event(
            "state",
            trace_payload(
                turn_id,
                {
                    "status": "matcher",
                    "mode": matcher_mode,
                    "templateId": template_id,
                    "reason": a2ui.reason,
                    "strategy": a2ui.strategy,
                    "score": a2ui.score,
                    "candidates": a2ui.candidates,
                    "candidateCount": len(a2ui.candidates or []),
                    "mapping": a2ui.mapping,
                },
                "matched" if matcher_mode == "render_surface" else "no_template",
            ),
        )

        if a2ui.type == "surface" and a2ui.surface:
            yield sse_event(
                "text",
                trace_payload(
                    turn_id,
                    {"text": f"{equipment_api_title(api_id)}입니다. 등록된 A2UI 템플릿으로 정리했습니다."},
                    "matched",
                ),
            )
            yield sse_event("surface", trace_payload(turn_id, {"surface": a2ui.surface, "templateId": template_id}, "matched"))
            yield sse_event(
                "done",
                trace_payload(
                    turn_id,
                    {
                        "mode": "render_surface",
                        "branch": "matched",
                        "templateId": template_id,
                        "reason": a2ui.reason,
                        "strategy": a2ui.strategy,
                        "score": a2ui.score,
                        "candidates": a2ui.candidates,
                        "mapping": a2ui.mapping,
                    },
                    "matched",
                ),
            )
            return

        yield sse_event("text", trace_payload(turn_id, {"text": a2ui.text or fallback_text}, "no_template"))
        yield sse_event(
            "done",
            trace_payload(
                turn_id,
                {
                    "mode": "text_fallback",
                    "branch": "no_template",
                    "reason": a2ui.reason,
                    "strategy": a2ui.strategy,
                    "score": a2ui.score,
                    "candidates": a2ui.candidates,
                    "mapping": a2ui.mapping,
                },
                "no_template",
            ),
        )
    except Exception as exc:
        yield sse_event(
            "error",
            trace_payload(turn_id, {"message": "Agent가 장비 데이터를 조회하거나 처리하지 못했습니다.", "details": str(exc)}, "error"),
        )
        yield sse_event("done", trace_payload(turn_id, {"mode": "error", "branch": "error"}, "error"))

import json
from typing import Any, AsyncIterator

from .a2ui_agent import render_or_fallback
from .ai.llm_client import (
    choose_equipment_api_with_llm,
    generate_equipment_fallback_text,
    is_llm_available,
)
from .equipment_tools import (
    build_data_profile,
    build_catalog_fallback,
    build_status_fallback,
    choose_equipment_api,
    equipment_api_title,
    fetch_equipment_data,
)
from .schema import build_derived_schema, build_sample_data_preview


def _deterministic_fallback(api_id: str, data: dict[str, Any]) -> str:
    return (
        build_catalog_fallback(data)
        if api_id == "equipment-catalog"
        else build_status_fallback(data)
    )


async def _choose_api(message: str, history: list[dict[str, Any]] | None = None) -> tuple[str, str]:
    llm_api_id = await choose_equipment_api_with_llm(message, history)
    if llm_api_id:
        return llm_api_id, "llm"
    return choose_equipment_api(message), "rule"


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
    return llm_text or _deterministic_fallback(api_id, data)


def sse_event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def run_chat_turn(message: str, history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    api_id, intent_source = await _choose_api(message, history)
    data = await fetch_equipment_data(api_id)
    profile = build_data_profile(data)
    sample_data_preview = build_sample_data_preview(data, source_id=api_id)
    derived_schema = build_derived_schema(data, source_id=api_id, sample_data_preview=sample_data_preview)
    fallback_text = _deterministic_fallback(api_id, data)
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
        "text": await _fallback_text(message, api_id, data, profile, a2ui.reason),
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
    try:
        yield sse_event("state", {"status": "planning", "label": "장비 요청 해석"})
        api_id, intent_source = await _choose_api(message, history)
        yield sse_event(
            "state",
            {
                "status": "intent",
                "label": api_id,
                "source": intent_source,
                "llmConfigured": is_llm_available(),
            },
        )
        yield sse_event("state", {"status": "tool", "label": api_id})

        data = await fetch_equipment_data(api_id)
        profile = build_data_profile(data)
        sample_data_preview = build_sample_data_preview(data, source_id=api_id)
        derived_schema = build_derived_schema(data, source_id=api_id, sample_data_preview=sample_data_preview)
        yield sse_event(
            "state",
            {
                "status": "profile",
                "rowCount": profile["rowCount"],
                "hasImageField": profile["hasImageField"],
                "booleanFieldCount": profile["booleanFieldCount"],
                "previewRowCount": sample_data_preview["rowCount"],
                "previewSampleSize": sample_data_preview["sampleSize"],
            },
        )
        fallback_text = (
            build_catalog_fallback(data)
            if api_id == "equipment-catalog"
            else build_status_fallback(data)
        )
        yield sse_event("state", {"status": "mcp", "label": "a2ui.recommendTemplate"})

        a2ui = await render_or_fallback(message, api_id, data, profile, fallback_text, derived_schema, sample_data_preview)
        yield sse_event(
            "state",
            {
                "status": "matcher",
                "strategy": a2ui.strategy,
                "score": a2ui.score,
                "candidates": a2ui.candidates,
                "candidateCount": len(a2ui.candidates or []),
                "mapping": a2ui.mapping,
            },
        )

        if a2ui.type == "surface" and a2ui.surface:
            yield sse_event("text", {"text": f"{equipment_api_title(api_id)}입니다. 등록된 A2UI 템플릿으로 정리했습니다."})
            yield sse_event("surface", {"surface": a2ui.surface})
            yield sse_event(
                "done",
                {
                    "mode": "render_surface",
                    "reason": a2ui.reason,
                    "strategy": a2ui.strategy,
                    "score": a2ui.score,
                    "candidates": a2ui.candidates,
                    "mapping": a2ui.mapping,
                },
            )
            return

        yield sse_event("text", {"text": await _fallback_text(message, api_id, data, profile, a2ui.reason)})
        yield sse_event(
            "done",
            {
                "mode": "text_fallback",
                "reason": a2ui.reason,
                "strategy": a2ui.strategy,
                "score": a2ui.score,
                "candidates": a2ui.candidates,
                "mapping": a2ui.mapping,
            },
        )
    except Exception as exc:
        yield sse_event("error", {"message": "Agent가 장비 데이터를 조회하거나 처리하지 못했습니다.", "details": str(exc)})
        yield sse_event("done", {"mode": "error"})

from dataclasses import dataclass
from collections.abc import AsyncIterator
from typing import Any

from .a2ui_agent import A2UIResponse, render_or_fallback, render_or_fallback_stream
from .ai.llm_client import LLMClientError, generate_equipment_fallback_text
from .equipment_tools import build_data_profile
from .business_tools import BusinessToolResult
from .schema import build_derived_schema, build_sample_data_preview


class RenderBoundaryError(RuntimeError):
    pass


@dataclass(frozen=True)
class RenderBoundaryResult:
    a2ui: A2UIResponse
    profile: dict[str, Any]
    sample_data_preview: dict[str, Any]
    derived_schema: dict[str, Any]
    fallback_text: str
    metadata: dict[str, Any]


def profile_trace_metadata(profile: dict[str, Any], sample_data_preview: dict[str, Any]) -> dict[str, Any]:
    return {
        "rowCount": profile["rowCount"],
        "hasImageField": profile["hasImageField"],
        "booleanFieldCount": profile["booleanFieldCount"],
        "previewRowCount": sample_data_preview["rowCount"],
        "previewSampleSize": sample_data_preview["sampleSize"],
    }


def deterministic_fallback_text(api_id: str, profile: dict[str, Any], sample_data_preview: dict[str, Any]) -> str:
    row_count = sample_data_preview.get("rowCount", profile.get("rowCount", 0))
    sample_size = sample_data_preview.get("sampleSize", 0)
    return (
        f"{api_id} 데이터를 확인했습니다. 총 {row_count}건 중 {sample_size}건의 bounded preview로 "
        "스키마를 판단했지만, 표시 가능한 A2UI 템플릿을 찾지 못했습니다."
    )


async def _fallback_text(
    message: str,
    api_id: str,
    data: dict[str, Any],
    profile: dict[str, Any],
    reason: str | None = None,
) -> str:
    try:
        llm_text = await generate_equipment_fallback_text(
            message=message,
            api_id=api_id,
            data=data,
            profile=profile,
            reason=reason,
        )
    except LLMClientError as exc:
        raise RenderBoundaryError(f"LLM equipment fallback generation failed: {exc}") from exc
    if llm_text:
        return llm_text
    raise RenderBoundaryError("LLM equipment fallback generation failed: empty response text.")


async def _llm_fallback_text_for_preview(
    message: str,
    api_id: str,
    sample_data_preview: dict[str, Any],
    profile: dict[str, Any],
    reason: str | None,
) -> str:
    preview_data = sample_data_preview.get("data")
    data = preview_data if isinstance(preview_data, dict) else {"items": [], "total": sample_data_preview.get("rowCount", 0)}
    return await _fallback_text(message, api_id, data, profile, reason)


def a2ui_with_text(a2ui: A2UIResponse, text: str) -> A2UIResponse:
    return A2UIResponse(
        type=a2ui.type,
        text=text,
        surface=a2ui.surface,
        reason=a2ui.reason,
        strategy=a2ui.strategy,
        score=a2ui.score,
        candidates=a2ui.candidates,
        mapping=a2ui.mapping,
        source_tool=a2ui.source_tool,
        data_integrity=a2ui.data_integrity,
    )


async def render_business_tool_result(
    query: str,
    business_tool_result: BusinessToolResult,
    extra_metadata: dict[str, Any] | None = None,
) -> RenderBoundaryResult:
    api_id = business_tool_result.api_id
    data = business_tool_result.data
    profile = build_data_profile(data)
    sample_data_preview = build_sample_data_preview(data, source_id=api_id)
    derived_schema = build_derived_schema(data, source_id=api_id, sample_data_preview=sample_data_preview)
    fallback_text = deterministic_fallback_text(api_id, profile, sample_data_preview)
    tool_metadata = {
        **(extra_metadata or {}),
        **business_tool_result.metadata,
        "sourceToolName": business_tool_result.tool_name,
        "sourceApiId": api_id,
        "renderToolName": "a2ui_render",
        "renderToolCallPolicy": "deterministic_after_business_tool_result",
    }

    a2ui = await render_or_fallback(
        query,
        api_id,
        data,
        profile,
        fallback_text,
        display_data=None,
        derived_schema=derived_schema,
        sample_data_preview=sample_data_preview,
        tool_metadata=tool_metadata,
    )
    if a2ui.type != "surface":
        fallback_text = await _llm_fallback_text_for_preview(query, api_id, sample_data_preview, profile, a2ui.reason)
        a2ui = a2ui_with_text(a2ui, fallback_text)
    metadata = {
        **tool_metadata,
        **profile_trace_metadata(profile, sample_data_preview),
        "sourceTool": a2ui.source_tool,
        "dataIntegrity": a2ui.data_integrity,
    }
    return RenderBoundaryResult(
        a2ui=a2ui,
        profile=profile,
        sample_data_preview=sample_data_preview,
        derived_schema=derived_schema,
        fallback_text=fallback_text,
        metadata=metadata,
    )


async def render_business_tool_result_stream(
    query: str,
    business_tool_result: BusinessToolResult,
    extra_metadata: dict[str, Any] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    api_id = business_tool_result.api_id
    data = business_tool_result.data
    profile = build_data_profile(data)
    sample_data_preview = build_sample_data_preview(data, source_id=api_id)
    derived_schema = build_derived_schema(data, source_id=api_id, sample_data_preview=sample_data_preview)
    fallback_text = deterministic_fallback_text(api_id, profile, sample_data_preview)
    tool_metadata = {
        **(extra_metadata or {}),
        **business_tool_result.metadata,
        "sourceToolName": business_tool_result.tool_name,
        "sourceApiId": api_id,
        "renderToolName": "a2ui_render",
        "renderToolCallPolicy": "deterministic_after_business_tool_result",
    }

    a2ui: A2UIResponse | None = None
    async for event in render_or_fallback_stream(
        query,
        api_id,
        data,
        profile,
        fallback_text,
        display_data=None,
        derived_schema=derived_schema,
        sample_data_preview=sample_data_preview,
        tool_metadata=tool_metadata,
    ):
        if event.get("type") == "progress":
            yield event
            continue
        if event.get("type") == "result" and isinstance(event.get("response"), A2UIResponse):
            a2ui = event["response"]

    if a2ui is None:
        raise RenderBoundaryError("A2A stream completed without an A2UI result.")

    if a2ui.type != "surface":
        fallback_text = await _llm_fallback_text_for_preview(query, api_id, sample_data_preview, profile, a2ui.reason)
        a2ui = a2ui_with_text(a2ui, fallback_text)

    metadata = {
        **tool_metadata,
        **profile_trace_metadata(profile, sample_data_preview),
        "sourceTool": a2ui.source_tool,
        "dataIntegrity": a2ui.data_integrity,
    }
    yield {
        "type": "result",
        "result": RenderBoundaryResult(
            a2ui=a2ui,
            profile=profile,
            sample_data_preview=sample_data_preview,
            derived_schema=derived_schema,
            fallback_text=fallback_text,
            metadata=metadata,
        ),
    }

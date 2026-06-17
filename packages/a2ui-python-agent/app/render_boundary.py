from dataclasses import dataclass
from typing import Any

from .a2ui_agent import A2UIResponse, render_or_fallback
from .ai.llm_client import generate_equipment_fallback_text
from .equipment_tools import build_data_profile
from .business_tools import BusinessToolResult
from .data_integrity import build_data_integrity_snapshot
from .data_normalization import build_display_data_trace
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
    raise RenderBoundaryError("LLM equipment fallback generation failed.")


async def render_business_tool_result(
    query: str,
    business_tool_result: BusinessToolResult,
    extra_metadata: dict[str, Any] | None = None,
) -> RenderBoundaryResult:
    api_id = business_tool_result.api_id
    data = business_tool_result.data
    display = build_display_data_trace(data)
    display_data = display["data"]
    normalization_trace = display["trace"]
    display_integrity = build_data_integrity_snapshot(display_data)
    profile = build_data_profile(display_data)
    sample_data_preview = build_sample_data_preview(display_data, source_id=api_id)
    derived_schema = build_derived_schema(display_data, source_id=api_id, sample_data_preview=sample_data_preview)
    fallback_text = await _fallback_text(query, api_id, display_data, profile)
    tool_metadata = {
        **(extra_metadata or {}),
        **business_tool_result.metadata,
        "sourceToolName": business_tool_result.tool_name,
        "sourceApiId": api_id,
        "renderToolName": "a2ui_render",
        "renderToolCallPolicy": "deterministic_after_business_tool_result",
        "normalizationTrace": normalization_trace,
        "displayDataHash": display_integrity["dataHash"],
        "displayDataByteLength": display_integrity["byteLength"],
        "displayRowCount": display_integrity["rowCount"],
        "displayDataShape": display_integrity["shape"],
    }

    a2ui = await render_or_fallback(
        query,
        api_id,
        data,
        profile,
        fallback_text,
        display_data,
        derived_schema,
        sample_data_preview,
        tool_metadata=tool_metadata,
    )
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

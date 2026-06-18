from typing import Any

from pydantic import BaseModel

from .a2a_client import A2UIA2AClient, extract_a2ui_result


class A2UIResponse(BaseModel):
    type: str
    text: str | None = None
    surface: dict[str, Any] | None = None
    reason: str | None = None
    strategy: str | None = None
    score: float | None = None
    candidates: list[dict[str, Any]] | None = None
    mapping: dict[str, Any] | None = None
    source_tool: dict[str, Any] | None = None
    data_integrity: dict[str, Any] | None = None


async def _render_via_a2a(
    query: str,
    api_id: str,
    data: dict[str, Any],
    display_data: dict[str, Any] | None,
    profile: dict[str, Any],
    fallback_text: str,
    derived_schema: dict[str, Any] | None = None,
    sample_data_preview: dict[str, Any] | None = None,
    tool_metadata: dict[str, Any] | None = None,
    a2a_url: str | None = None,
) -> A2UIResponse:
    client = A2UIA2AClient(a2a_url)
    payload = A2UIA2AClient.render_request(
        query=query,
        api_id=api_id,
        data=data,
        display_data=display_data,
        profile=profile,
        fallback_text=fallback_text,
        derived_schema=derived_schema,
        sample_data_preview=sample_data_preview,
        tool_metadata=tool_metadata,
    )
    result = extract_a2ui_result(await client.send_message(payload))
    if result.get("type") == "surface" and result.get("surface"):
        return A2UIResponse(
            type="surface",
            surface=result.get("surface"),
            reason=result.get("reason"),
            strategy=result.get("strategy"),
            score=result.get("score"),
            candidates=result.get("candidates"),
            mapping=result.get("mapping"),
            source_tool=result.get("sourceTool"),
            data_integrity=result.get("dataIntegrity"),
        )

    return A2UIResponse(
        type="text_fallback",
        text=result.get("text") or fallback_text,
        reason=result.get("reason") or "No matching A2UI surface artifact.",
        strategy=result.get("strategy"),
        score=result.get("score"),
        candidates=result.get("candidates"),
        mapping=result.get("mapping"),
        source_tool=result.get("sourceTool"),
        data_integrity=result.get("dataIntegrity"),
    )


async def render_or_fallback(
    query: str,
    api_id: str,
    data: dict[str, Any],
    profile: dict[str, Any],
    fallback_text: str,
    display_data: dict[str, Any] | None = None,
    derived_schema: dict[str, Any] | None = None,
    sample_data_preview: dict[str, Any] | None = None,
    tool_metadata: dict[str, Any] | None = None,
    a2a_url: str | None = None,
) -> A2UIResponse:
    try:
        return await _render_via_a2a(
            query,
            api_id,
            data,
            display_data,
            profile,
            fallback_text,
            derived_schema,
            sample_data_preview,
            tool_metadata,
            a2a_url,
        )
    except Exception as exc:
        return A2UIResponse(type="text_fallback", text=fallback_text, reason=str(exc), source_tool=tool_metadata)

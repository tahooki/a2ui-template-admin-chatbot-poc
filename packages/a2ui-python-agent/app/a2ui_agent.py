import json
from typing import Any

import httpx
from pydantic import BaseModel

from .a2a_client import A2UIA2AClient, extract_a2ui_result
from .config import settings


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


class A2UIMcpClient:
    def __init__(self, server_url: str | None = None):
        self.server_url = server_url or settings.mcp_url
        self._session_id: str | None = None
        self._request_id = 0

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self._session_id:
            headers["mcp-session-id"] = self._session_id
        return headers

    @staticmethod
    def _decode_tool_result(result: dict[str, Any]) -> dict[str, Any]:
        if "error" in result:
            return {"error": result["error"].get("message", "MCP call failed")}

        content = result.get("result", {}).get("content", [])
        for item in content:
            if item.get("type") == "text":
                try:
                    return json.loads(item.get("text") or "{}")
                except json.JSONDecodeError:
                    return {"raw": item.get("text")}
        return {}

    async def initialize(self, client: httpx.AsyncClient) -> None:
        if self._session_id:
            return

        response = await client.post(
            self.server_url,
            json={
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {
                        "name": "a2ui-template-main-agent",
                        "version": "0.1.0",
                    },
                },
            },
            headers=self._headers(),
        )
        response.raise_for_status()
        self._session_id = response.headers.get("mcp-session-id", self._session_id)

        await client.post(
            self.server_url,
            json={"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
            headers=self._headers(),
        )

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            await self.initialize(client)
            response = await client.post(
                self.server_url,
                json={
                    "jsonrpc": "2.0",
                    "id": self._next_id(),
                    "method": "tools/call",
                    "params": {
                        "name": name,
                        "arguments": arguments,
                    },
                },
                headers=self._headers(),
            )
            response.raise_for_status()
            return self._decode_tool_result(response.json())


async def _render_via_a2a(
    query: str,
    api_id: str,
    data: dict[str, Any],
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


async def _render_via_mcp(
    query: str,
    api_id: str,
    data: dict[str, Any],
    profile: dict[str, Any],
    fallback_text: str,
    derived_schema: dict[str, Any] | None = None,
    sample_data_preview: dict[str, Any] | None = None,
    tool_metadata: dict[str, Any] | None = None,
    mcp_url: str | None = None,
) -> A2UIResponse:
    facts = {
        "query": query,
        "apiId": api_id,
        "profile": profile,
        **(tool_metadata or {}),
    }
    client = A2UIMcpClient(mcp_url)
    decision = await client.call_tool(
        "a2ui.recommendTemplate",
        {
            "query": query,
            "apiId": api_id,
            "derivedSchema": derived_schema,
            "sampleDataPreview": sample_data_preview,
            "options": {
                "includeTrace": True,
                "allowIntentFallback": True,
            },
            "facts": facts,
        },
    )

    if decision.get("mode") != "render_surface" or not decision.get("templateId"):
        return A2UIResponse(
            type="text_fallback",
            text=fallback_text,
            reason=decision.get("reason") or "No matching A2UI template.",
            strategy=decision.get("strategy"),
            score=decision.get("score"),
            candidates=decision.get("candidates"),
            mapping=decision.get("mapping"),
            source_tool=tool_metadata,
        )

    surface = await client.call_tool(
        "a2ui.resolveTemplateData",
        {
            "templateId": decision["templateId"],
            "mapping": decision.get("mapping"),
            "context": {
                "query": query,
                "apiId": api_id,
                "data": data,
                "profile": profile,
                "derivedSchema": derived_schema,
                "sampleDataPreview": sample_data_preview,
                "mapping": decision.get("mapping"),
                "toolMetadata": tool_metadata,
            },
        },
    )
    if "error" in surface:
        return A2UIResponse(
            type="text_fallback",
            text=fallback_text,
            reason=surface["error"],
            strategy=decision.get("strategy"),
            score=decision.get("score"),
            candidates=decision.get("candidates"),
            mapping=decision.get("mapping"),
            source_tool=tool_metadata,
        )

    return A2UIResponse(
        type="surface",
        surface=surface,
        reason=decision.get("reason"),
        strategy=decision.get("strategy"),
        score=decision.get("score"),
        candidates=decision.get("candidates"),
        mapping=decision.get("mapping"),
        source_tool=tool_metadata,
    )


async def render_or_fallback(
    query: str,
    api_id: str,
    data: dict[str, Any],
    profile: dict[str, Any],
    fallback_text: str,
    derived_schema: dict[str, Any] | None = None,
    sample_data_preview: dict[str, Any] | None = None,
    tool_metadata: dict[str, Any] | None = None,
    mcp_url: str | None = None,
    a2a_url: str | None = None,
) -> A2UIResponse:
    if settings.a2a_enabled:
        try:
            return await _render_via_a2a(
                query,
                api_id,
                data,
                profile,
                fallback_text,
                derived_schema,
                sample_data_preview,
                tool_metadata,
                a2a_url,
            )
        except Exception as exc:
            if not settings.a2a_fallback_to_mcp:
                return A2UIResponse(type="text_fallback", text=fallback_text, reason=str(exc), source_tool=tool_metadata)

    try:
        return await _render_via_mcp(
            query,
            api_id,
            data,
            profile,
            fallback_text,
            derived_schema,
            sample_data_preview,
            tool_metadata,
            mcp_url,
        )
    except Exception as exc:
        return A2UIResponse(type="text_fallback", text=fallback_text, reason=str(exc), source_tool=tool_metadata)

import json
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

import httpx

from .config import settings

A2A_RENDER_REQUEST = "application/vnd.a2ui.render-request+json"
A2A_SURFACE = "application/vnd.a2ui.surface+json"
A2A_JSON = "application/a2a+json"
A2A_VERSION = "1.0"


class A2UIA2AClient:
    def __init__(
        self,
        server_url: str | None = None,
        token: str | None = None,
    ) -> None:
        self.server_url = (server_url or settings.a2a_url).rstrip("/")
        self.token = token if token is not None else settings.a2a_token

    def _headers(self, stream: bool = False) -> dict[str, str]:
        headers = {
            "Content-Type": A2A_JSON,
            "Accept": "text/event-stream" if stream else A2A_JSON,
            "A2A-Version": A2A_VERSION,
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    @staticmethod
    def render_request(
        *,
        query: str,
        api_id: str,
        data: dict[str, Any],
        profile: dict[str, Any],
        fallback_text: str,
        derived_schema: dict[str, Any] | None = None,
        sample_data_preview: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        intent_key = "equipment.catalog.lookup" if api_id == "equipment-catalog" else "equipment.status.lookup"
        return {
            "configuration": {
                "acceptedOutputModes": [A2A_SURFACE, "text/plain"],
                "returnImmediately": False,
            },
            "message": {
                "messageId": f"msg-{uuid4()}",
                "contextId": f"ctx-{uuid4()}",
                "role": "ROLE_USER",
                "parts": [
                    {"text": query},
                    {
                        "mediaType": A2A_RENDER_REQUEST,
                        "data": {
                            "kind": "a2ui.render.request",
                            "query": query,
                            "intentKey": intent_key,
                            "facts": {
                                "apiId": api_id,
                                "data": data,
                                "profile": profile,
                                "fallbackText": fallback_text,
                            },
                            "sampleDataPreview": sample_data_preview,
                            "derivedSchema": derived_schema,
                            "fallbackText": fallback_text,
                            "a2uiOptions": {
                                "includeTrace": True,
                                "allowLegacyIntentFallback": True,
                            },
                        },
                    },
                ],
            },
        }

    async def send_message(self, body: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.post(
                f"{self.server_url}/message:send",
                json=body,
                headers=self._headers(),
            )
            response.raise_for_status()
            return response.json()

    async def stream_message(self, body: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            async with client.stream(
                "POST",
                f"{self.server_url}/message:stream",
                json=body,
                headers=self._headers(stream=True),
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line.removeprefix("data:").strip()
                    if not payload:
                        continue
                    yield json.loads(payload)


def _iter_parts(task: dict[str, Any]) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    for artifact in task.get("artifacts") or []:
        if not isinstance(artifact, dict):
            continue
        for part in artifact.get("parts") or []:
            if isinstance(part, dict):
                parts.append(part)
    return parts


def _status_text(task: dict[str, Any]) -> str | None:
    status = task.get("status") if isinstance(task.get("status"), dict) else {}
    message = status.get("message") if isinstance(status.get("message"), dict) else {}
    for part in message.get("parts") or []:
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            return part["text"]
    return None


def extract_a2ui_result(payload: dict[str, Any]) -> dict[str, Any]:
    task = payload.get("task") if isinstance(payload.get("task"), dict) else payload
    if not isinstance(task, dict):
        return {"type": "text_fallback", "reason": "A2A response did not include a task."}

    metadata = task.get("metadata") if isinstance(task.get("metadata"), dict) else {}
    for part in _iter_parts(task):
        data = part.get("data") if isinstance(part.get("data"), dict) else None
        if part.get("mediaType") == A2A_SURFACE and data:
            decision = data.get("decision") if isinstance(data.get("decision"), dict) else {}
            surface = data.get("surface") if isinstance(data.get("surface"), dict) else None
            if surface:
                return {
                    "type": "surface",
                    "surface": surface,
                    "text": _status_text(task),
                    "reason": decision.get("reason") or metadata.get("reason"),
                    "strategy": decision.get("strategy") or metadata.get("strategy"),
                    "score": decision.get("score") if isinstance(decision.get("score"), (int, float)) else metadata.get("score"),
                    "candidates": decision.get("candidates") or metadata.get("candidates"),
                    "mapping": decision.get("mapping") or metadata.get("mapping"),
                }

    for part in _iter_parts(task):
        data = part.get("data") if isinstance(part.get("data"), dict) else None
        if data and data.get("kind") == "a2ui.matcher.trace":
            metadata = {**metadata, **data}
            break

    return {
        "type": "text_fallback",
        "text": _status_text(task),
        "reason": metadata.get("reason"),
        "strategy": metadata.get("strategy"),
        "score": metadata.get("score"),
        "candidates": metadata.get("candidates"),
        "mapping": metadata.get("mapping"),
    }

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


class A2UIAgentClient:
    def __init__(self, server_url: str | None = None, token: str | None = None) -> None:
        self.server_url = (server_url or settings.a2a_url).rstrip("/")
        self.token = token if token is not None else settings.a2a_token

    def _headers(self, *, stream: bool) -> dict[str, str]:
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
        data: Any,
        metadata: dict[str, Any] | None,
        selected_template_id: str | None = None,
    ) -> dict[str, Any]:
        mode = "render_selected" if selected_template_id else "recommend"
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
                            "apiId": api_id,
                            "facts": {"apiId": api_id},
                            "data": data,
                            "toolMetadata": metadata or {},
                            "fallbackText": "조회는 완료했지만 적용할 수 있는 A2UI 화면이 없습니다.",
                            "a2uiOptions": {
                                "mode": mode,
                                "selectedTemplateId": selected_template_id,
                                "maxCandidates": 3,
                                "includeTrace": True,
                                "allowIntentFallback": True,
                            },
                        },
                    },
                ],
            },
        }

    async def stream_recommendation(
        self,
        *,
        query: str,
        api_id: str,
        data: Any,
        metadata: dict[str, Any] | None,
    ) -> AsyncIterator[dict[str, Any]]:
        body = self.render_request(query=query, api_id=api_id, data=data, metadata=metadata)
        timeout = httpx.Timeout(settings.a2a_timeout_seconds, connect=5)
        async with httpx.AsyncClient(timeout=timeout) as client:
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
                    if payload:
                        yield json.loads(payload)

    async def render_selected(
        self,
        *,
        query: str,
        api_id: str,
        data: Any,
        metadata: dict[str, Any] | None,
        template_id: str,
    ) -> dict[str, Any]:
        body = self.render_request(
            query=query,
            api_id=api_id,
            data=data,
            metadata=metadata,
            selected_template_id=template_id,
        )
        timeout = httpx.Timeout(settings.a2a_timeout_seconds, connect=5)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.server_url}/message:send",
                json=body,
                headers=self._headers(stream=False),
            )
            response.raise_for_status()
            return response.json()


def completed_task_from_stream_event(event: dict[str, Any]) -> dict[str, Any] | None:
    task = event.get("task") if isinstance(event.get("task"), dict) else None
    if task and task.get("status", {}).get("state") in {"TASK_STATE_COMPLETED", "TASK_STATE_FAILED"}:
        return task
    return None


def extract_a2ui_result(payload: dict[str, Any]) -> dict[str, Any]:
    task = payload.get("task") if isinstance(payload.get("task"), dict) else payload
    if not isinstance(task, dict):
        return {"type": "text_fallback", "reason": "A2A response did not include a task."}

    metadata = task.get("metadata") if isinstance(task.get("metadata"), dict) else {}
    for artifact in task.get("artifacts") or []:
        if not isinstance(artifact, dict):
            continue
        for part in artifact.get("parts") or []:
            if not isinstance(part, dict) or part.get("mediaType") != A2A_SURFACE:
                continue
            part_data = part.get("data") if isinstance(part.get("data"), dict) else {}
            surface = part_data.get("surface") if isinstance(part_data.get("surface"), dict) else None
            decision = part_data.get("decision") if isinstance(part_data.get("decision"), dict) else {}
            if surface:
                return {
                    "type": "surface",
                    "surface": surface,
                    "templateId": surface.get("templateId"),
                    "reason": decision.get("reason") or metadata.get("reason"),
                    "strategy": decision.get("strategy") or metadata.get("strategy"),
                    "score": decision.get("score") or metadata.get("score"),
                    "candidates": decision.get("candidates") or metadata.get("candidates") or [],
                    "mapping": decision.get("mapping") or metadata.get("mapping"),
                    "dataIntegrity": decision.get("dataIntegrity") or metadata.get("dataIntegrity"),
                }

    return {
        "type": "text_fallback",
        "reason": metadata.get("reason"),
        "candidates": metadata.get("candidates") or [],
        "dataIntegrity": metadata.get("dataIntegrity"),
    }

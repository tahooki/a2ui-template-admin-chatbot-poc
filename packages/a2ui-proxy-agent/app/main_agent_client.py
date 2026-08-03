import json
from collections.abc import AsyncIterator
from typing import Any, Protocol

import httpx

from .config import settings


class MainAgentStreamClient(Protocol):
    source_mode: str

    def stream_chat(
        self,
        *,
        message: str,
        history: list[dict[str, Any]] | None = None,
        presentation_mode: str = "a2ui",
        authorization: str | None = None,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]: ...


class MainAgentClient:
    source_mode = "remote"

    def __init__(self, server_url: str | None = None) -> None:
        self.server_url = (server_url or settings.main_agent_url).rstrip("/")

    async def stream_chat(
        self,
        *,
        message: str,
        history: list[dict[str, Any]] | None = None,
        presentation_mode: str = "a2ui",
        authorization: str | None = None,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        timeout = httpx.Timeout(settings.main_agent_timeout_seconds, connect=5)
        headers = {
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
        }
        upstream_authorization = (
            f"Bearer {settings.main_agent_bearer_token}"
            if settings.main_agent_bearer_token
            else authorization
        )
        if upstream_authorization:
            headers["Authorization"] = upstream_authorization
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST",
                f"{self.server_url}/chat/stream",
                json={"message": message, "history": history or [], "presentationMode": presentation_mode},
                headers=headers,
            ) as response:
                response.raise_for_status()
                event_name = "message"
                data_lines: list[str] = []
                async for line in response.aiter_lines():
                    if not line:
                        if data_lines:
                            yield event_name, json.loads("\n".join(data_lines))
                        event_name = "message"
                        data_lines = []
                        continue
                    if line.startswith("event:"):
                        event_name = line.removeprefix("event:").strip() or "message"
                    elif line.startswith("data:"):
                        data_lines.append(line.removeprefix("data:").lstrip())
                if data_lines:
                    yield event_name, json.loads("\n".join(data_lines))


def create_main_agent_client() -> MainAgentStreamClient:
    if settings.main_agent_mode == "remote":
        return MainAgentClient()
    if settings.main_agent_mode == "mock":
        from .mock_main_agent_client import MockMainAgentClient

        return MockMainAgentClient(
            settings.mock_main_agent_data_file
        )
    raise RuntimeError(
        "MAIN_AGENT_MODE must be 'remote' or 'mock'."
    )


def validate_main_agent_configuration() -> None:
    if settings.main_agent_mode == "remote":
        if not settings.main_agent_url.strip():
            raise RuntimeError(
                "MAIN_AGENT_URL is required in remote mode."
            )
        return
    if settings.main_agent_mode == "mock":
        from .mock_main_agent_client import load_mock_main_agent_data

        load_mock_main_agent_data(
            settings.mock_main_agent_data_file
        )
        return
    raise RuntimeError(
        "MAIN_AGENT_MODE must be 'remote' or 'mock'."
    )

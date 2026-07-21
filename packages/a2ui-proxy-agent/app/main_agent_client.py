import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from .config import settings


class MainAgentClient:
    def __init__(self, server_url: str | None = None) -> None:
        self.server_url = (server_url or settings.main_agent_url).rstrip("/")

    async def stream_chat(
        self,
        *,
        message: str,
        history: list[dict[str, Any]] | None = None,
        presentation_mode: str = "a2ui",
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        timeout = httpx.Timeout(settings.main_agent_timeout_seconds, connect=5)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST",
                f"{self.server_url}/chat/stream",
                json={"message": message, "history": history or [], "presentationMode": presentation_mode},
                headers={"Accept": "text/event-stream", "Content-Type": "application/json"},
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

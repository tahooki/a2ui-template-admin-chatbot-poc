from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .config import settings
from .orchestrate import run_chat_turn, stream_chat_turn


class ChatRequest(BaseModel):
    message: str | None = None
    input: str | None = None
    history: list[dict[str, Any]] = Field(default_factory=list)


app = FastAPI(title="A2UI Template Python Agent", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _message(body: ChatRequest) -> str:
    value = (body.message or body.input or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="message is required")
    return value


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "name": "a2ui-template-python-agent",
        "mcpUrl": settings.mcp_url,
        "nextApiBaseUrl": settings.next_api_base_url,
        "llmConfigured": bool(settings.openai_api_key),
        "openaiModel": settings.openai_model,
    }


@app.post("/chat")
async def chat(body: ChatRequest) -> dict[str, Any]:
    return await run_chat_turn(_message(body), body.history)


@app.post("/chat/stream")
async def chat_stream(body: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_chat_turn(_message(body), body.history),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )

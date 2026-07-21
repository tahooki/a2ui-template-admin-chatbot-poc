import logging
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .ai.llm_client import check_llm_connection
from .config import settings
from .orchestrate import AgentRuntimeError, run_chat_turn, stream_chat_turn


logger = logging.getLogger("uvicorn.error")


class ChatRequest(BaseModel):
    message: str | None = None
    input: str | None = None
    history: list[dict[str, Any]] = Field(default_factory=list)
    presentationMode: Literal["a2ui", "text"] = "a2ui"


async def log_llm_startup_check() -> None:
    print(
        "[main-agent] LLM config "
        f"baseUrl={settings.openai_base_url} "
        f"model={settings.openai_model} "
        f"apiKeyConfigured={bool(settings.openai_api_key)}",
        flush=True,
    )
    result = await check_llm_connection()
    status = "ok" if result.get("ok") else "failed"
    detail_parts = []
    if result.get("statusCode"):
        detail_parts.append(f"status={result['statusCode']}")
    if result.get("reason"):
        detail_parts.append(f"reason={result['reason']}")
    if result.get("responseBody"):
        detail_parts.append(f"body={result['responseBody']}")
    detail = " ".join(detail_parts) or "unknown"
    print(f"[main-agent] LLM connection check {status} detail={detail}", flush=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await log_llm_startup_check()
    yield


app = FastAPI(title="Template Data Main Agent", version="0.1.0", lifespan=lifespan)
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
        "name": "template-data-main-agent",
        "nextApiBaseUrl": settings.next_api_base_url,
        "intentRouter": "regex",
        "llmConfigured": bool(settings.openai_api_key),
        "openaiModel": settings.openai_model,
    }


@app.post("/chat")
async def chat(body: ChatRequest) -> dict[str, Any]:
    message = _message(body)
    logger.info(
        "[main-agent] chat request presentationMode=%s messageLength=%s",
        body.presentationMode,
        len(message),
    )
    try:
        return await run_chat_turn(message, body.history, presentation_mode=body.presentationMode)
    except AgentRuntimeError as exc:
        logger.exception("[main-agent] chat request failed detail=%s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/chat/stream")
async def chat_stream(body: ChatRequest) -> StreamingResponse:
    message = _message(body)
    logger.info(
        "[main-agent] chat stream request presentationMode=%s messageLength=%s",
        body.presentationMode,
        len(message),
    )
    return StreamingResponse(
        stream_chat_turn(message, body.history, presentation_mode=body.presentationMode),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )

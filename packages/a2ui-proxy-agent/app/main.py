import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import settings
from .contracts import ChatRequest, DisplaySelectionRequest
from .orchestrate import stream_chat_turn, stream_display_selection
from .static_templates import STATIC_TEMPLATE_IDS, STATIC_TEMPLATE_VERSION


logger = logging.getLogger("uvicorn.error")


app = FastAPI(title="A2UI Proxy Agent", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def stream_response(iterator) -> StreamingResponse:
    return StreamingResponse(
        iterator,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "name": "a2ui-proxy-agent",
        "mainAgentUrl": settings.main_agent_url,
        "selectionTtlSeconds": settings.selection_ttl_seconds,
        "templateMode": "proxy-ai",
        "aiPlanner": "openai-structured-output",
        "aiConfigured": bool(settings.openai_api_key),
        "openaiModel": settings.openai_model,
        "templateVersion": STATIC_TEMPLATE_VERSION,
        "templateIds": STATIC_TEMPLATE_IDS,
    }


@app.post("/chat/stream")
async def chat_stream(request: Request, body: ChatRequest) -> StreamingResponse:
    message = body.normalized_message()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")
    raw_request_body = (await request.body()).decode("utf-8", errors="replace")
    logger.info("[a2ui-proxy-agent] chat rawRequestBody=%s", raw_request_body)
    logger.info(
        "[a2ui-proxy-agent] chat request presentationMode=%s messageLength=%s",
        body.presentation_mode,
        len(message),
    )
    return stream_response(stream_chat_turn(message, body.history, presentation_mode=body.presentation_mode))


@app.post("/display-selection/stream")
async def display_selection_stream(body: DisplaySelectionRequest) -> StreamingResponse:
    if not body.selection_id or not body.template_id:
        raise HTTPException(status_code=400, detail="selectionId and templateId are required")
    return stream_response(stream_display_selection(body.selection_id, body.template_id))

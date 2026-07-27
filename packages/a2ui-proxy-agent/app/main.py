import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import settings
from .contracts import ChatRequest, DisplaySelectionRequest
from .flow_logging import log_flow
from .orchestrate import stream_chat_turn, stream_display_selection
from .static_templates import STATIC_TEMPLATE_IDS, STATIC_TEMPLATE_VERSION


logger = logging.getLogger("uvicorn.error")


app = FastAPI(title="A2UI Proxy Agent", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=settings.allow_credentials,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Accept", "Authorization", "Content-Type"],
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
        "selectionTtlSeconds": settings.selection_ttl_seconds,
        "selectionMaxEntries": settings.selection_max_entries,
        "templateMode": "proxy-ai",
        "aiPlanner": "openai-json-with-validation",
        "aiConfigured": bool(settings.openai_api_key),
        "templateVersion": STATIC_TEMPLATE_VERSION,
        "templateIds": STATIC_TEMPLATE_IDS,
    }


@app.get("/ready")
async def ready() -> dict[str, Any]:
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured",
        )
    return {
        "ready": True,
        "name": "a2ui-proxy-agent",
    }


@app.post("/chat/stream")
async def chat_stream(request: Request, body: ChatRequest) -> StreamingResponse:
    message = body.normalized_message()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")
    history = body.normalized_history()
    log_flow(
        "00_proxy_request_received",
        result={
            "messageLength": len(message),
            "historyCount": len(history),
            "presentationMode": body.presentation_mode,
        },
    )
    logger.info(
        "[a2ui-proxy-agent] chat request presentationMode=%s messageLength=%s",
        body.presentation_mode,
        len(message),
    )
    authorization = (
        request.headers.get("authorization")
        if settings.forward_authorization
        else None
    )
    return stream_response(
        stream_chat_turn(
            message,
            history,
            presentation_mode=body.presentation_mode,
            upstream_authorization=authorization,
        )
    )


@app.post("/display-selection/stream")
async def display_selection_stream(
    body: DisplaySelectionRequest,
) -> StreamingResponse:
    if not body.selection_id or not body.template_id:
        raise HTTPException(status_code=400, detail="selectionId and templateId are required")
    log_flow(
        "08_display_selection_request_received",
        selection_id=body.selection_id,
        result={
            "templateId": body.template_id,
        },
    )
    return stream_response(stream_display_selection(body.selection_id, body.template_id))

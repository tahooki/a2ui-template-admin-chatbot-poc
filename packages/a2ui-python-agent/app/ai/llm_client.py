import json
import re
from typing import Any, Literal

import httpx

from ..config import settings

EquipmentApiId = Literal["equipment-catalog", "equipment-status"]


def is_llm_available() -> bool:
    return bool(settings.openai_api_key)


def _strip_code_fence(text: str) -> str:
    stripped = text.strip()
    match = re.match(r"^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```$", stripped)
    return match.group(1).strip() if match else stripped


def _compact_json(value: object, limit: int = 5000) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except TypeError:
        text = str(value)
    return text[:limit]


async def _chat_completion(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.0,
    max_tokens: int = 800,
    response_format: dict[str, str] | None = None,
) -> str | None:
    if not is_llm_available():
        return None

    payload: dict[str, Any] = {
        "model": settings.openai_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format:
        payload["response_format"] = response_format

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{settings.openai_base_url.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if not response.is_success:
            return None

        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content")
        return content.strip() if isinstance(content, str) and content.strip() else None
    except Exception:
        return None


async def choose_equipment_api_with_llm(
    message: str,
    history: list[dict[str, Any]] | None = None,
) -> EquipmentApiId | None:
    content = await _chat_completion(
        [
            {
                "role": "system",
                "content": (
                    "You classify Korean equipment chat requests for an A2UI demo agent. "
                    "Return JSON only. Use equipment-catalog when the user wants a device/equipment list, catalog, "
                    "cards, images, photos, names, or descriptions. Use equipment-status when the user wants status, "
                    "online/running/alarm/inspection/reservation booleans, or operational state."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Recent history: {_compact_json((history or [])[-6:], 2000)}\n"
                    f"User message: {message}\n"
                    'Respond as {"apiId":"equipment-catalog|equipment-status","confidence":0.0,"reason":"short"}'
                ),
            },
        ],
        response_format={"type": "json_object"},
        max_tokens=220,
    )
    if not content:
        return None

    try:
        parsed = json.loads(_strip_code_fence(content))
    except json.JSONDecodeError:
        return None

    api_id = parsed.get("apiId")
    confidence = parsed.get("confidence", 0)
    if api_id not in ("equipment-catalog", "equipment-status"):
        return None
    if not isinstance(confidence, (int, float)) or confidence < 0.55:
        return None
    return api_id


async def generate_equipment_fallback_text(
    *,
    message: str,
    api_id: EquipmentApiId,
    data: dict[str, Any],
    profile: dict[str, Any],
    reason: str | None = None,
) -> str | None:
    rows = data.get("items") if isinstance(data.get("items"), list) else []
    sample_rows = rows[:6]
    content = await _chat_completion(
        [
            {
                "role": "system",
                "content": (
                    "You are a Korean A2UI agent. Write a concise natural answer from the provided equipment data. "
                    "Do not invent rows, counts, URLs, statuses, or fields. If no A2UI surface is available, explain "
                    "the data as bullet points. Keep it practical and demo-ready."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"User request: {message}\n"
                    f"Selected API: {api_id}\n"
                    f"A2UI fallback reason: {reason or '(none)'}\n"
                    f"Total rows: {data.get('total', len(sample_rows))}\n"
                    f"Data profile: {_compact_json(profile, 3000)}\n"
                    f"First rows: {_compact_json(sample_rows, 5000)}\n"
                    "Write Korean bullet points. Start by saying what data was checked."
                ),
            },
        ],
        temperature=0.2,
        max_tokens=900,
    )
    return content

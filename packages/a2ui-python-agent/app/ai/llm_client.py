import json
import logging
import re
from typing import Any, Literal, TypedDict

import httpx

from ..config import settings


logger = logging.getLogger("uvicorn.error")

EquipmentApiId = Literal[
    "equipment-catalog",
    "equipment-status",
    "equipment-status-wide-columns",
    "equipment-status-large-rows",
]

EQUIPMENT_API_IDS: tuple[EquipmentApiId, ...] = (
    "equipment-catalog",
    "equipment-status",
    "equipment-status-wide-columns",
    "equipment-status-large-rows",
)


class EquipmentIntentClassification(TypedDict):
    api_id: EquipmentApiId | None
    confidence: float
    reason: str | None


class LLMClientError(RuntimeError):
    def __init__(
        self,
        stage: str,
        message: str,
        *,
        status_code: int | None = None,
        response_body: str | None = None,
        exception_type: str | None = None,
    ) -> None:
        details = [f"stage={stage}", f"baseUrl={settings.openai_base_url}", f"model={settings.openai_model}", message]
        if status_code is not None:
            details.append(f"status={status_code}")
        if exception_type:
            details.append(f"exception={exception_type}")
        if response_body:
            details.append(f"body={response_body}")
        super().__init__("; ".join(details))
        self.stage = stage
        self.status_code = status_code
        self.response_body = response_body
        self.exception_type = exception_type


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


def _compact_fallback_profile(profile: dict[str, Any], field_limit: int = 18) -> dict[str, Any]:
    fields = profile.get("fields") if isinstance(profile.get("fields"), list) else []
    compact_fields: list[dict[str, Any]] = []
    for field in fields[:field_limit]:
        if not isinstance(field, dict):
            continue
        compact_fields.append(
            {
                "key": field.get("key"),
                "type": field.get("type"),
                "roles": field.get("roleCandidates") or field.get("roles") or [],
            }
        )

    return {
        "shape": profile.get("shape"),
        "rowCount": profile.get("rowCount"),
        "fieldCount": len(fields),
        "shownFieldCount": len(compact_fields),
        "omittedFieldCount": max(0, len(fields) - len(compact_fields)),
        "booleanFieldCount": profile.get("booleanFieldCount"),
        "hasImageField": profile.get("hasImageField"),
        "fields": compact_fields,
    }


def _compact_fallback_rows(rows: list[Any], row_limit: int = 3, field_limit: int = 10) -> list[Any]:
    preferred_keys = [
        "id",
        "name",
        "equipmentName",
        "status",
        "isOnline",
        "isRunning",
        "hasAlarm",
        "needsInspection",
        "isReserved",
        "location",
        "updatedAt",
    ]
    compact_rows: list[Any] = []
    for row in rows[:row_limit]:
        if not isinstance(row, dict):
            compact_rows.append(row)
            continue
        keys = [key for key in preferred_keys if key in row]
        for key in row.keys():
            if len(keys) >= field_limit:
                break
            if key not in keys:
                keys.append(key)
        compact_rows.append({key: row.get(key) for key in keys})
    return compact_rows


def _compact_error_text(value: str, limit: int = 700) -> str:
    compacted = " ".join(value.split())
    return compacted[:limit]


def _compact_log_text(value: str, limit: int = 5000) -> str:
    compacted = " ".join(value.split())
    return compacted[:limit]


async def _chat_completion(
    messages: list[dict[str, str]],
    *,
    stage: str,
    temperature: float = 0.0,
    max_tokens: int = 800,
    response_format: dict[str, str] | None = None,
) -> str:
    if not is_llm_available():
        raise LLMClientError(stage, "OPENAI_API_KEY is not configured.")

    payload: dict[str, Any] = {
        "model": settings.openai_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format:
        payload["response_format"] = response_format

    try:
        async with httpx.AsyncClient(timeout=100.0) as client:
            response = await client.post(
                f"{settings.openai_base_url.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        logger.info(
            "[main-agent] LLM raw response stage=%s status=%s body=%s",
            stage,
            response.status_code,
            _compact_log_text(response.text),
        )
        if not response.is_success:
            raise LLMClientError(
                stage,
                "LLM request returned a non-success response.",
                status_code=response.status_code,
                response_body=_compact_error_text(response.text),
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise LLMClientError(
                stage,
                "LLM response was not valid JSON.",
                status_code=response.status_code,
                response_body=_compact_error_text(response.text),
                exception_type=exc.__class__.__name__,
            ) from exc
        content = data.get("choices", [{}])[0].get("message", {}).get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
        raise LLMClientError(
            stage,
            "LLM response did not include choices[0].message.content.",
            status_code=response.status_code,
            response_body=_compact_error_text(json.dumps(data, ensure_ascii=False, default=str)),
        )
    except LLMClientError:
        raise
    except Exception as exc:
        raise LLMClientError(
            stage,
            "LLM request failed before a valid response was parsed.",
            exception_type=exc.__class__.__name__,
        ) from exc


async def check_llm_connection() -> dict[str, Any]:
    if not is_llm_available():
        return {
            "ok": False,
            "reason": "missing_api_key",
            "baseUrl": settings.openai_base_url,
            "model": settings.openai_model,
        }

    try:
        async with httpx.AsyncClient(timeout=40.0) as client:
            response = await client.post(
                f"{settings.openai_base_url.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.openai_model,
                    "messages": [
                        {"role": "system", "content": "Reply with ok."},
                        {"role": "user", "content": "health"},
                    ],
                    "temperature": 0,
                    "max_tokens": 4,
                },
            )
        logger.info(
            "[main-agent] LLM health raw response status=%s body=%s",
            response.status_code,
            _compact_log_text(response.text),
        )
        return {
            "ok": response.is_success,
            "statusCode": response.status_code,
            "responseBody": _compact_error_text(response.text) if not response.is_success else None,
            "baseUrl": settings.openai_base_url,
            "model": settings.openai_model,
        }
    except Exception as exc:
        return {
            "ok": False,
            "reason": exc.__class__.__name__,
            "baseUrl": settings.openai_base_url,
            "model": settings.openai_model,
        }


async def classify_equipment_intent_with_llm(
    message: str,
    history: list[dict[str, Any]] | None = None,
) -> EquipmentIntentClassification | None:
    content = await _chat_completion(
        [
            {
                "role": "system",
                "content": (
                    "You classify Korean equipment chat requests for an A2UI demo agent. "
                    "Return JSON only. Use equipment-catalog when the user wants a device/equipment list, catalog, "
                    "cards, images, photos, names, or descriptions. Use equipment-status when the user wants status, "
                    "online/running/alarm/inspection/reservation booleans, or operational state. "
                    "Use equipment-status-wide-columns when the user asks for a wide-column or many-column status test. "
                    "Use equipment-status-large-rows when the user asks for a large-data, many-row, or high-row-count status test. "
                    "For greetings, small talk, unclear requests, or non-equipment requests, return apiId as null."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Recent history: {_compact_json((history or [])[-6:], 2000)}\n"
                    f"User message: {message}\n"
                    'Respond as {"apiId":"equipment-catalog|equipment-status|equipment-status-wide-columns|equipment-status-large-rows|null","confidence":0.0,"reason":"short"}'
                ),
            },
        ],
        stage="intent_classification",
        response_format={"type": "json_object"},
        max_tokens=220,
    )

    try:
        parsed = json.loads(_strip_code_fence(content))
    except json.JSONDecodeError as exc:
        raise LLMClientError(
            "intent_classification",
            "LLM intent classification returned invalid JSON.",
            response_body=_compact_error_text(content),
            exception_type=exc.__class__.__name__,
        ) from exc

    api_id = parsed.get("apiId")
    confidence = parsed.get("confidence", 0)
    reason = parsed.get("reason")
    normalized_api_id = api_id if api_id in EQUIPMENT_API_IDS else None
    normalized_confidence = float(confidence) if isinstance(confidence, (int, float)) else 0.0

    if normalized_api_id and normalized_confidence >= 0.55:
        return {
            "api_id": normalized_api_id,
            "confidence": normalized_confidence,
            "reason": reason if isinstance(reason, str) else None,
        }

    return {
        "api_id": None,
        "confidence": normalized_confidence,
        "reason": reason if isinstance(reason, str) else None,
    }


async def generate_general_response_with_llm(
    *,
    message: str,
    history: list[dict[str, Any]] | None = None,
) -> str:
    return await _chat_completion(
        [
            {
                "role": "system",
                "content": (
                    "You are a Korean demo chat agent for an A2UI equipment console. "
                    "The current user message was classified as non-equipment or unclear. "
                    "Reply naturally and briefly. Do not pretend to have checked equipment data. "
                    "Invite the user to ask for equipment status or equipment list if useful."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Recent history: {_compact_json((history or [])[-6:], 2000)}\n"
                    f"User message: {message}\n"
                    "Write one short Korean response."
                ),
            },
        ],
        stage="general_response",
        temperature=0.3,
        max_tokens=220,
    )


async def generate_equipment_fallback_text(
    *,
    message: str,
    api_id: EquipmentApiId,
    data: dict[str, Any],
    profile: dict[str, Any],
    reason: str | None = None,
) -> str:
    rows = data.get("items") if isinstance(data.get("items"), list) else []
    total_rows = data.get("total") if isinstance(data.get("total"), int) else len(rows)
    compact_profile = _compact_fallback_profile(profile)
    sample_rows = _compact_fallback_rows(rows)
    content = await _chat_completion(
        [
            {
                "role": "system",
                "content": (
                    "You are a Korean A2UI fallback writer. The UI renderer may have no matching surface, so write a "
                    "very short answer from bounded metadata only. Do not list every row or field. Do not invent "
                    "counts, statuses, URLs, or fields."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"User request: {message}\n"
                    f"Selected API: {api_id}\n"
                    f"A2UI fallback reason: {reason or '(none)'}\n"
                    f"Total rows: {total_rows}\n"
                    f"Profile summary: {_compact_json(compact_profile, 1400)}\n"
                    f"Sample rows: {_compact_json(sample_rows, 1600)}\n"
                    "Write 2-4 Korean bullet points, 360 Korean characters or fewer. "
                    "Mention total rows once. If rows were sampled, say it is a sample-based summary."
                ),
            },
        ],
        stage="equipment_fallback_text",
        temperature=0.2,
        max_tokens=360,
    )
    return content

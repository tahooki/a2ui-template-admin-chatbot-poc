import json
import logging
from typing import Any

from .config import settings
from .security import is_sensitive_key


logger = logging.getLogger("uvicorn.error")

_SUMMARY_KEYS = {
    "aiConfigured",
    "apiId",
    "branch",
    "candidateCount",
    "contentType",
    "errorType",
    "event",
    "fieldCount",
    "finishReason",
    "intent",
    "mode",
    "model",
    "presentationMode",
    "recommendedTemplateId",
    "responseLength",
    "sampleSize",
    "schemaName",
    "selectedTemplateId",
    "selectionId",
    "shape",
    "shouldUseA2UI",
    "sourceMode",
    "sourceRowCount",
    "sourceToolName",
    "sourceToolResultId",
    "status",
    "statusCode",
    "templateId",
}


def redact_flow_value(
    value: Any,
    *,
    depth: int = 0,
) -> Any:
    if depth >= 16:
        return "[max-depth]"
    if isinstance(value, dict):
        return {
            str(key): (
                "[masked]"
                if is_sensitive_key(key)
                else redact_flow_value(
                    child,
                    depth=depth + 1,
                )
            )
            for key, child in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [
            redact_flow_value(
                child,
                depth=depth + 1,
            )
            for child in value
        ]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return repr(value)


def summarize_flow_value(value: Any) -> Any:
    if isinstance(value, dict):
        summary = {
            str(key): (
                "[masked]"
                if is_sensitive_key(key)
                else child[:200]
                if isinstance(child, str)
                else child
            )
            for key, child in value.items()
            if str(key) in _SUMMARY_KEYS
            and (
                is_sensitive_key(key)
                or isinstance(child, (str, int, float, bool))
                or child is None
            )
        }
        if summary:
            return summary
        return {
            "type": "object",
            "keyCount": len(value),
        }
    if isinstance(value, (list, tuple)):
        return {
            "type": "array",
            "itemCount": len(value),
        }
    if value is None:
        return None
    return {
        "type": type(value).__name__,
    }


def flow_json(
    value: Any,
    *,
    max_chars: int | None = None,
) -> str:
    limit = (
        settings.flow_log_max_chars
        if max_chars is None
        else max_chars
    )
    serialized = json.dumps(
        redact_flow_value(value),
        ensure_ascii=False,
        default=str,
        separators=(",", ":"),
    )
    if limit <= 0 or len(serialized) <= limit:
        return serialized
    omitted = len(serialized) - limit
    return (
        f"{serialized[:limit]}"
        f"...<truncated {omitted} chars>"
    )


def log_flow(
    step: str,
    *,
    turn_id: str | None = None,
    selection_id: str | None = None,
    previous_result: Any = None,
    result: Any = None,
    details: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {"step": step}
    if turn_id:
        payload["turnId"] = turn_id
    if selection_id:
        payload["selectionId"] = selection_id
    if details:
        payload["details"] = details
    if previous_result is not None:
        payload["previousResult"] = (
            previous_result
            if settings.flow_log_include_payloads
            else summarize_flow_value(previous_result)
        )
    if result is not None:
        payload["result"] = (
            result
            if settings.flow_log_include_payloads
            else summarize_flow_value(result)
        )
    logger.info(
        "[a2ui-proxy-agent][flow] %s",
        flow_json(payload),
    )

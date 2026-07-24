import json
import logging
import re
from typing import Any

from .config import settings


logger = logging.getLogger("uvicorn.error")

_SENSITIVE_KEY_RE = re.compile(
    r"(secret|token|password|authorization|cookie|phone|email|api[_-]?key)",
    re.IGNORECASE,
)


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
                if _SENSITIVE_KEY_RE.search(str(key))
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
        payload["previousResult"] = previous_result
    if result is not None:
        payload["result"] = result
    logger.info(
        "[a2ui-proxy-agent][flow] %s",
        flow_json(payload),
    )

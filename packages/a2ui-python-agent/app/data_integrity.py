import hashlib
import json
from typing import Any


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def data_row_count(data: Any) -> int:
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        items = data.get("items")
        if isinstance(items, list):
            total = data.get("total")
            return total if isinstance(total, int) else len(items)
        return 1
    return 0


def data_shape(data: Any) -> str:
    if isinstance(data, list):
        return "array<object>" if all(isinstance(item, dict) for item in data) else "array"
    if isinstance(data, dict):
        items = data.get("items")
        if isinstance(items, list):
            return "object{items:array<object>}" if all(isinstance(item, dict) for item in items) else "object{items:array}"
        return "object"
    return type(data).__name__


def build_data_integrity_snapshot(data: Any) -> dict[str, Any]:
    canonical = _canonical_json(data)
    return {
        "dataHash": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "byteLength": len(canonical.encode("utf-8")),
        "rowCount": data_row_count(data),
        "shape": data_shape(data),
        "topLevelKeys": sorted(data.keys()) if isinstance(data, dict) else None,
    }

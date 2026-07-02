import hashlib
import json
from typing import Any


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def _nested_dict(data: dict[str, Any], key: str) -> dict[str, Any] | None:
    value = data.get(key)
    return value if isinstance(value, dict) else None


def _nested_list(data: dict[str, Any], *path: str) -> list[Any] | None:
    current: Any = data
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current if isinstance(current, list) else None


def _nested_total(data: dict[str, Any], container_key: str | None = None) -> int | None:
    container = _nested_dict(data, container_key) if container_key else data
    if not container:
        return None
    for key in ("total", "totalCount", "count", "rowCount"):
        value = container.get(key)
        if isinstance(value, int):
            return value
    return None


def _array_candidates(data: Any) -> list[tuple[tuple[str, ...], list[Any], dict[str, Any] | None]]:
    if isinstance(data, list):
        return [((), data, None)]

    candidates: list[tuple[tuple[str, ...], list[Any], dict[str, Any] | None]] = []

    def visit(value: Any, path: tuple[str, ...], parent: dict[str, Any] | None) -> None:
        if isinstance(value, list):
            candidates.append((path, value, parent))
            return
        if not isinstance(value, dict):
            return
        path_text = ".".join(path)
        if path and any(token in path_text.lower() for token in ("metadata", "debug", "error", "warning", "log")):
            return
        for key, child in value.items():
            visit(child, (*path, key), value)

    if isinstance(data, dict):
        visit(data, (), None)
    return candidates


def _candidate_score(path: tuple[str, ...], rows: list[Any]) -> float:
    object_count = sum(1 for row in rows if isinstance(row, dict))
    object_ratio = object_count / len(rows) if rows else 0
    path_hint = 0.12 if path and path[-1].lower() in ("items", "rows", "list", "data", "result", "payload") else 0
    return max(0, min(1, min(0.22, len(rows) / 50) + object_ratio * 0.5 + path_hint - min(0.08, len(path) * 0.01)))


def _selected_array_candidate(data: Any) -> tuple[tuple[str, ...], list[Any], dict[str, Any] | None] | None:
    candidates = _array_candidates(data)
    if not candidates:
        return None
    return sorted(candidates, key=lambda candidate: _candidate_score(candidate[0], candidate[1]), reverse=True)[0]


def data_row_count(data: Any) -> int:
    candidate = _selected_array_candidate(data)
    if candidate:
        _, rows, parent = candidate
        total = _nested_total(parent or {})
        return total if isinstance(total, int) else len(rows)
    if isinstance(data, dict):
        return 1
    return 0


def data_shape(data: Any) -> str:
    candidate = _selected_array_candidate(data)
    if candidate:
        path, rows, _ = candidate
        item_shape = "array<object>" if all(isinstance(item, dict) for item in rows) else "array"
        if not path:
            return item_shape
        return f"object{{{'.'.join(path)}:{item_shape}}}"
    if isinstance(data, dict):
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


def compare_data_integrity(source_snapshot: dict[str, Any], received_data: Any) -> dict[str, Any]:
    received = build_data_integrity_snapshot(received_data)
    hash_matched = source_snapshot.get("dataHash") == received["dataHash"]
    row_count_matched = source_snapshot.get("rowCount") == received["rowCount"]
    byte_length_matched = source_snapshot.get("byteLength") == received["byteLength"]
    return {
        "expectedHash": source_snapshot.get("dataHash"),
        "receivedHash": received["dataHash"],
        "hashMatched": hash_matched,
        "expectedRowCount": source_snapshot.get("rowCount"),
        "receivedRowCount": received["rowCount"],
        "rowCountMatched": row_count_matched,
        "expectedByteLength": source_snapshot.get("byteLength"),
        "receivedByteLength": received["byteLength"],
        "byteLengthMatched": byte_length_matched,
        "receivedShape": received["shape"],
        "receivedTopLevelKeys": received["topLevelKeys"],
        "matched": hash_matched and row_count_matched and byte_length_matched,
    }

import json
import re
from typing import Any

SENSITIVE_KEY_RE = re.compile(r"(secret|token|password|authorization|cookie|phone|email)", re.IGNORECASE)


def _rows_from_data(data: Any) -> tuple[list[Any], str, str | None, int]:
    if isinstance(data, list):
        object_rows = [item for item in data if isinstance(item, dict)]
        shape = "array<object>" if len(object_rows) == len(data) else "array<primitive>"
        return data, shape, None, len(data)

    if isinstance(data, dict):
        items = data.get("items")
        if isinstance(items, list):
            row_count = data.get("total") if isinstance(data.get("total"), int) else len(items)
            return items, "array<object>", "items", row_count
        return [data], "object", None, 1

    return [], "unknown", None, 0


def _mask(value: Any, path: str, masked_fields: set[str]) -> Any:
    key = path.split(".")[-1] if path else ""
    if key and SENSITIVE_KEY_RE.search(key):
        masked_fields.add(path)
        return "[masked]"

    if isinstance(value, list):
        return [_mask(item, f"{path}.{index}" if path else str(index), masked_fields) for index, item in enumerate(value)]

    if isinstance(value, dict):
        return {key: _mask(child, f"{path}.{key}" if path else key, masked_fields) for key, child in value.items()}

    return value


def _with_rows(data: Any, rows: list[Any], primary_array_path: str | None) -> Any:
    if primary_array_path and isinstance(data, dict):
        return {**data, primary_array_path: rows}
    if isinstance(data, list):
        return rows
    return rows[0] if rows else None


def _byte_length(value: Any) -> int:
    return len(json.dumps(value, ensure_ascii=False).encode("utf-8"))


def build_sample_data_preview(
    data: Any,
    source_id: str = "unknown",
    source_kind: str = "api_response",
    row_limit: int = 10,
    byte_limit: int = 20_000,
) -> dict[str, Any]:
    rows, shape, primary_array_path, row_count = _rows_from_data(data)
    masked_fields: set[str] = set()
    masked_data = _mask(data, "", masked_fields)
    sample_rows = [
        _mask(row, f"{primary_array_path}.{index}" if primary_array_path else str(index), masked_fields)
        for index, row in enumerate(rows[:row_limit])
    ]
    preview_data = _with_rows(masked_data, sample_rows, primary_array_path)

    while len(sample_rows) > 1 and _byte_length(preview_data) > byte_limit:
        sample_rows = sample_rows[:-1]
        preview_data = _with_rows(masked_data, sample_rows, primary_array_path)

    byte_length = _byte_length(preview_data)
    return {
        "sourceId": source_id,
        "sourceKind": source_kind,
        "shape": shape,
        "primaryArrayPath": primary_array_path,
        "rowCount": row_count,
        "sampleSize": len(sample_rows),
        "truncated": len(rows) > len(sample_rows) or byte_length > byte_limit,
        "byteLength": byte_length,
        "maskedFields": sorted(masked_fields),
        "data": preview_data,
    }


def _field_type(key: str, examples: list[Any]) -> str:
    first = next((value for value in examples if value is not None), None)
    if isinstance(first, bool):
        return "boolean"
    if isinstance(first, (int, float)):
        return "number"
    if isinstance(first, list):
        return "array"
    if isinstance(first, dict):
        return "object"
    if isinstance(first, str):
        if re.match(r"\d{4}-\d{2}-\d{2}T", first):
            return "datetime"
        if re.match(r"\d{4}-\d{2}-\d{2}", first):
            return "date"
        return "string"
    return "unknown"


def _field_format(key: str, examples: list[Any]) -> str | None:
    first = next((value for value in examples if isinstance(value, str)), None)
    if not first:
        return None
    if re.search(r"image|photo|thumbnail", key, re.IGNORECASE) or re.search(r"\.(png|jpe?g|webp|gif|svg)$", first) or first.startswith("/images/"):
        return "image-url"
    if re.search(r"url|uri", key, re.IGNORECASE) or re.match(r"https?://", first) or first.startswith("/"):
        return "uri"
    if re.match(r"\d{4}-\d{2}-\d{2}T", first):
        return "datetime"
    if re.match(r"\d{4}-\d{2}-\d{2}", first):
        return "date"
    return None


def _roles(key: str, field_type: str, field_format: str | None) -> list[str]:
    roles: list[str] = []
    if key == "id" or key.endswith("Id"):
        roles.append("id")
    if re.search(r"name|title|equipmentName", key, re.IGNORECASE):
        roles.extend(["title", "label"])
    if re.search(r"description|content|summary", key, re.IGNORECASE):
        roles.extend(["content", "description"])
    if field_format == "image-url" or re.search(r"image|photo|thumbnail", key, re.IGNORECASE):
        roles.extend(["image", "uri"])
    elif field_format == "uri" or re.search(r"url|uri", key, re.IGNORECASE):
        roles.append("uri")
    if field_type == "boolean":
        roles.extend(["booleanFlag", "status"])
    if re.search(r"status|state|phase", key, re.IGNORECASE):
        roles.append("status")
    if re.search(r"category|type", key, re.IGNORECASE):
        roles.append("category")
    if re.search(r"location|zone|site", key, re.IGNORECASE):
        roles.append("location")
    if re.search(r"updatedAt|date|time", key, re.IGNORECASE) or field_type in ["date", "datetime"]:
        roles.extend(["updatedAt", "time"])
    if field_type == "number" and re.search(r"count|total|rate|score|metric|amount|size", key, re.IGNORECASE):
        roles.append("metric")
    if re.search(r"version", key, re.IGNORECASE):
        roles.append("version")
    if re.search(r"environment|env", key, re.IGNORECASE):
        roles.append("environment")
    if re.search(r"artifact|build|release", key, re.IGNORECASE):
        roles.append("artifact")
    if re.search(r"action|href|link", key, re.IGNORECASE):
        roles.append("action")
    return list(dict.fromkeys(roles))


def _capabilities(fields: list[dict[str, Any]]) -> dict[str, bool]:
    return {
        "hasImages": any("image" in field["roles"] for field in fields),
        "hasBooleans": any(field["type"] == "boolean" or "booleanFlag" in field["roles"] for field in fields),
        "hasStatus": any("status" in field["roles"] for field in fields),
        "hasTimeField": any("time" in field["roles"] or field["type"] in ["date", "datetime"] for field in fields),
        "hasNumericMetrics": any("metric" in field["roles"] or field["type"] == "number" for field in fields),
        "hasCategories": any("category" in field["roles"] for field in fields),
        "hasNestedObjects": any(field["type"] in ["object", "array"] for field in fields),
        "hasActions": any("action" in field["roles"] for field in fields),
    }


def build_derived_schema(data: Any, source_id: str = "unknown", sample_data_preview: dict[str, Any] | None = None) -> dict[str, Any]:
    preview = sample_data_preview or build_sample_data_preview(data, source_id=source_id)
    rows, _, primary_array_path, _ = _rows_from_data(preview.get("data"))
    object_rows = [row for row in rows if isinstance(row, dict)]
    keys = sorted({key for row in object_rows for key in row.keys()})
    fields: list[dict[str, Any]] = []

    for key in keys:
        examples = [row.get(key) for row in object_rows[:5] if key in row]
        field_type = _field_type(key, examples)
        field_format = _field_format(key, examples)
        roles = _roles(key, field_type, field_format)
        path = f"{primary_array_path}.{key}" if primary_array_path else key
        fields.append(
            {
                "path": path,
                "key": key,
                "type": field_type,
                "role": roles[0] if roles else None,
                "roles": roles,
                "format": field_format,
                "examples": examples,
            }
        )

    return {
        "sourceId": source_id,
        "sourceKind": "api_response",
        "shape": preview["shape"],
        "primaryArrayPath": preview.get("primaryArrayPath"),
        "rowCount": preview["rowCount"],
        "sampleSize": preview["sampleSize"],
        "fields": fields,
        "capabilities": _capabilities(fields),
    }

import re
from typing import Any, Literal

EquipmentApiId = Literal[
    "equipment-catalog",
    "equipment-status",
    "equipment-status-wide-columns",
    "equipment-status-large-rows",
    "work-items",
    "resources",
    "status-checks",
    "summary",
    "hierarchy",
]

def equipment_api_title(api_id: EquipmentApiId) -> str:
    titles: dict[EquipmentApiId, str] = {
        "equipment-catalog": "장비 카탈로그 API",
        "equipment-status": "장비 상태 API",
        "equipment-status-wide-columns": "컬럼 많은 장비 상태 API",
        "equipment-status-large-rows": "데이터 많은 장비 상태 API",
        "work-items": "작업 항목 Fixture API",
        "resources": "리소스 Fixture API",
        "status-checks": "상태 체크 Fixture API",
        "summary": "요약 지표 Fixture API",
        "hierarchy": "계층 구조 Fixture API",
    }
    return titles[api_id]
def _field_type(key: str, examples: list[Any]) -> str:
    first = next((value for value in examples if value is not None), None)
    if isinstance(first, bool):
        return "boolean"
    if isinstance(first, (int, float)):
        return "number"
    if isinstance(first, str):
        if re.search(r"image|photo|thumbnail", key, re.IGNORECASE) or re.search(r"\.(png|jpe?g|webp|gif|svg)$", first):
            return "image-url"
        if re.match(r"\d{4}-\d{2}-\d{2}", first):
            return "date"
        return "string"
    return "unknown"


def _role_candidates(key: str, field_type: str) -> list[str]:
    roles: list[str] = []
    if key == "id" or key.endswith("Id"):
        roles.append("id")
    if re.search(r"name|title|equipmentName", key, re.IGNORECASE):
        roles.append("title")
    if re.search(r"description|content|summary", key, re.IGNORECASE):
        roles.extend(["content", "description"])
    if field_type == "image-url" or re.search(r"image|photo|thumbnail", key, re.IGNORECASE):
        roles.append("image")
    if field_type == "boolean":
        roles.extend(["booleanFlag", "status"])
    if re.search(r"status|state|phase", key, re.IGNORECASE):
        roles.append("status")
    if re.search(r"category|type", key, re.IGNORECASE):
        roles.append("category")
    if re.search(r"location|zone|site", key, re.IGNORECASE):
        roles.append("location")
    if re.search(r"updatedAt|date|checkedAt", key, re.IGNORECASE):
        roles.extend(["updatedAt", "time"])
    if re.search(r"progress|percent|ratio", key, re.IGNORECASE):
        roles.extend(["progress", "metric"])
    if re.search(r"priority|severity|urgency", key, re.IGNORECASE):
        roles.append("priority")
    if re.search(r"assignee|owner|manager|operator", key, re.IGNORECASE):
        roles.extend(["assignee", "actor"])
    if re.search(r"dueAt|deadline|targetDate", key, re.IGNORECASE):
        roles.extend(["dueAt", "time"])
    if re.search(r"children|nodes", key, re.IGNORECASE):
        roles.append("children")
    if re.search(r"parentId|parent_id|parent", key, re.IGNORECASE):
        roles.append("parentId")
    if re.search(r"delta|change|diff|growth", key, re.IGNORECASE):
        roles.append("delta")
    if re.search(r"unit|uom", key, re.IGNORECASE):
        roles.append("unit")
    if field_type == "number":
        roles.append("metric")
    return list(dict.fromkeys(roles))


def _rows_from_data(data: dict[str, Any]) -> tuple[list[dict[str, Any]], str, str | None, int]:
    items = data.get("items")
    if isinstance(items, list):
        rows = [item for item in items if isinstance(item, dict)]
        total = data.get("total")
        return rows, "array<object>", "items", total if isinstance(total, int) else len(rows)

    rows_value = data.get("rows")
    if isinstance(rows_value, list):
        rows = [item for item in rows_value if isinstance(item, dict)]
        total = data.get("total") if isinstance(data.get("total"), int) else data.get("totalCount")
        return rows, "array<object>", "rows", total if isinstance(total, int) else len(rows)

    result = data.get("result")
    if isinstance(result, dict):
        result_rows = result.get("rows")
        if isinstance(result_rows, list):
            rows = [item for item in result_rows if isinstance(item, dict)]
            total = result.get("totalCount") if isinstance(result.get("totalCount"), int) else result.get("total")
            return rows, "array<object>", "result.rows", total if isinstance(total, int) else len(rows)

    return [], "unknown", None, 0


def build_data_profile(data: dict[str, Any]) -> dict[str, Any]:
    rows, shape, list_path, row_count = _rows_from_data(data)
    keys = sorted({key for row in rows for key in row.keys()})
    fields: list[dict[str, Any]] = []

    for key in keys:
        examples = [row.get(key) for row in rows[:5] if key in row]
        field_type = _field_type(key, examples)
        fields.append(
            {
                "path": f"{list_path}[].{key}" if list_path else key,
                "key": key,
                "type": field_type,
                "roleCandidates": _role_candidates(key, field_type),
                "examples": examples,
            }
        )

    return {
        "shape": shape,
        "rowCount": row_count,
        "listPath": list_path,
        "fields": fields,
        "booleanFieldCount": len([field for field in fields if field["type"] == "boolean"]),
        "hasImageField": any("image" in field["roleCandidates"] for field in fields),
        "hasContentField": any("content" in field["roleCandidates"] for field in fields),
        "hasDescriptionField": any("description" in field["roleCandidates"] for field in fields),
    }

import re
from typing import Any, Literal

import httpx

from .config import settings

EquipmentApiId = Literal[
    "equipment-catalog",
    "equipment-status",
    "equipment-status-wide-columns",
    "equipment-status-large-rows",
]


def equipment_api_title(api_id: EquipmentApiId) -> str:
    if api_id == "equipment-catalog":
        return "장비 카탈로그 API"
    if api_id == "equipment-status-wide-columns":
        return "컬럼 많은 장비 상태 API"
    if api_id == "equipment-status-large-rows":
        return "데이터 많은 장비 상태 API"
    return "장비 상태 API"


async def fetch_equipment_data(api_id: EquipmentApiId) -> dict[str, Any]:
    url = f"{settings.next_api_base_url.rstrip('/')}/api/{api_id}"
    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        response = await client.get(url, params={"pageSize": "44"})
        response.raise_for_status()
        return response.json()


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
    if re.search(r"category|type", key, re.IGNORECASE):
        roles.append("category")
    if re.search(r"location|zone|site", key, re.IGNORECASE):
        roles.append("location")
    if re.search(r"updatedAt|date", key, re.IGNORECASE):
        roles.append("updatedAt")
    return roles


def build_data_profile(data: dict[str, Any]) -> dict[str, Any]:
    items = data.get("items")
    rows = [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []
    keys = sorted({key for row in rows for key in row.keys()})
    fields: list[dict[str, Any]] = []

    for key in keys:
        examples = [row.get(key) for row in rows[:5] if key in row]
        field_type = _field_type(key, examples)
        fields.append(
            {
                "path": f"items[].{key}",
                "key": key,
                "type": field_type,
                "roleCandidates": _role_candidates(key, field_type),
                "examples": examples,
            }
        )

    return {
        "shape": "array<object>" if rows else "unknown",
        "rowCount": len(rows),
        "listPath": "items" if isinstance(items, list) else None,
        "fields": fields,
        "booleanFieldCount": len([field for field in fields if field["type"] == "boolean"]),
        "hasImageField": any("image" in field["roleCandidates"] for field in fields),
        "hasContentField": any("content" in field["roleCandidates"] for field in fields),
        "hasDescriptionField": any("description" in field["roleCandidates"] for field in fields),
    }

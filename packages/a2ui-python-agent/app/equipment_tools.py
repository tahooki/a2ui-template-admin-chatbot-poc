import re
from typing import Any, Literal

import httpx

from .config import settings

EquipmentApiId = Literal["equipment-catalog", "equipment-status"]


def _normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9가-힣]+", "", value.lower())


def choose_equipment_api(message: str) -> EquipmentApiId:
    normalized = _normalize(message)
    if any(
        token in normalized
        for token in ["장비목록", "장비리스트", "장비보여", "설비", "카탈로그", "이미지", "사진"]
    ):
        return "equipment-catalog"
    return "equipment-status"


def equipment_api_title(api_id: EquipmentApiId) -> str:
    return "장비 카탈로그 API" if api_id == "equipment-catalog" else "장비 상태 API"


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


def _equipment_role(category: str, location: str) -> str:
    if category == "가공":
        if "실험실" in location:
            return "실험실 또는 테스트 공정에서 사용하는 가공 장비로 보입니다."
        return "생산 공정의 핵심 가공 작업을 담당하는 장비로 보입니다."
    if category == "이송":
        if location == "A동 1층":
            return "A동 1층 공정 안에서 장비 간 이동 작업을 보조하는 장비로 보입니다."
        return "공정 사이에서 자재나 부품을 옮기는 역할에 가까운 장비입니다."
    if category == "유틸리티":
        return "설비 운전에 필요한 순환 계통을 담당하는 장비로 분류되어 있습니다."
    if category == "검사":
        return "생산 결과물의 품질 확인이나 이상 감지에 쓰이는 장비로 볼 수 있습니다."
    return "카탈로그에서 기본 정보와 배치 위치를 확인할 수 있는 장비입니다."


def build_catalog_fallback(data: dict[str, Any], max_items: int = 6) -> str:
    items = [item for item in data.get("items", []) if isinstance(item, dict)]
    total = data.get("total", len(items))
    lines: list[str] = []

    for item in items[:max_items]:
        name = str(item.get("name") or item.get("title") or item.get("id") or "장비")
        category = str(item.get("category") or "")
        location = str(item.get("location") or "")
        description = str(item.get("description") or "")
        if category and location:
            first_line = f"{location}에 있는 {category} 라인 장비입니다."
        else:
            first_line = description or "카탈로그에 등록된 장비입니다."
        lines.append(f"- {name}\n  {first_line} {_equipment_role(category, location)}")

    return f"장비 카탈로그를 확인했어요. 현재 등록된 장비는 총 {total}대입니다.\n\n" + "\n\n".join(lines)


def build_status_fallback(data: dict[str, Any], max_items: int = 6) -> str:
    items = [item for item in data.get("items", []) if isinstance(item, dict)]
    total = data.get("total", len(items))
    lines: list[str] = []

    for item in items[:max_items]:
        name = str(item.get("name") or item.get("id") or "장비")
        states = [
            f"온라인 {'정상' if item.get('isOnline') else '오프라인'}",
            f"가동 {'중' if item.get('isRunning') else '정지'}",
            f"알람 {'있음' if item.get('hasAlarm') else '없음'}",
            f"점검 {'필요' if item.get('needsInspection') else '불필요'}",
            f"예약 {'있음' if item.get('isReserved') else '없음'}",
        ]
        lines.append(f"- {name}\n  " + ", ".join(states))

    return f"장비 상태 데이터를 확인했어요. 현재 상태 row는 총 {total}개입니다.\n\n" + "\n\n".join(lines)

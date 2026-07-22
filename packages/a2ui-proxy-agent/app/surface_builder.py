from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .static_templates import (
    STATIC_TEMPLATE_BY_ID,
    STATIC_TEMPLATE_IDS,
    STATIC_TEMPLATE_VERSION,
)


DataRow = dict[str, Any]

_ROW_KEYS = ("items", "rows", "list")
_PARENT_KEYS = ("result", "data", "payload")
_TITLE_ALIASES = (
    "title",
    "name",
    "label",
    "displayName",
    "equipmentName",
    "eqp_nm",
    "id",
)
_CONTENT_ALIASES = ("description", "content", "summary", "message", "detail")
_IMAGE_ALIASES = ("imageUrl", "thumbnailUrl", "photoUrl", "image", "thumbnail")
_CATEGORY_ALIASES = ("category", "type", "group", "kind")
_STATUS_ALIASES = ("status", "state", "phase", "operation_yn")

_EXPLICIT_TEMPLATE_KEYWORDS = {
    "collection.cardGrid": ("카드", "그리드", "이미지", "gallery", "card"),
    "collection.list": ("목록", "리스트", "간단히", "list"),
    "matrix.table": ("테이블", "컬럼", "비교", "table", "표"),
}


class SurfaceBuildError(ValueError):
    pass


@dataclass(frozen=True)
class NormalizedData:
    rows: list[DataRow]
    row_count: int
    source_array_path: str
    canonical_data: dict[str, Any]


@dataclass(frozen=True)
class DataProfile:
    normalized: NormalizedData
    title_key: str
    content_key: str | None
    image_key: str | None
    category_key: str | None
    status_key: str | None
    scalar_keys: tuple[str, ...]


def _object_rows(value: Any) -> list[DataRow] | None:
    if not isinstance(value, list):
        return None
    if not value:
        return []
    rows = [item for item in value if isinstance(item, dict)]
    return rows if len(rows) == len(value) else None


def _find_rows(value: Any, path: str = "") -> tuple[list[DataRow], str] | None:
    direct_rows = _object_rows(value)
    if direct_rows is not None:
        return direct_rows, path or "$"
    if not isinstance(value, dict):
        return None

    for key in _ROW_KEYS:
        rows = _object_rows(value.get(key))
        if rows is not None:
            return rows, f"{path}.{key}".strip(".")

    for key in _PARENT_KEYS:
        child = value.get(key)
        if not isinstance(child, dict):
            continue
        found = _find_rows(child, f"{path}.{key}".strip("."))
        if found is not None:
            return found
    return None


def normalize_data(data: Any) -> NormalizedData:
    found = _find_rows(data)
    if found is not None:
        rows, source_array_path = found
    elif isinstance(data, dict):
        rows = [data]
        source_array_path = "$"
    else:
        raise SurfaceBuildError("A2UI 화면으로 표시할 object 데이터가 없습니다.")

    if not rows:
        raise SurfaceBuildError("A2UI 화면으로 표시할 row가 없습니다.")

    return NormalizedData(
        rows=rows,
        row_count=len(rows),
        source_array_path=source_array_path,
        canonical_data={"items": rows, "total": len(rows)},
    )


def _normalized_key(value: str) -> str:
    return "".join(character.lower() for character in value if character.isalnum())


def _is_scalar(value: Any) -> bool:
    return value is None or isinstance(value, (str, int, float, bool))


def _has_display_value(values: list[Any]) -> bool:
    return any(value is not None and value != "" for value in values)


def _ordered_keys(rows: list[DataRow]) -> list[str]:
    keys: list[str] = []
    seen: set[str] = set()
    for row in rows[:20]:
        for key in row:
            if key in seen:
                continue
            seen.add(key)
            keys.append(key)
    return keys


def _values_for_key(rows: list[DataRow], key: str) -> list[Any]:
    return [row.get(key) for row in rows[:20]]


def _field_for_aliases(keys: list[str], aliases: tuple[str, ...]) -> str | None:
    by_normalized_key = {_normalized_key(key): key for key in keys}
    for alias in aliases:
        matched = by_normalized_key.get(_normalized_key(alias))
        if matched:
            return matched
    return None


def profile_data(data: Any) -> DataProfile:
    normalized = normalize_data(data)
    keys = _ordered_keys(normalized.rows)
    scalar_keys = [
        key
        for key in keys
        if all(_is_scalar(value) for value in _values_for_key(normalized.rows, key))
        and _has_display_value(_values_for_key(normalized.rows, key))
    ]
    if not scalar_keys:
        raise SurfaceBuildError("A2UI 화면에 매핑할 scalar field가 없습니다.")

    title_key = _field_for_aliases(scalar_keys, _TITLE_ALIASES)
    if not title_key:
        title_key = next(
            (
                key
                for key in scalar_keys
                if any(isinstance(value, str) and value.strip() for value in _values_for_key(normalized.rows, key))
            ),
            scalar_keys[0],
        )

    return DataProfile(
        normalized=normalized,
        title_key=title_key,
        content_key=_field_for_aliases(scalar_keys, _CONTENT_ALIASES),
        image_key=_field_for_aliases(scalar_keys, _IMAGE_ALIASES),
        category_key=_field_for_aliases(scalar_keys, _CATEGORY_ALIASES),
        status_key=_field_for_aliases(scalar_keys, _STATUS_ALIASES),
        scalar_keys=tuple(scalar_keys),
    )


def _path(key: str | None) -> str | None:
    return f"items[].{key}" if key else None


def _explicit_template(query: str) -> str | None:
    lowered = query.lower()
    matches: list[tuple[int, str]] = []
    for template_id, keywords in _EXPLICIT_TEMPLATE_KEYWORDS.items():
        for keyword in keywords:
            position = lowered.rfind(keyword.lower())
            if position >= 0:
                matches.append((position, template_id))
    if not matches:
        return None
    return max(matches, key=lambda match: match[0])[1]


def recommended_template_id(query: str, profile: DataProfile) -> str:
    explicit = _explicit_template(query)
    if explicit:
        return explicit
    if profile.image_key:
        return "collection.cardGrid"
    if len(profile.scalar_keys) <= 3:
        return "collection.list"
    return "matrix.table"


def display_options(query: str, data: Any) -> list[dict[str, Any]]:
    profile = profile_data(data)
    recommended = recommended_template_id(query, profile)
    ordered_ids = [recommended, *[template_id for template_id in STATIC_TEMPLATE_IDS if template_id != recommended]]
    return [
        {
            "templateId": template_id,
            "label": STATIC_TEMPLATE_BY_ID[template_id].label,
            "recommended": template_id == recommended,
        }
        for template_id in ordered_ids
    ]


def _field_mapping(template_id: str, profile: DataProfile) -> dict[str, Any]:
    title_path = _path(profile.title_key)
    content_path = _path(profile.content_key)
    category_path = _path(profile.category_key or profile.status_key)
    status_path = _path(profile.status_key)

    if template_id == "collection.list":
        return {
            key: value
            for key, value in {
                "title": title_path,
                "content": content_path,
                "category": category_path,
                "status": status_path,
            }.items()
            if value
        }
    if template_id == "collection.cardGrid":
        return {
            key: value
            for key, value in {
                "title": title_path,
                "content": content_path,
                "image": _path(profile.image_key),
                "category": category_path,
                "status": status_path,
            }.items()
            if value
        }
    if template_id == "matrix.table":
        fields = [_path(key) for key in profile.scalar_keys if key != profile.title_key][:6]
        return {"title": title_path, "fields": [field for field in fields if field]}
    raise SurfaceBuildError(f"지원하지 않는 템플릿입니다: {template_id}")


def build_surface(
    *,
    template_id: str,
    query: str,
    api_id: str,
    data: Any,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    template = STATIC_TEMPLATE_BY_ID.get(template_id)
    if not template:
        raise SurfaceBuildError(f"지원하지 않는 템플릿입니다: {template_id}")

    profile = profile_data(data)
    field_mapping = _field_mapping(template_id, profile)
    source_metadata = metadata or {}
    reason = f"사용자가 {template.label} 고정 템플릿을 선택했습니다."

    return {
        "templateId": template_id,
        "version": "1.0.0",
        "payload": {
            "apiTitle": api_id,
            "apiId": api_id,
            "data": profile.normalized.canonical_data,
            "profile": {"rowCount": profile.normalized.row_count},
            "renderPlan": {
                "selectedComponentId": template_id,
                "viewType": template.view_type,
                "fieldMapping": field_mapping,
                "maxItems": template.max_items,
                "score": 1,
                "reason": reason,
                "isFallback": False,
                "strategy": "proxy_static_templates",
            },
        },
        "surfaceConfig": {
            "viewType": template.view_type,
            "titleBinding": field_mapping["title"],
            "maxItems": template.max_items,
        },
        "sourceIntent": api_id,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "meta": {
            "templateVersion": STATIC_TEMPLATE_VERSION,
            "decisionReason": reason,
            "strategy": "proxy_static_templates",
            "sourceArrayPath": profile.normalized.source_array_path,
            "sourceRowCount": profile.normalized.row_count,
            "sourceDataHash": source_metadata.get("sourceDataHash"),
            "trace": [
                "source:main-agent-data-result",
                f"normalizer:{profile.normalized.source_array_path}",
                f"template:{template_id}",
                "binding:proxy-static-surface",
            ],
        },
    }

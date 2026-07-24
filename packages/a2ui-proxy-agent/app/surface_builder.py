import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .static_templates import (
    STATIC_TEMPLATE_BY_ID,
    STATIC_TEMPLATE_VERSION,
)


DataRow = dict[str, Any]

_ROW_KEYS = ("items", "rows", "list")
_PARENT_KEYS = ("result", "data", "payload")


class SurfaceBuildError(ValueError):
    pass


@dataclass(frozen=True)
class NormalizedData:
    rows: list[DataRow]
    row_count: int
    source_array_path: str
    canonical_data: dict[str, Any]


def _object_rows(value: Any) -> list[DataRow] | None:
    if not isinstance(value, list):
        return None
    if not value:
        return []
    rows = [
        item for item in value if isinstance(item, dict)
    ]
    return rows if len(rows) == len(value) else None


def _find_rows(
    value: Any,
    path: str = "",
) -> tuple[list[DataRow], str] | None:
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
        found = _find_rows(
            child,
            f"{path}.{key}".strip("."),
        )
        if found is not None:
            return found
    return None


def _data_at_path(
    data: Any,
    path: str,
) -> Any:
    current = data
    for key in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def normalize_data(
    data: Any,
    *,
    primary_array_path: str | None = None,
) -> NormalizedData:
    found: tuple[list[DataRow], str] | None = None
    if primary_array_path:
        primary_rows = _object_rows(
            _data_at_path(data, primary_array_path)
        )
        if primary_rows is not None:
            found = (primary_rows, primary_array_path)
    if found is None:
        found = _find_rows(data)

    if found is not None:
        rows, source_array_path = found
    elif isinstance(data, dict):
        rows = [data]
        source_array_path = "$"
    else:
        raise SurfaceBuildError(
            "A2UI 화면으로 표시할 object 데이터가 없습니다."
        )

    if not rows:
        raise SurfaceBuildError(
            "A2UI 화면으로 표시할 row가 없습니다."
        )

    return NormalizedData(
        rows=rows,
        row_count=len(rows),
        source_array_path=source_array_path,
        canonical_data={"items": rows, "total": len(rows)},
    )


def _relative_source_parts(
    source_path: str,
    primary_array_path: str | None,
) -> list[str]:
    relative_path = source_path
    if primary_array_path:
        prefix = f"{primary_array_path}."
        if source_path.startswith(prefix):
            relative_path = source_path[len(prefix) :]
        elif source_path == primary_array_path:
            relative_path = ""
        else:
            raise SurfaceBuildError(
                f"AI source path가 primary array 밖을 가리킵니다: {source_path}"
            )
    parts = [
        part for part in relative_path.split(".") if part
    ]
    if not parts:
        raise SurfaceBuildError(
            f"AI source path가 row field를 가리키지 않습니다: {source_path}"
        )
    return parts


def _row_value(
    row: DataRow,
    source_path: str,
    primary_array_path: str | None,
) -> Any:
    current: Any = row
    for part in _relative_source_parts(
        source_path,
        primary_array_path,
    ):
        if isinstance(current, list):
            if part == "length":
                current = len(current)
                continue
            if part == "first":
                current = current[0] if current else None
                continue
            return None
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _target_field_name(
    source_path: str,
    primary_array_path: str | None,
    used: set[str],
) -> str:
    relative_parts = [
        part
        for part in _relative_source_parts(
            source_path,
            primary_array_path,
        )
        if part != "first"
    ]
    candidate = "_".join(relative_parts)
    candidate = re.sub(
        r"[^\w]+",
        "_",
        candidate,
        flags=re.UNICODE,
    ).strip("_")
    if not candidate:
        candidate = "field"
    if candidate[0].isdigit():
        candidate = f"field_{candidate}"
    if candidate == "title":
        candidate = "source_title"

    unique = candidate
    suffix = 2
    while unique in used:
        unique = f"{candidate}_{suffix}"
        suffix += 1
    used.add(unique)
    return unique


def _mapping_sources(
    ai_mapping: dict[str, Any],
) -> dict[str, str]:
    source_by_target: dict[str, str] = {}
    for target, result_key in (
        ("title", "titleSourcePath"),
        ("content", "contentSourcePath"),
        ("image", "imageSourcePath"),
        ("category", "categorySourcePath"),
        ("status", "statusSourcePath"),
    ):
        source_path = ai_mapping.get(result_key)
        if isinstance(source_path, str) and source_path:
            source_by_target[target] = source_path
    if "title" not in source_by_target:
        raise SurfaceBuildError(
            "AI mapping에 titleSourcePath가 없습니다."
        )
    return source_by_target


def _canonicalize_rows(
    *,
    rows: list[DataRow],
    primary_array_path: str | None,
    template_id: str,
    ai_mapping: dict[str, Any],
) -> tuple[list[DataRow], dict[str, Any], list[dict[str, str]]]:
    source_by_target = _mapping_sources(ai_mapping)
    field_mapping: dict[str, Any] = {
        target: f"items[].{target}"
        for target in source_by_target
    }
    schema_mappings = [
        {
            "sourcePath": source_path,
            "targetField": target,
            "slot": target,
        }
        for target, source_path in source_by_target.items()
    ]

    table_fields: list[tuple[str, str]] = []
    if template_id == "matrix.table":
        field_source_paths = ai_mapping.get(
            "fieldSourcePaths"
        )
        if not isinstance(field_source_paths, list):
            raise SurfaceBuildError(
                "AI mapping의 fieldSourcePaths가 올바르지 않습니다."
            )
        used_targets = set(source_by_target)
        target_by_source = {
            source_path: target
            for target, source_path in source_by_target.items()
        }
        for source_path in field_source_paths:
            if not isinstance(source_path, str):
                raise SurfaceBuildError(
                    "AI table source path가 문자열이 아닙니다."
                )
            if source_path == source_by_target["title"]:
                continue
            target = target_by_source.get(
                source_path
            ) or _target_field_name(
                source_path,
                primary_array_path,
                used_targets,
            )
            table_fields.append((source_path, target))
            schema_mappings.append(
                {
                    "sourcePath": source_path,
                    "targetField": target,
                    "slot": "items[].columns",
                }
            )
        if len(table_fields) < 2:
            raise SurfaceBuildError(
                "데이터 테이블에 매핑된 scalar 컬럼이 2개 미만입니다."
            )
        field_mapping["fields"] = [
            f"items[].{target}"
            for _source_path, target in table_fields
        ]

    canonical_rows: list[DataRow] = []
    for row in rows:
        canonical_row: DataRow = {}
        for target, source_path in source_by_target.items():
            value = _row_value(
                row,
                source_path,
                primary_array_path,
            )
            if value is not None:
                canonical_row[target] = value
        for source_path, target in table_fields:
            value = _row_value(
                row,
                source_path,
                primary_array_path,
            )
            if value is not None:
                canonical_row[target] = value
        canonical_rows.append(canonical_row)

    if not any(row.get("title") is not None for row in canonical_rows):
        raise SurfaceBuildError(
            "AI title mapping으로 표시 값을 만들 수 없습니다."
        )
    return canonical_rows, field_mapping, schema_mappings


def _candidate_for_template(
    recommendation: dict[str, Any],
    template_id: str,
) -> dict[str, Any]:
    candidates = recommendation.get("candidates")
    if isinstance(candidates, list):
        for candidate in candidates:
            if (
                isinstance(candidate, dict)
                and candidate.get("templateId") == template_id
            ):
                return candidate
    raise SurfaceBuildError(
        "선택한 템플릿의 AI 평가 결과가 없습니다."
    )


def _surface_config(
    *,
    view_type: str,
    max_items: int,
    field_mapping: dict[str, Any],
) -> dict[str, Any]:
    config: dict[str, Any] = {
        "viewType": view_type,
        "titleBinding": field_mapping["title"],
        "maxItems": max_items,
    }
    if field_mapping.get("content"):
        config["contentBinding"] = field_mapping["content"]
    if field_mapping.get("image"):
        config["imageBinding"] = field_mapping["image"]
    if field_mapping.get("category"):
        config["categoryBinding"] = field_mapping["category"]
    if field_mapping.get("status"):
        config["statusBindings"] = [
            field_mapping["status"]
        ]
    if field_mapping.get("fields"):
        config["fieldBindings"] = field_mapping["fields"]
    return config


def _public_schema_summary(
    derived_schema: dict[str, Any],
) -> dict[str, Any]:
    fields = derived_schema.get("fields")
    return {
        "sourceId": derived_schema.get("sourceId"),
        "shape": derived_schema.get("shape"),
        "primaryArrayPath": derived_schema.get(
            "primaryArrayPath"
        ),
        "rowCount": derived_schema.get("rowCount"),
        "fields": [
            {
                "path": field.get("path"),
                "type": field.get("type"),
                "roles": field.get("roles"),
                "format": field.get("format"),
            }
            for field in (
                fields if isinstance(fields, list) else []
            )
            if isinstance(field, dict)
        ],
        "capabilities": derived_schema.get(
            "capabilities"
        ),
    }


def build_surface(
    *,
    template_id: str,
    query: str,
    api_id: str,
    data: Any,
    derived_schema: dict[str, Any],
    ai_recommendation: dict[str, Any],
    ai_mapping: dict[str, Any],
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    template = STATIC_TEMPLATE_BY_ID.get(template_id)
    if not template:
        raise SurfaceBuildError(
            f"지원하지 않는 템플릿입니다: {template_id}"
        )
    if ai_mapping.get("selectedTemplateId") != template_id:
        raise SurfaceBuildError(
            "AI mapping의 템플릿과 사용자 선택이 다릅니다."
        )

    primary_array_path = derived_schema.get(
        "primaryArrayPath"
    )
    if not isinstance(primary_array_path, str):
        primary_array_path = None
    normalized = normalize_data(
        data,
        primary_array_path=primary_array_path,
    )
    canonical_rows, field_mapping, schema_mappings = (
        _canonicalize_rows(
            rows=normalized.rows,
            primary_array_path=primary_array_path,
            template_id=template_id,
            ai_mapping=ai_mapping,
        )
    )
    candidate = _candidate_for_template(
        ai_recommendation,
        template_id,
    )
    source_metadata = metadata or {}
    mapping_reason = ai_mapping["reason"]

    return {
        "templateId": template_id,
        "version": "1.0.0",
        "payload": {
            "apiTitle": api_id,
            "apiId": api_id,
            "data": {
                "items": canonical_rows,
                "total": normalized.row_count,
            },
            "profile": {
                "rowCount": normalized.row_count,
                "shape": derived_schema.get("shape"),
                "fieldCount": len(
                    derived_schema.get("fields") or []
                ),
            },
            "renderPlan": {
                "selectedComponentId": template_id,
                "viewType": template.view_type,
                "fieldMapping": field_mapping,
                "fieldMappings": schema_mappings,
                "maxItems": template.max_items,
                "score": candidate["score"],
                "reason": mapping_reason,
                "isFallback": False,
                "strategy": "proxy_ai_schema_planner",
                "candidates": ai_recommendation["candidates"],
            },
        },
        "surfaceConfig": _surface_config(
            view_type=template.view_type,
            max_items=template.max_items,
            field_mapping=field_mapping,
        ),
        "sourceIntent": api_id,
        "updatedAt": datetime.now(
            timezone.utc
        ).isoformat(),
        "meta": {
            "templateVersion": STATIC_TEMPLATE_VERSION,
            "decisionReason": ai_recommendation["reason"],
            "mappingReason": mapping_reason,
            "strategy": "proxy_ai_schema_planner",
            "sourceArrayPath": normalized.source_array_path,
            "sourceRowCount": normalized.row_count,
            "sourceDataHash": source_metadata.get(
                "sourceDataHash"
            ),
            "derivedSchema": _public_schema_summary(
                derived_schema
            ),
            "aiMapping": ai_mapping,
            "trace": [
                "source:main-agent-data-result",
                f"schema:{derived_schema.get('shape')}",
                "planner:proxy-openai-template-selection",
                f"template:{template_id}",
                "planner:proxy-openai-slot-mapping",
                "binding:proxy-ai-schema-conversion",
            ],
        },
    }

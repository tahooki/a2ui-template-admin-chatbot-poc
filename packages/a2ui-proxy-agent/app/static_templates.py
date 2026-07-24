from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class StaticTemplate:
    template_id: str
    label: str
    view_type: str
    max_items: int
    description: str
    selection_guide: str
    schema_spec: dict[str, Any]
    input_schema: dict[str, Any]

    def planner_contract(self) -> dict[str, Any]:
        return {
            "templateId": self.template_id,
            "label": self.label,
            "description": self.description,
            "selectionGuide": self.selection_guide,
            "schemaSpec": self.schema_spec,
            "inputSchema": self.input_schema,
            "surfaceConfig": {
                "viewType": self.view_type,
                "maxItems": self.max_items,
            },
        }


STATIC_TEMPLATE_VERSION = 2

STATIC_TEMPLATES = (
    StaticTemplate(
        template_id="matrix.table",
        label="데이터 테이블",
        view_type="matrix.table",
        max_items=8,
        description="여러 scalar field를 가진 반복 데이터를 행과 열로 보여준다.",
        selection_guide="row가 여러 개이고 컬럼 비교가 핵심이며 일반 table 표현이 적합할 때 사용한다.",
        schema_spec={
            "dataShape": "array<object>",
            "requiredRoles": ["title"],
            "optionalRoles": ["metric", "status", "category", "updatedAt", "id"],
            "fieldHints": {
                "title": ["title", "name", "label"],
                "metric": ["metric", "value", "count", "total", "score", "rate"],
                "status": ["status", "state"],
            },
            "intentKeywords": ["테이블", "표", "table", "컬럼", "데이터셋"],
        },
        input_schema={
            "schemaVersion": "2026-06-11",
            "accepts": {"shape": ["array<object>"], "minRows": 1},
            "requiredSlots": [
                {
                    "slot": "items[].title",
                    "acceptsTypes": ["string"],
                    "acceptsRoles": ["title", "label"],
                    "required": True,
                },
                {
                    "slot": "items[].columns",
                    "acceptsTypes": ["string", "number", "boolean", "date", "datetime"],
                    "acceptsRoles": ["id", "label", "category", "status", "metric", "updatedAt", "time"],
                    "minCount": 2,
                    "required": True,
                },
            ],
            "optionalSlots": [
                {
                    "slot": "items[].status",
                    "acceptsTypes": ["string", "boolean"],
                    "acceptsRoles": ["status", "booleanFlag"],
                    "required": False,
                },
                {
                    "slot": "items[].updatedAt",
                    "acceptsTypes": ["date", "datetime", "string"],
                    "acceptsRoles": ["updatedAt", "time"],
                    "required": False,
                },
            ],
            "selectionHints": {
                "queryKeywords": ["테이블", "표", "table", "컬럼", "데이터셋"],
                "bestFor": ["generic tabular data"],
                "badFor": ["very sparse single-field records"],
                "priority": 2,
            },
        },
    ),
    StaticTemplate(
        template_id="collection.cardGrid",
        label="카드 그리드",
        view_type="collection.cardGrid",
        max_items=6,
        description="항목을 카드 단위로 배열해 이미지, 설명, 메타 정보를 함께 보여준다.",
        selection_guide="이미지/썸네일이 있거나 항목별 설명, 카테고리, 상태를 카드로 스캔하는 것이 적합할 때 사용한다.",
        schema_spec={
            "dataShape": "array<object>",
            "requiredRoles": ["title"],
            "optionalRoles": ["image", "content", "description", "category", "status", "metric"],
            "fieldHints": {
                "title": ["title", "name", "label"],
                "image": ["imageUrl", "thumbnailUrl", "photoUrl", "image"],
                "content": ["description", "content", "summary"],
                "category": ["category", "type"],
            },
            "intentKeywords": ["카드", "그리드", "이미지", "사진", "썸네일", "catalog", "card"],
        },
        input_schema={
            "schemaVersion": "2026-06-11",
            "accepts": {"shape": ["array<object>"], "minRows": 1},
            "requiredSlots": [
                {
                    "slot": "cards[].title",
                    "acceptsTypes": ["string"],
                    "acceptsRoles": ["title", "label"],
                    "required": True,
                }
            ],
            "optionalSlots": [
                {
                    "slot": "cards[].image",
                    "acceptsTypes": ["string"],
                    "acceptsRoles": ["image", "uri"],
                    "acceptsFormats": ["image-url", "uri"],
                    "required": False,
                },
                {
                    "slot": "cards[].description",
                    "acceptsTypes": ["string"],
                    "acceptsRoles": ["content", "description"],
                    "required": False,
                },
                {
                    "slot": "cards[].category",
                    "acceptsTypes": ["string"],
                    "acceptsRoles": ["category"],
                    "required": False,
                },
                {
                    "slot": "cards[].status",
                    "acceptsTypes": ["string", "boolean"],
                    "acceptsRoles": ["status", "booleanFlag"],
                    "required": False,
                },
            ],
            "selectionHints": {
                "queryKeywords": ["카드", "그리드", "이미지", "사진", "썸네일", "catalog", "card"],
                "bestFor": ["visual or metadata rich cards"],
                "badFor": ["dense tabular comparison", "large row count"],
                "priority": 4,
            },
        },
    ),
    StaticTemplate(
        template_id="collection.list",
        label="목록",
        view_type="collection.list",
        max_items=8,
        description="제목과 설명이 있는 반복 데이터를 세로 목록으로 보여준다.",
        selection_guide="반복 row에 title/name/label과 description/content/summary가 있고 카드나 표 신호가 약할 때 사용한다.",
        schema_spec={
            "dataShape": "array<object>",
            "requiredRoles": ["title"],
            "optionalRoles": ["content", "description", "category", "status", "updatedAt"],
            "fieldHints": {
                "title": ["title", "name", "label"],
                "content": ["description", "content", "summary"],
                "category": ["category", "type"],
                "status": ["status", "state"],
                "updatedAt": ["updatedAt", "updated_at", "lastUpdatedAt"],
            },
            "intentKeywords": ["목록", "리스트", "list", "검색 결과", "문서", "공지"],
        },
        input_schema={
            "schemaVersion": "2026-06-11",
            "accepts": {"shape": ["array<object>"], "minRows": 1},
            "requiredSlots": [
                {
                    "slot": "items[].title",
                    "acceptsTypes": ["string"],
                    "acceptsRoles": ["title", "label"],
                    "required": True,
                }
            ],
            "optionalSlots": [
                {
                    "slot": "items[].description",
                    "acceptsTypes": ["string"],
                    "acceptsRoles": ["content", "description"],
                    "required": False,
                },
                {
                    "slot": "items[].category",
                    "acceptsTypes": ["string"],
                    "acceptsRoles": ["category"],
                    "required": False,
                },
                {
                    "slot": "items[].status",
                    "acceptsTypes": ["string", "boolean"],
                    "acceptsRoles": ["status", "booleanFlag"],
                    "required": False,
                },
                {
                    "slot": "items[].updatedAt",
                    "acceptsTypes": ["date", "datetime", "string"],
                    "acceptsRoles": ["updatedAt", "time"],
                    "required": False,
                },
            ],
            "selectionHints": {
                "queryKeywords": ["목록", "리스트", "list", "검색 결과", "문서", "공지"],
                "bestFor": ["generic title and description list"],
                "badFor": ["image cards", "dense table"],
                "priority": 1,
            },
        },
    ),
)

STATIC_TEMPLATE_BY_ID = {template.template_id: template for template in STATIC_TEMPLATES}
STATIC_TEMPLATE_IDS = tuple(STATIC_TEMPLATE_BY_ID)


def planner_template_contracts() -> list[dict[str, Any]]:
    return [template.planner_contract() for template in STATIC_TEMPLATES]

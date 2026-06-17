from typing import Literal, TypedDict, cast

from .equipment_tools import EquipmentApiId

BusinessToolName = Literal[
    "get_equipment_catalog",
    "get_equipment_status",
    "get_equipment_status_wide_columns",
    "get_equipment_status_large_rows",
]


class BusinessToolDefinition(TypedDict):
    api_id: EquipmentApiId
    description: str
    input_schema: dict[str, object]
    output_shape: str


BUSINESS_TOOLS: dict[BusinessToolName, BusinessToolDefinition] = {
    "get_equipment_catalog": {
        "api_id": "equipment-catalog",
        "description": "기존 장비 목록 API",
        "input_schema": {"type": "object", "additionalProperties": False, "properties": {}},
        "output_shape": "object{items:array<object>,total:number,page:number,pageSize:number}",
    },
    "get_equipment_status": {
        "api_id": "equipment-status",
        "description": "기존 장비 상태 목록 API",
        "input_schema": {"type": "object", "additionalProperties": False, "properties": {}},
        "output_shape": "object{items:array<object>,total:number,page:number,pageSize:number}",
    },
    "get_equipment_status_wide_columns": {
        "api_id": "equipment-status-wide-columns",
        "description": "컬럼 수가 많은 장비 상태 테스트 API",
        "input_schema": {"type": "object", "additionalProperties": False, "properties": {}},
        "output_shape": "object{items:array<object>,total:number,page:number,pageSize:number}",
    },
    "get_equipment_status_large_rows": {
        "api_id": "equipment-status-large-rows",
        "description": "row 수가 많은 장비 상태 테스트 API",
        "input_schema": {"type": "object", "additionalProperties": False, "properties": {}},
        "output_shape": "object{items:array<object>,total:number,page:number,pageSize:number}",
    },
}

_API_BY_BUSINESS_TOOL: dict[BusinessToolName, EquipmentApiId] = {
    tool_name: definition["api_id"] for tool_name, definition in BUSINESS_TOOLS.items()
}
_BUSINESS_TOOL_BY_API: dict[EquipmentApiId, BusinessToolName] = {
    api_id: tool_name for tool_name, api_id in _API_BY_BUSINESS_TOOL.items()
}


def business_tool_definition(tool_name: str) -> BusinessToolDefinition:
    if tool_name not in BUSINESS_TOOLS:
        raise ValueError(f"Unsupported business tool: {tool_name}")
    return BUSINESS_TOOLS[cast(BusinessToolName, tool_name)]


def business_tool_for_api(api_id: str) -> BusinessToolName:
    if api_id not in _BUSINESS_TOOL_BY_API:
        raise ValueError(f"Unsupported equipment API id: {api_id}")
    return _BUSINESS_TOOL_BY_API[cast(EquipmentApiId, api_id)]


def api_id_for_business_tool(tool_name: str) -> EquipmentApiId:
    if tool_name not in _API_BY_BUSINESS_TOOL:
        raise ValueError(f"Unsupported business tool: {tool_name}")
    return _API_BY_BUSINESS_TOOL[cast(BusinessToolName, tool_name)]

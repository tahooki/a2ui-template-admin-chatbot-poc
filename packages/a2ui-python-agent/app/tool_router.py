from typing import Literal, cast

from .equipment_tools import EquipmentApiId

BusinessToolName = Literal["get_equipment_catalog", "get_equipment_status"]

_API_BY_BUSINESS_TOOL: dict[BusinessToolName, EquipmentApiId] = {
    "get_equipment_catalog": "equipment-catalog",
    "get_equipment_status": "equipment-status",
}

_BUSINESS_TOOL_BY_API: dict[EquipmentApiId, BusinessToolName] = {
    api_id: tool_name for tool_name, api_id in _API_BY_BUSINESS_TOOL.items()
}


def business_tool_for_api(api_id: str) -> BusinessToolName:
    if api_id not in _BUSINESS_TOOL_BY_API:
        raise ValueError(f"Unsupported equipment API id: {api_id}")
    return _BUSINESS_TOOL_BY_API[cast(EquipmentApiId, api_id)]


def api_id_for_business_tool(tool_name: str) -> EquipmentApiId:
    if tool_name not in _API_BY_BUSINESS_TOOL:
        raise ValueError(f"Unsupported business tool: {tool_name}")
    return _API_BY_BUSINESS_TOOL[cast(BusinessToolName, tool_name)]

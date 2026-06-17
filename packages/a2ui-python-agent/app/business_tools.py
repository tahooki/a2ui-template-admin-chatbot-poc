from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from .data_integrity import build_data_integrity_snapshot
from .equipment_tools import EquipmentApiId, fetch_equipment_data
from .tool_router import BusinessToolName, api_id_for_business_tool, business_tool_definition


@dataclass(frozen=True)
class BusinessToolResult:
    tool_name: BusinessToolName
    api_id: EquipmentApiId
    data: dict[str, Any]
    metadata: dict[str, Any] = field(default_factory=dict)


async def run_business_tool(tool_name: str) -> BusinessToolResult:
    api_id = api_id_for_business_tool(tool_name)
    definition = business_tool_definition(tool_name)
    data = await fetch_equipment_data(api_id)
    integrity = build_data_integrity_snapshot(data)
    metadata = {
        "source": "main_agent_business_tool",
        "operation": tool_name,
        "description": definition["description"],
        "inputSchema": definition["input_schema"],
        "outputShape": definition["output_shape"],
        "sourceToolName": tool_name,
        "sourceToolResultId": f"tool-result-{uuid4()}",
        "sourceApiId": api_id,
        "sourceDataHash": integrity["dataHash"],
        "sourceDataByteLength": integrity["byteLength"],
        "sourceRowCount": integrity["rowCount"],
        "sourceDataShape": integrity["shape"],
        "sourceTopLevelKeys": integrity["topLevelKeys"],
    }
    return BusinessToolResult(tool_name=tool_name, api_id=api_id, data=data, metadata=metadata)

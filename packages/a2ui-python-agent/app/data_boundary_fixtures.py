from copy import deepcopy
from typing import Any, Literal

DataBoundaryScenario = Literal[
    "standard",
    "alias",
    "wide_columns",
    "large_rows",
    "mutated_missing_row",
    "mutated_changed_field",
    "sensitive_fields",
]


def standard_equipment_status(row_count: int = 6) -> dict[str, Any]:
    items = [
        {
            "id": f"EQ-{index + 1:03d}",
            "name": f"Line {index + 1} CNC",
            "isOnline": index % 3 != 1,
            "isRunning": index % 4 != 2,
            "hasAlarm": index % 5 == 0,
            "needsInspection": index % 4 == 0,
            "isReserved": index % 6 == 0,
            "updatedAt": f"2026-06-17T09:{index:02d}:00Z",
        }
        for index in range(row_count)
    ]
    return {"items": items, "total": row_count, "page": 1, "pageSize": row_count}


def factory_alias_status(row_count: int = 6) -> dict[str, Any]:
    items = [
        {
            "eqpId": f"EQ-{index + 1:03d}",
            "eqpNm": f"Line {index + 1} CNC",
            "opYn": "Y" if index % 3 != 1 else "N",
            "runYn": "Y" if index % 4 != 2 else "N",
            "alrmCnt": 1 if index % 5 == 0 else 0,
            "inspReqYn": "Y" if index % 4 == 0 else "N",
            "lastDtm": f"2026-06-17T09:{index:02d}:00Z",
            "site": "A동",
        }
        for index in range(row_count)
    ]
    return {"items": items, "total": row_count, "page": 1, "pageSize": row_count}


def wide_columns_status(row_count: int = 6, column_count: int = 120) -> dict[str, Any]:
    data = standard_equipment_status(row_count)
    for row_index, row in enumerate(data["items"]):
        row.update({f"metric_{metric_index:03d}": row_index * 1000 + metric_index for metric_index in range(column_count)})
    return data


def large_rows_status(row_count: int = 1000) -> dict[str, Any]:
    return standard_equipment_status(row_count)


def mutated_missing_row() -> dict[str, Any]:
    data = standard_equipment_status(6)
    data["items"] = data["items"][:-1]
    data["total"] = len(data["items"])
    return data


def mutated_changed_field() -> dict[str, Any]:
    data = standard_equipment_status(6)
    data["items"][0]["isOnline"] = not data["items"][0]["isOnline"]
    return data


def sensitive_fields_status() -> dict[str, Any]:
    data = standard_equipment_status(2)
    data["items"][0].update(
        {
            "operatorEmail": "operator@example.com",
            "supportPhone": "010-1111-2222",
            "apiToken": "secret-token",
        }
    )
    return data


def data_boundary_fixture(scenario: DataBoundaryScenario) -> dict[str, Any]:
    if scenario == "standard":
        return standard_equipment_status()
    if scenario == "alias":
        return factory_alias_status()
    if scenario == "wide_columns":
        return wide_columns_status()
    if scenario == "large_rows":
        return large_rows_status()
    if scenario == "mutated_missing_row":
        return mutated_missing_row()
    if scenario == "mutated_changed_field":
        return mutated_changed_field()
    if scenario == "sensitive_fields":
        return sensitive_fields_status()
    raise ValueError(f"Unknown data boundary scenario: {scenario}")


def mutation_pair(kind: Literal["missing_row", "changed_field"]) -> tuple[dict[str, Any], dict[str, Any]]:
    source = standard_equipment_status(6)
    received = deepcopy(source)
    if kind == "missing_row":
        received["items"] = received["items"][:-1]
        received["total"] = len(received["items"])
        return source, received
    if kind == "changed_field":
        received["items"][0]["isOnline"] = not received["items"][0]["isOnline"]
        return source, received
    raise ValueError(f"Unknown mutation pair kind: {kind}")

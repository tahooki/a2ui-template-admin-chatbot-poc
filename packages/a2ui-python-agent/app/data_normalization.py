from copy import deepcopy
from typing import Any

from .data_integrity import build_data_integrity_snapshot, data_row_count, data_shape


def _items(data: Any) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        return []
    items = data.get("items")
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def _first_present(row: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        if key in row and row[key] is not None:
            return row[key]
    return None


def _bool_from_code(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if not isinstance(value, str):
        return None

    normalized = value.strip().upper()
    if normalized in {"Y", "YES", "TRUE", "T", "1", "ON", "RUN", "RUNNING", "ACTIVE", "OK"}:
        return True
    if normalized in {"N", "NO", "FALSE", "F", "0", "OFF", "STOP", "STOPPED", "INACTIVE", "NG"}:
        return False
    return None


def _alarm_from_value(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value > 0
    return _bool_from_code(value)


def _normalized_row(row: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    normalized = deepcopy(row)
    rules: list[dict[str, Any]] = []

    def assign(target: str, source_keys: list[str], transform: str, converter=lambda value: value) -> None:
        source_value = _first_present(row, source_keys)
        if source_value is None:
            return
        converted = converter(source_value)
        if converted is None:
            return
        source_key = next(key for key in source_keys if key in row and row[key] is not None)
        if source_key == target and row.get(target) == converted:
            return
        normalized[target] = converted
        rules.append(
            {
                "sourceField": source_key,
                "targetField": target,
                "transform": transform,
                "sourceValue": source_value,
                "normalizedValue": converted,
            }
        )

    assign("id", ["id", "equipmentId", "eqpId", "assetId"], "alias")
    assign("name", ["name", "equipmentName", "eqpNm", "assetName"], "alias")
    assign("isOnline", ["isOnline", "opYn", "onlineYn", "state_code"], "status_code_to_boolean", _bool_from_code)
    assign("isRunning", ["isRunning", "runYn", "runningYn"], "status_code_to_boolean", _bool_from_code)
    assign("hasAlarm", ["hasAlarm", "alrmCnt", "alarmCount", "alarmYn"], "alarm_value_to_boolean", _alarm_from_value)
    assign("needsInspection", ["needsInspection", "inspReqYn", "inspectionRequiredYn"], "status_code_to_boolean", _bool_from_code)
    assign("updatedAt", ["updatedAt", "lastDtm", "lastUpdatedAt"], "alias")
    assign("location", ["location", "site", "zone"], "alias")

    if "isReserved" not in normalized:
        normalized["isReserved"] = False
        rules.append(
            {
                "sourceField": "(default)",
                "targetField": "isReserved",
                "transform": "default_false",
                "sourceValue": None,
                "normalizedValue": False,
            }
        )

    return normalized, rules


def _trace(
    *,
    raw_data: Any,
    display_data: Any,
    applied: bool,
    rules: list[dict[str, Any]],
    strategy: str,
) -> dict[str, Any]:
    raw_rows = _items(raw_data)
    display_rows = _items(display_data)
    return {
        "applied": applied,
        "strategy": strategy,
        "sourceRowCount": data_row_count(raw_data),
        "displayRowCount": data_row_count(display_data),
        "sourceShape": data_shape(raw_data),
        "displayShape": data_shape(display_data),
        "rules": rules[:12],
        "beforeRows": raw_rows[:2],
        "afterRows": display_rows[:2],
    }


def build_display_data_trace(data: dict[str, Any]) -> dict[str, Any]:
    rows = _items(data)
    if not rows:
        snapshot = build_data_integrity_snapshot(data)
        return {
            "data": data,
            "trace": {
                **_trace(
                    raw_data=data,
                    display_data=data,
                    applied=False,
                    rules=[],
                    strategy="identity",
                ),
                "sourceDataHash": snapshot["dataHash"],
                "displayDataHash": snapshot["dataHash"],
            },
        }

    normalized_rows: list[dict[str, Any]] = []
    all_rules: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        normalized, rules = _normalized_row(row)
        normalized_rows.append(normalized)
        all_rules.extend({**rule, "rowIndex": index} for rule in rules)

    applied = len(all_rules) > 0
    alias_applied = any(rule["transform"] == "alias" and rule["sourceField"] != rule["targetField"] for rule in all_rules)
    status_applied = any("boolean" in rule["transform"] or rule["transform"].startswith("alarm") for rule in all_rules)
    default_applied = any(rule["transform"] == "default_false" for rule in all_rules)
    display_data = {
        **data,
        "items": normalized_rows,
    }

    source_snapshot = build_data_integrity_snapshot(data)
    display_snapshot = build_data_integrity_snapshot(display_data)
    strategy = "identity"
    if alias_applied and status_applied:
        strategy = "equipment_alias_and_status_code_to_canonical"
    elif alias_applied:
        strategy = "equipment_alias_to_canonical"
    elif status_applied:
        strategy = "equipment_status_code_to_canonical"
    elif default_applied:
        strategy = "equipment_default_status_to_canonical"

    return {
        "data": display_data,
        "trace": {
            **_trace(
                raw_data=data,
                display_data=display_data,
                applied=applied or alias_applied or status_applied,
                rules=all_rules,
                strategy=strategy,
            ),
            "sourceDataHash": source_snapshot["dataHash"],
            "displayDataHash": display_snapshot["dataHash"],
        },
    }

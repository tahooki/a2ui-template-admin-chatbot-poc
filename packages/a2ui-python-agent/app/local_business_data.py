from typing import Any, Callable

from .equipment_tools import EquipmentApiId


EQUIPMENT_TYPES = (
    {"category": "가공", "imageUrl": "/images/a2ui-template-poc/cnc.svg", "label": "CNC 가공기"},
    {"category": "이송", "imageUrl": "/images/a2ui-template-poc/robot-arm.svg", "label": "로봇 이송암"},
    {"category": "유틸리티", "imageUrl": "/images/a2ui-template-poc/pump.svg", "label": "순환 펌프"},
    {"category": "검사", "imageUrl": "/images/a2ui-template-poc/inspection.svg", "label": "비전 검사기"},
)
LOCATIONS = ("A동 1층", "A동 2층", "B동 1층", "B동 3층", "C동 실험실")
WIDE_COLUMN_LABELS = (
    "압력 센서 매트릭스",
    "온도 게이트웨이",
    "전력 계측 랙",
    "진동 분석 허브",
    "유량 텔레메트리",
    "품질 로그 브리지",
)
LARGE_ROW_LABELS = (
    "대량 검증 셀",
    "배치 컨베이어",
    "원격 IO 스테이션",
    "라인 버퍼 노드",
    "검사 슬롯",
    "예비 상태 노드",
)
IMAGE_PATHS = tuple(item["imageUrl"] for item in EQUIPMENT_TYPES)


def _page(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "items": items,
        "total": len(items),
        "page": 1,
        "pageSize": len(items),
    }


def _equipment_catalog() -> dict[str, Any]:
    items = []
    for index in range(44):
        equipment_type = EQUIPMENT_TYPES[index % len(EQUIPMENT_TYPES)]
        serial = f"{index + 1:02d}"
        items.append(
            {
                "id": f"eq-catalog-{serial}",
                "name": f"{equipment_type['label']} {serial}",
                "imageUrl": equipment_type["imageUrl"],
                "description": f"{equipment_type['category']} 라인에서 사용하는 핵심 장비입니다.",
                "category": equipment_type["category"],
                "location": LOCATIONS[index % len(LOCATIONS)],
            }
        )
    return _page(items)


def _equipment_status() -> dict[str, Any]:
    items = []
    for index in range(44):
        equipment_type = EQUIPMENT_TYPES[index % len(EQUIPMENT_TYPES)]
        serial = f"{index + 1:02d}"
        items.append(
            {
                "id": f"eq-status-{serial}",
                "name": f"{equipment_type['label']} {serial}",
                "isOnline": index % 7 != 0,
                "isRunning": index % 4 != 0,
                "hasAlarm": index % 9 == 0,
                "needsInspection": index % 11 == 0 or index % 13 == 0,
                "isReserved": index % 5 == 0,
            }
        )
    return _page(items)


def _wide_column_status() -> dict[str, Any]:
    items = []
    for index in range(6):
        serial = f"{index + 1:03d}"
        row: dict[str, Any] = {
            "assetId": f"WIDE-{serial}",
            "assetDisplayName": f"{WIDE_COLUMN_LABELS[index % len(WIDE_COLUMN_LABELS)]} W{serial}",
            "operStateCd": "ONLINE" if index % 2 == 0 else "OFFLINE",
            "runStateYn": "Y" if index % 3 != 1 else "N",
            "alarmTotalCnt": 2 if index == 2 else 0,
            "inspectDueYn": "Y" if index == 4 else "N",
            "reserveFlag": "Y" if index % 3 == 0 else "N",
            "lastSignalAt": f"2026-06-21T10:{index * 7:02d}:00Z",
            "plantZone": f"계측랩-{index + 1}",
        }
        row.update({f"telemetry_{column_index:03d}": index * 1000 + column_index for column_index in range(120)})
        items.append(row)
    return _page(items)


def _large_row_status() -> dict[str, Any]:
    rows = []
    for index in range(1000):
        serial = f"{index + 1:04d}"
        rows.append(
            {
                "eqp_id": f"BULK-{serial}",
                "eqp_nm": f"{LARGE_ROW_LABELS[index % len(LARGE_ROW_LABELS)]} {serial}",
                "operation_yn": "Y" if index % 19 != 0 else "N",
                "running_code": "RUN" if index % 6 != 0 else "STOP",
                "alarm_count": 1 if index % 37 == 0 else 0,
                "inspection_required": "Y" if index % 41 == 0 or index % 53 == 0 else "N",
                "reserved_flag": index % 8 == 0,
                "last_dtm": f"2026-06-21T11:{index % 60:02d}:00Z",
                "site_nm": f"대량검증-{(index % 20) + 1:02d}",
                "telemetry_000": 720 + (index % 80),
                "telemetry_001": 42 + (index % 17),
                "telemetry_002": round(0.82 + (index % 11) / 100, 2),
            }
        )
    return {
        "result": {
            "rows": rows,
            "totalCount": len(rows),
            "pageNo": 1,
            "rowsPerPage": len(rows),
        },
        "success": True,
    }


def _work_items() -> dict[str, Any]:
    statuses = ("queued", "in_progress", "review", "blocked", "done")
    priorities = ("high", "medium", "low", "urgent")
    owners = ("김도윤", "Ari Kim", "Mina Park", "Jules Lee", "Noah Choi")
    lanes = ("Discovery", "Build", "QA", "Release")
    stages = ("검토", "준비", "배포", "운영")
    items = []
    for index in range(18):
        serial = f"{index + 1:03d}"
        start_day = index % 12 + 1
        end_day = min(start_day + 2 + index % 5, 24)
        items.append(
            {
                "id": f"work-{serial}",
                "title": f"워크 아이템 {serial}",
                "description": f"{stages[index % len(stages)]} 단계의 공통 작업 항목입니다.",
                "status": statuses[index % len(statuses)],
                "progress": min(100, 12 + index * 5),
                "priority": priorities[index % len(priorities)],
                "assignee": owners[index % len(owners)],
                "lane": lanes[index % len(lanes)],
                "startAt": f"2026-07-{start_day:02d}T09:00:00Z",
                "endAt": f"2026-07-{end_day:02d}T18:00:00Z",
                "dueAt": f"2026-07-{end_day:02d}T18:00:00Z",
                "updatedAt": f"2026-07-{index % 20 + 1:02d}T09:{index * 7 % 60:02d}:00Z",
            }
        )
    return _page(items)


def _resources() -> dict[str, Any]:
    categories = ("템플릿", "문서", "미디어", "데이터셋")
    items = []
    for index in range(12):
        serial = f"{index + 1:03d}"
        category = categories[index % len(categories)]
        items.append(
            {
                "id": f"resource-{serial}",
                "title": f"리소스 {serial}",
                "imageUrl": IMAGE_PATHS[index % len(IMAGE_PATHS)],
                "description": f"{category} 유형의 재사용 가능한 리소스입니다.",
                "category": category,
                "status": "draft" if index % 4 == 0 else "available",
                "score": 72 + index % 24,
            }
        )
    return _page(items)


def _status_checks() -> dict[str, Any]:
    categories = ("서비스", "데이터", "보안", "운영")
    items = []
    for index in range(14):
        serial = f"{index + 1:03d}"
        items.append(
            {
                "id": f"check-{serial}",
                "title": f"상태 체크 {serial}",
                "category": categories[index % len(categories)],
                "isEnabled": index % 7 != 0,
                "isHealthy": index % 5 != 0,
                "hasWarning": index % 4 == 0,
                "isBlocked": index % 11 == 0,
                "lastCheckedAt": f"2026-07-02T08:{index * 3 % 60:02d}:00Z",
            }
        )
    return _page(items)


def _summary() -> dict[str, Any]:
    return _page(
        [
            {"id": "metric-total", "label": "전체 항목", "value": 128, "unit": "items", "delta": 12, "status": "good"},
            {"id": "metric-completion", "label": "완료율", "value": 84, "unit": "%", "delta": 4.2, "status": "good"},
            {"id": "metric-risk", "label": "위험 항목", "value": 7, "unit": "items", "delta": -2, "status": "warn"},
            {"id": "metric-latency", "label": "평균 지연", "value": 1.8, "unit": "days", "delta": -0.4, "status": "good"},
        ]
    )


def _hierarchy() -> dict[str, Any]:
    return _page(
        [
            {
                "id": "node-product",
                "title": "제품 영역",
                "status": "active",
                "count": 18,
                "children": [
                    {"id": "node-product-a", "title": "온보딩", "status": "active", "count": 7},
                    {"id": "node-product-b", "title": "리텐션", "status": "review", "count": 11},
                ],
            },
            {
                "id": "node-platform",
                "title": "플랫폼 영역",
                "status": "active",
                "count": 24,
                "children": [
                    {"id": "node-platform-a", "title": "API", "status": "active", "count": 12},
                    {"id": "node-platform-b", "title": "데이터", "status": "blocked", "count": 6},
                    {"id": "node-platform-c", "title": "관측성", "status": "review", "count": 6},
                ],
            },
        ]
    )


LOCAL_DATA_BUILDERS: dict[EquipmentApiId, Callable[[], dict[str, Any]]] = {
    "equipment-catalog": _equipment_catalog,
    "equipment-status": _equipment_status,
    "equipment-status-wide-columns": _wide_column_status,
    "equipment-status-large-rows": _large_row_status,
    "work-items": _work_items,
    "resources": _resources,
    "status-checks": _status_checks,
    "summary": _summary,
    "hierarchy": _hierarchy,
}


def load_local_business_data(api_id: EquipmentApiId) -> dict[str, Any]:
    return LOCAL_DATA_BUILDERS[api_id]()

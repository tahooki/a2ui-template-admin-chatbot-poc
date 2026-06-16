from typing import Any

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="A2UI Equipment Data Source", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


EQUIPMENT_TYPES = [
    {"category": "가공", "imageUrl": "/images/a2ui-template-poc/cnc.svg", "label": "CNC 가공기"},
    {"category": "이송", "imageUrl": "/images/a2ui-template-poc/robot-arm.svg", "label": "로봇 이송암"},
    {"category": "유틸리티", "imageUrl": "/images/a2ui-template-poc/pump.svg", "label": "순환 펌프"},
    {"category": "검사", "imageUrl": "/images/a2ui-template-poc/inspection.svg", "label": "비전 검사기"},
]
LOCATIONS = ["A동 1층", "A동 2층", "B동 1층", "B동 3층", "C동 실험실"]


def _serial(index: int) -> str:
    return str(index + 1).zfill(2)


def _equipment_type(index: int) -> dict[str, str]:
    return EQUIPMENT_TYPES[index % len(EQUIPMENT_TYPES)]


def _catalog_item(index: int) -> dict[str, Any]:
    equipment_type = _equipment_type(index)
    serial = _serial(index)
    return {
        "id": f"eq-catalog-{serial}",
        "name": f"{equipment_type['label']} {serial}",
        "imageUrl": equipment_type["imageUrl"],
        "description": f"{equipment_type['category']} 라인에서 사용하는 핵심 장비입니다.",
        "category": equipment_type["category"],
        "location": LOCATIONS[index % len(LOCATIONS)],
    }


def _status_item(index: int) -> dict[str, Any]:
    equipment_type = _equipment_type(index)
    serial = _serial(index)
    return {
        "id": f"eq-status-{serial}",
        "name": f"{equipment_type['label']} {serial}",
        "isOnline": index % 7 != 0,
        "isRunning": index % 4 != 0,
        "hasAlarm": index % 9 == 0,
        "needsInspection": index % 11 == 0 or index % 13 == 0,
        "isReserved": index % 5 == 0,
    }


CATALOG_ITEMS = [_catalog_item(index) for index in range(44)]
STATUS_ITEMS = [_status_item(index) for index in range(44)]


def _page(items: list[dict[str, Any]], page: int, page_size: int) -> dict[str, Any]:
    safe_page = max(1, page)
    safe_size = min(max(1, page_size), 100)
    start = (safe_page - 1) * safe_size
    return {
        "items": items[start : start + safe_size],
        "total": len(items),
        "page": safe_page,
        "pageSize": safe_size,
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "name": "a2ui-equipment-data-source",
        "catalogCount": len(CATALOG_ITEMS),
        "statusCount": len(STATUS_ITEMS),
    }


@app.get("/equipment-catalog")
async def equipment_catalog(
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=44, ge=1, le=100),
) -> dict[str, Any]:
    return _page(CATALOG_ITEMS, page, pageSize)


@app.get("/equipment-status")
async def equipment_status(
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=44, ge=1, le=100),
) -> dict[str, Any]:
    return _page(STATUS_ITEMS, page, pageSize)

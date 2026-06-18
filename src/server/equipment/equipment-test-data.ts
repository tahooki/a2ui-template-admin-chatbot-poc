import type { EquipmentApiResponse } from "@/features/a2ui-template-poc/template-types";

type EquipmentRow = Record<string, unknown>;
type PageOptions = {
  page?: number;
  pageSize?: number;
};

const equipmentTypes = [
  { category: "가공", imageUrl: "/images/a2ui-template-poc/cnc.svg", label: "CNC 가공기" },
  { category: "이송", imageUrl: "/images/a2ui-template-poc/robot-arm.svg", label: "로봇 이송암" },
  { category: "유틸리티", imageUrl: "/images/a2ui-template-poc/pump.svg", label: "순환 펌프" },
  { category: "검사", imageUrl: "/images/a2ui-template-poc/inspection.svg", label: "비전 검사기" },
];
const locations = ["A동 1층", "A동 2층", "B동 1층", "B동 3층", "C동 실험실"];
const wideColumnLabels = ["압력 센서 매트릭스", "온도 게이트웨이", "전력 계측 랙", "진동 분석 허브", "유량 텔레메트리", "품질 로그 브리지"];
const largeRowLabels = ["대량 검증 셀", "배치 컨베이어", "원격 IO 스테이션", "라인 버퍼 노드", "검사 슬롯", "예비 상태 노드"];

function baseSerial(index: number) {
  return String(index + 1).padStart(2, "0");
}

function equipmentType(index: number) {
  return equipmentTypes[index % equipmentTypes.length];
}

function catalogRow(index: number): EquipmentRow {
  const type = equipmentType(index);
  const serial = baseSerial(index);
  return {
    id: `eq-catalog-${serial}`,
    name: `${type.label} ${serial}`,
    imageUrl: type.imageUrl,
    description: `${type.category} 라인에서 사용하는 핵심 장비입니다.`,
    category: type.category,
    location: locations[index % locations.length],
  };
}

function statusRow(index: number): EquipmentRow {
  const type = equipmentType(index);
  const serial = baseSerial(index);
  return {
    id: `eq-status-${serial}`,
    name: `${type.label} ${serial}`,
    isOnline: index % 7 !== 0,
    isRunning: index % 4 !== 0,
    hasAlarm: index % 9 === 0,
    needsInspection: index % 11 === 0 || index % 13 === 0,
    isReserved: index % 5 === 0,
  };
}

function wideColumnStatusRow(index: number): EquipmentRow {
  const serial = String(index + 1).padStart(3, "0");
  const label = wideColumnLabels[index % wideColumnLabels.length];
  return {
    id: `wide-status-${serial}`,
    name: `${label} W${serial}`,
    isOnline: index % 2 === 0,
    isRunning: index % 3 !== 1,
    hasAlarm: index === 2,
    needsInspection: index === 4,
    isReserved: index % 3 === 0,
    updatedAt: `2026-06-17T10:${String(index * 7).padStart(2, "0")}:00Z`,
    location: `계측랩-${index + 1}`,
  };
}

function largeRowStatusRow(index: number): EquipmentRow {
  const serial = String(index + 1).padStart(4, "0");
  const label = largeRowLabels[index % largeRowLabels.length];
  return {
    id: `bulk-status-${serial}`,
    name: `${label} ${serial}`,
    isOnline: index % 19 !== 0,
    isRunning: index % 6 !== 0,
    hasAlarm: index % 37 === 0,
    needsInspection: index % 41 === 0 || index % 53 === 0,
    isReserved: index % 8 === 0,
    updatedAt: `2026-06-17T11:${String(index % 60).padStart(2, "0")}:00Z`,
    location: `대량검증-${String((index % 20) + 1).padStart(2, "0")}`,
  };
}

function pageItems(items: EquipmentRow[], page = 1, pageSize = items.length) {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(Math.max(1, pageSize), 1000);
  const start = (safePage - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    total: items.length,
    page: safePage,
    pageSize: safeSize,
  };
}

function response(items: EquipmentRow[], pageSize = items.length): EquipmentApiResponse<unknown> {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize,
  };
}

export function buildEquipmentCatalog({ page = 1, pageSize = 44 }: PageOptions = {}): EquipmentApiResponse<unknown> {
  return pageItems(Array.from({ length: 44 }, (_, index) => catalogRow(index)), page, pageSize);
}

export function buildEquipmentStatus({ page = 1, pageSize = 44 }: PageOptions = {}): EquipmentApiResponse<unknown> {
  return pageItems(Array.from({ length: 44 }, (_, index) => statusRow(index)), page, pageSize);
}

export function buildWideColumnEquipmentStatus(): EquipmentApiResponse<unknown> {
  const items = Array.from({ length: 6 }, (_, rowIndex) => {
    const row = wideColumnStatusRow(rowIndex);
    for (let columnIndex = 0; columnIndex < 120; columnIndex += 1) {
      row[`telemetry_${String(columnIndex).padStart(3, "0")}`] = rowIndex * 1000 + columnIndex;
    }
    return row;
  });
  return response(items);
}

export function buildLargeRowsEquipmentStatus(rowCount = 1000): EquipmentApiResponse<unknown> {
  return response(Array.from({ length: rowCount }, (_, index) => largeRowStatusRow(index)), rowCount);
}

import type { EquipmentApiResponse } from "@/features/a2ui-template-poc/template-types";

type EquipmentRow = Record<string, unknown>;

const wideColumnLabels = ["압력 센서 매트릭스", "온도 게이트웨이", "전력 계측 랙", "진동 분석 허브", "유량 텔레메트리", "품질 로그 브리지"];
const largeRowLabels = ["대량 검증 셀", "배치 컨베이어", "원격 IO 스테이션", "라인 버퍼 노드", "검사 슬롯", "예비 상태 노드"];

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

function response(items: EquipmentRow[], pageSize = items.length): EquipmentApiResponse<unknown> {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize,
  };
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

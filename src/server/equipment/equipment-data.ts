import type { EquipmentCatalogItem, EquipmentStatusItem } from "@/features/a2ui-template-poc/template-types";

const equipmentTypes = [
  { category: "가공", imageUrl: "/images/a2ui-template-poc/cnc.svg", label: "CNC 가공기" },
  { category: "이송", imageUrl: "/images/a2ui-template-poc/robot-arm.svg", label: "로봇 이송암" },
  { category: "유틸리티", imageUrl: "/images/a2ui-template-poc/pump.svg", label: "순환 펌프" },
  { category: "검사", imageUrl: "/images/a2ui-template-poc/inspection.svg", label: "비전 검사기" },
];

const locations = ["A동 1층", "A동 2층", "B동 1층", "B동 3층", "C동 실험실"];

export const equipmentCatalogItems: EquipmentCatalogItem[] = Array.from({ length: 44 }, (_, index) => {
  const type = equipmentTypes[index % equipmentTypes.length];
  const serial = String(index + 1).padStart(2, "0");
  return {
    id: `eq-catalog-${serial}`,
    name: `${type.label} ${serial}`,
    imageUrl: type.imageUrl,
    description: `${type.category} 라인에서 사용하는 핵심 장비입니다. 작업 상태와 기본 정보를 카탈로그에서 빠르게 확인합니다.`,
    category: type.category,
    location: locations[index % locations.length],
  };
});

export const equipmentStatusItems: EquipmentStatusItem[] = Array.from({ length: 44 }, (_, index) => {
  const type = equipmentTypes[index % equipmentTypes.length];
  const serial = String(index + 1).padStart(2, "0");
  return {
    id: `eq-status-${serial}`,
    name: `${type.label} ${serial}`,
    isOnline: index % 7 !== 0,
    isRunning: index % 4 !== 0,
    hasAlarm: index % 9 === 0,
    needsInspection: index % 11 === 0 || index % 13 === 0,
    isReserved: index % 5 === 0,
  };
});

export function paginate<T>(items: T[], page = 1, pageSize = 44) {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(Math.max(1, pageSize), 100);
  const start = (safePage - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    total: items.length,
    page: safePage,
    pageSize: safeSize,
  };
}

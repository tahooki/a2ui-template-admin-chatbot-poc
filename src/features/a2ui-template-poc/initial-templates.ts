import type { A2UITemplateRegistration } from "./template-types";

const now = "2026-06-08T00:00:00.000Z";

export const INITIAL_TEMPLATES: A2UITemplateRegistration[] = [
  {
    componentId: "equipment.statusBooleanList",
    title: "장비 상태 Boolean 리스트",
    description: "짧은 장비 이름과 여러 boolean 상태값을 한 줄씩 보여준다.",
    selectionGuide:
      "사용자가 장비 상태, 가동 여부, 알람, 점검 필요 여부를 보고 싶다고 말하고 데이터에 name과 여러 boolean field가 있을 때 사용한다.",
    schemaSpec: {
      dataShape: "array<object>",
      listPath: "items",
      requiredRoles: ["title", "booleanFlag"],
      minBooleanFields: 3,
      fieldHints: {
        title: ["name", "equipmentName", "title"],
        booleanFlag: ["isOnline", "isRunning", "hasAlarm", "needsInspection", "isReserved"],
      },
      intentKeywords: ["상태", "장비 상태", "가동", "점검", "알람", "예약"],
    },
    surfaceConfig: {
      viewType: "statusBooleanList",
      titleBinding: "items[].name",
      statusBindings: [
        "items[].isOnline",
        "items[].isRunning",
        "items[].hasAlarm",
        "items[].needsInspection",
        "items[].isReserved",
      ],
      maxItems: 10,
    },
    status: "registered",
    updatedAt: now,
  },
  {
    componentId: "simpleTextList",
    title: "텍스트 목록 Fallback",
    description: "적합한 A2UI 컴포넌트가 없을 때 이름과 본문만 안전하게 보여준다.",
    selectionGuide:
      "등록된 A2UI 컴포넌트가 데이터 형태를 만족하지 못할 때 fallback으로 사용한다. 이미지 필드는 표시하지 않는다.",
    schemaSpec: {
      dataShape: "array<object>",
      listPath: "items",
      requiredRoles: ["title"],
      optionalRoles: ["content", "description", "category", "location"],
      fieldHints: {
        title: ["name", "title"],
        content: ["description", "content", "summary"],
      },
      intentKeywords: ["목록", "리스트", "보여줘"],
    },
    surfaceConfig: {
      viewType: "simpleTextList",
      titleBinding: "items[].name",
      contentBinding: "items[].description",
      maxItems: 10,
    },
    status: "registered",
    updatedAt: now,
  },
];

import type { A2UITemplateRegistration } from "./template-types";

const now = "2026-06-08T00:00:00.000Z";

export const COMMON_STATUS_TEMPLATE_ID = "equipment.commonStatusTable";

export const INITIAL_TEMPLATES: A2UITemplateRegistration[] = [
  {
    componentId: COMMON_STATUS_TEMPLATE_ID,
    title: "공용 장비 상태 템플릿",
    description: "상태 목록, 컬럼 많은 상태, 데이터 많은 상태 API를 하나의 고정 A2UI 상태 표로 보여준다.",
    selectionGuide:
      "장비 상태 계열 API에서 name과 여러 boolean status field를 찾을 수 있을 때 우선 사용하는 고정 공용 템플릿이다.",
    schemaSpec: {
      dataShape: "array<object>",
      listPath: "items",
      requiredRoles: ["title", "booleanFlag"],
      minBooleanFields: 3,
      fieldHints: {
        title: ["name", "equipmentName", "eqpNm", "assetName", "title"],
        booleanFlag: ["isOnline", "isRunning", "hasAlarm", "needsInspection", "isReserved", "opYn", "runYn", "inspReqYn"],
      },
      intentKeywords: ["상태", "장비 상태", "컬럼 많은 상태", "데이터 많은 상태", "가동", "점검", "알람", "예약"],
    },
    inputSchema: {
      schemaVersion: "2026-06-11",
      accepts: {
        shape: ["array<object>"],
        minRows: 1,
        capabilities: {
          hasBooleans: true,
          hasStatus: true,
        },
      },
      requiredSlots: [
        {
          slot: "items[].title",
          acceptsTypes: ["string"],
          acceptsRoles: ["title", "label"],
          required: true,
        },
        {
          slot: "items[].statusFlags",
          acceptsTypes: ["boolean"],
          acceptsRoles: ["booleanFlag", "status"],
          minCount: 3,
          required: true,
        },
      ],
      optionalSlots: [
        {
          slot: "items[].updatedAt",
          acceptsTypes: ["date", "datetime", "string"],
          acceptsRoles: ["updatedAt", "time"],
          required: false,
        },
        {
          slot: "items[].location",
          acceptsTypes: ["string"],
          acceptsRoles: ["location"],
          required: false,
        },
      ],
      selectionHints: {
        queryKeywords: ["상태", "장비 상태", "컬럼 많은 상태", "데이터 많은 상태", "가동", "점검", "알람", "예약"],
        bestFor: ["fixed common equipment status table", "large rows equipment status", "wide columns equipment status"],
        priority: 5,
      },
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
      maxItems: 6,
    },
    status: "registered",
    updatedAt: now,
  },
  {
    componentId: "equipment.statusBooleanList",
    title: "장비 상태 목록",
    description: "짧은 장비 이름과 여러 상태값을 한 줄씩 보여준다.",
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
    inputSchema: {
      schemaVersion: "2026-06-11",
      accepts: {
        shape: ["array<object>"],
        minRows: 1,
        capabilities: {
          hasBooleans: true,
          hasStatus: true,
        },
      },
      requiredSlots: [
        {
          slot: "items[].title",
          acceptsTypes: ["string"],
          acceptsRoles: ["title", "label"],
          required: true,
        },
        {
          slot: "items[].statusFlags",
          acceptsTypes: ["boolean"],
          acceptsRoles: ["booleanFlag", "status"],
          minCount: 3,
          required: true,
        },
      ],
      selectionHints: {
        queryKeywords: ["상태", "장비 상태", "가동", "점검", "알람", "예약"],
        bestFor: ["equipment status boolean list"],
        priority: 2,
      },
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
      maxItems: 6,
    },
    status: "registered",
    updatedAt: now,
  },
];

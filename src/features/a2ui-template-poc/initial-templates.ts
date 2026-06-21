import type { A2UITemplateRegistration } from "./template-types";

const now = "2026-06-08T00:00:00.000Z";

export const COMMON_STATUS_TEMPLATE_ID = "equipment.commonStatusTable";
export const TELEMETRY_STATUS_TEMPLATE_ID = "equipment.telemetryStatusTable";

export const INITIAL_TEMPLATES: A2UITemplateRegistration[] = [
  {
    componentId: COMMON_STATUS_TEMPLATE_ID,
    title: "공용 장비 상태 템플릿",
    description: "장비 상태 row 목록과 대량 상태 API를 하나의 고정 A2UI 상태 표로 보여준다.",
    selectionGuide:
      "장비 상태 계열 API에서 장비명과 여러 boolean status field를 찾을 수 있고, metric/telemetry 컬럼이 중심이 아닐 때 사용하는 고정 공용 템플릿이다.",
    schemaSpec: {
      dataShape: "array<object>",
      listPath: "items",
      requiredRoles: ["title", "booleanFlag"],
      minBooleanFields: 3,
      fieldHints: {
        title: ["name", "equipmentName", "eqpNm", "eqp_nm", "title"],
        booleanFlag: ["isOnline", "isRunning", "hasAlarm", "needsInspection", "isReserved", "opYn", "runYn", "inspReqYn", "operation_yn", "running_code", "inspection_required", "reserved_flag"],
      },
      intentKeywords: ["상태", "장비 상태", "데이터 많은 상태", "가동", "점검", "알람", "예약"],
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
        queryKeywords: ["상태", "장비 상태", "데이터 많은 상태", "가동", "점검", "알람", "예약"],
        bestFor: ["fixed common equipment status table", "large rows equipment status"],
        badFor: ["wide telemetry data", "many numeric telemetry columns"],
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
    componentId: TELEMETRY_STATUS_TEMPLATE_ID,
    title: "계측 상태 테이블",
    description: "컬럼이 많은 장비 상태/계측 API에서 상태값과 numeric telemetry 값을 함께 보여준다.",
    selectionGuide:
      "컬럼 수가 많고 telemetry/metric field가 여러 개 있으며, 사용자가 컬럼 많은 상태, 계측, 진단 값을 보고 싶어 할 때 사용한다. 일반 상태 목록처럼 boolean 상태만 많은 데이터에는 사용하지 않는다.",
    schemaSpec: {
      dataShape: "array<object>",
      listPath: "items",
      requiredRoles: ["title", "booleanFlag", "metric"],
      minBooleanFields: 2,
      fieldHints: {
        title: ["assetDisplayName", "assetName", "name", "equipmentName", "title"],
        booleanFlag: ["operStateCd", "runStateYn", "inspectDueYn", "reserveFlag", "isOnline", "isRunning", "needsInspection", "isReserved"],
        metric: ["telemetry", "metric", "alarmTotalCnt", "alarm_count", "count", "rate", "score"],
      },
      intentKeywords: ["컬럼 많은 상태", "계측", "진단", "텔레메트리", "telemetry", "metric"],
    },
    inputSchema: {
      schemaVersion: "2026-06-11",
      accepts: {
        shape: ["array<object>"],
        minRows: 1,
        capabilities: {
          hasBooleans: true,
          hasStatus: true,
          hasNumericMetrics: true,
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
          minCount: 2,
          required: true,
        },
        {
          slot: "items[].metrics",
          acceptsTypes: ["number"],
          acceptsRoles: ["metric"],
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
        queryKeywords: ["컬럼 많은 상태", "계측", "진단", "텔레메트리", "telemetry", "metric"],
        bestFor: ["wide telemetry status table", "equipment diagnostics with many numeric columns"],
        badFor: ["large rows without telemetry metrics", "plain equipment status list"],
        priority: 8,
      },
    },
    surfaceConfig: {
      viewType: "telemetryStatusTable",
      titleBinding: "items[].name",
      statusBindings: ["items[].isOnline", "items[].isRunning", "items[].hasAlarm", "items[].needsInspection"],
      metricBindings: ["items[].telemetry_000", "items[].telemetry_001", "items[].telemetry_002"],
      maxItems: 6,
    },
    status: "registered",
    updatedAt: now,
  },
  {
    componentId: "equipment.statusBooleanList",
    title: "장비 상태 목록",
    description: "레거시 상태 목록 템플릿이다. 공용 상태 템플릿과 거의 같아 AI 선택 검증에서는 제외한다.",
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
    status: "draft",
    updatedAt: now,
  },
];

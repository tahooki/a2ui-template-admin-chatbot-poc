import type {
  A2UIDataProfile,
  A2UIDerivedFieldType,
  A2UIRenderPlan,
  A2UIRole,
  A2UISurfaceEnvelope,
  A2UITemplateRegistration,
  EquipmentApiResponse,
} from "./template-types";
import type { AgentFlowEvent } from "./agent-flow-types";
import { COMMON_STATUS_TEMPLATE_ID } from "./initial-templates";

export type DataBoundaryScenarioId = "status" | "catalog" | "wide_columns" | "large_rows";

export type DataBoundaryScenario = {
  id: DataBoundaryScenarioId;
  label: string;
  description: string;
  apiRoute: string;
  apiId: string;
  businessToolName: string;
  query: string;
  expectedTemplateId: string;
  expectedTemplateNote?: string;
};

export type DataFingerprint = {
  dataHash: string;
  byteLength: number;
  rowCount: number;
  shape: string;
  topLevelKeys?: string[];
};

export type DataIntegrityComparison = {
  expectedHash: string;
  receivedHash: string;
  hashMatched: boolean;
  expectedRowCount: number;
  receivedRowCount: number;
  rowCountMatched: boolean;
  expectedByteLength: number;
  receivedByteLength: number;
  byteLengthMatched: boolean;
  receivedShape: string;
  receivedTopLevelKeys?: string[];
  matched: boolean;
};

export type LabPreview = {
  rowCount: number;
  sampleSize: number;
  truncated: boolean;
  byteLength: number;
  maskedFields: string[];
  data: EquipmentApiResponse<unknown>;
};

export type LabDerivedField = {
  path: string;
  key: string;
  type: A2UIDerivedFieldType;
  roles: A2UIRole[];
  examples: unknown[];
};

export type LabDerivedSchema = {
  sourceId: string;
  shape: "array<object>" | "object" | "unknown";
  primaryArrayPath?: string;
  rowCount: number;
  sampleSize: number;
  fields: LabDerivedField[];
  capabilities: {
    hasImages: boolean;
    hasBooleans: boolean;
    hasStatus: boolean;
    hasTimeField: boolean;
    hasNumericMetrics: boolean;
    hasCategories: boolean;
    hasNestedObjects: boolean;
  };
};

export type NormalizationTrace = {
  applied: boolean;
  strategy: string;
  sourceRowCount: number;
  displayRowCount: number;
  sourceShape: string;
  displayShape: string;
  sourceDataHash: string;
  displayDataHash: string;
  rules: Array<{
    rowIndex: number;
    sourceField: string;
    targetField: string;
    transform: string;
    sourceValue: unknown;
    normalizedValue: unknown;
  }>;
  beforeRows: Record<string, unknown>[];
  afterRows: Record<string, unknown>[];
};

export type FieldMappingComparison = {
  derivedField: string;
  templateSlot: string;
  type: string;
  role: string;
  aliasOrNormalization: string;
  decision: string;
};

export type DataBoundaryScenarioTrace = {
  id: DataBoundaryScenarioId;
  title: string;
  apiLabel: string;
  apiId: string;
  apiRoute: string;
  businessToolName: string;
  expectedTemplateId: string;
  expectedTemplateNote?: string;
  query: string;
  sourceData: EquipmentApiResponse<unknown>;
  receivedData: EquipmentApiResponse<unknown>;
  displayData: EquipmentApiResponse<unknown>;
  sourceFingerprint: DataFingerprint;
  receivedFingerprint: DataFingerprint;
  integrity: DataIntegrityComparison;
  normalization: NormalizationTrace;
  sampleDataPreview: LabPreview;
  derivedSchema: LabDerivedSchema;
  templateContract: A2UITemplateRegistration;
  mappingComparison: FieldMappingComparison[];
  renderPlan: A2UIRenderPlan;
  surfaceEnvelope: A2UISurfaceEnvelope;
  a2uiRenderPayload: Record<string, unknown>;
};

const statusTemplate: A2UITemplateRegistration = {
  componentId: COMMON_STATUS_TEMPLATE_ID,
  title: "공용 장비 상태 템플릿",
  description: "장비 상태 목록 계열 API를 공통으로 렌더링하는 고정 boolean status table template.",
  selectionGuide:
    "장비 상태, 가동, 알람, 점검 여부를 보고 싶고 name과 여러 boolean status field가 있을 때 사용한다.",
  schemaSpec: {
    dataShape: "array<object>",
    listPath: "items",
    requiredRoles: ["title", "booleanFlag"],
    minBooleanFields: 3,
    fieldHints: {
      title: ["name", "equipmentName", "eqpNm", "assetName"],
      booleanFlag: ["isOnline", "isRunning", "hasAlarm", "needsInspection", "isReserved", "opYn", "runYn", "inspReqYn"],
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
    statusBindings: ["items[].isOnline", "items[].isRunning", "items[].hasAlarm", "items[].needsInspection", "items[].isReserved"],
    maxItems: 6,
  },
  status: "registered",
  updatedAt: "2026-06-17T00:00:00.000Z",
};

const catalogTemplate: A2UITemplateRegistration = {
  componentId: "equipment.imageCardList",
  title: "장비 이미지 카드",
  description: "이미지, 이름, 설명이 있는 장비 목록을 카드 그리드로 보여준다.",
  selectionGuide:
    "사용자가 장비 목록, 이미지 목록, 설비 카탈로그를 보고 싶다고 말하고 데이터에 imageUrl/name/description 필드가 있을 때 사용한다.",
  schemaSpec: {
    dataShape: "array<object>",
    listPath: "items",
    requiredRoles: ["title", "content", "image"],
    fieldHints: {
      title: ["name", "title"],
      content: ["description", "content", "summary"],
      image: ["imageUrl", "thumbnailUrl", "photoUrl"],
    },
    intentKeywords: ["이미지", "사진", "장비 리스트", "카탈로그", "설비"],
  },
  inputSchema: {
    schemaVersion: "2026-06-11",
    accepts: {
      shape: ["array<object>"],
      minRows: 1,
      capabilities: {
        hasImages: true,
      },
    },
    requiredSlots: [
      {
        slot: "cards[].title",
        acceptsTypes: ["string"],
        acceptsRoles: ["title", "label"],
        required: true,
      },
      {
        slot: "cards[].imageUrl",
        acceptsTypes: ["string"],
        acceptsRoles: ["image", "uri"],
        acceptsFormats: ["image-url", "uri"],
        required: true,
      },
    ],
    optionalSlots: [
      {
        slot: "cards[].description",
        acceptsTypes: ["string"],
        acceptsRoles: ["content", "description"],
        required: false,
      },
    ],
    selectionHints: {
      queryKeywords: ["이미지", "사진", "장비 리스트", "카탈로그", "설비"],
      bestFor: ["equipment catalog image card grid"],
      priority: 3,
    },
  },
  surfaceConfig: {
    viewType: "imageCardList",
    titleBinding: "items[].name",
    contentBinding: "items[].description",
    imageBinding: "items[].imageUrl",
    maxItems: 6,
  },
  status: "registered",
  updatedAt: "2026-06-17T00:00:00.000Z",
};

export const dataBoundaryScenarios: DataBoundaryScenario[] = [
  {
    id: "status",
    label: "상태 목록",
    description: "기존 상태 API",
    apiRoute: "/api/equipment-status",
    apiId: "equipment-status",
    businessToolName: "get_equipment_status",
    query: "장비 상태 목록 보여줘",
    expectedTemplateId: COMMON_STATUS_TEMPLATE_ID,
  },
  {
    id: "catalog",
    label: "장비 목록",
    description: "기존 목록 API",
    apiRoute: "/api/equipment-catalog",
    apiId: "equipment-catalog",
    businessToolName: "get_equipment_catalog",
    query: "장비 목록 보여줘",
    expectedTemplateId: "equipment.imageCardList",
    expectedTemplateNote: "imageCardList 등록 전이면 text fallback이 정상 경로다.",
  },
  {
    id: "wide_columns",
    label: "컬럼 많은 상태",
    description: "120 extra columns",
    apiRoute: "/api/equipment-status-wide-columns",
    apiId: "equipment-status-wide-columns",
    businessToolName: "get_equipment_status_wide_columns",
    query: "컬럼이 많은 장비 상태 목록 보여줘",
    expectedTemplateId: COMMON_STATUS_TEMPLATE_ID,
  },
  {
    id: "large_rows",
    label: "데이터 많은 상태",
    description: "1000 rows",
    apiRoute: "/api/equipment-status-large-rows",
    apiId: "equipment-status-large-rows",
    businessToolName: "get_equipment_status_large_rows",
    query: "데이터가 많은 장비 상태 목록 보여줘",
    expectedTemplateId: COMMON_STATUS_TEMPLATE_ID,
  },
];

export function dataBoundaryScenarioById(id: DataBoundaryScenarioId) {
  return dataBoundaryScenarios.find((scenario) => scenario.id === id) ?? dataBoundaryScenarios[0];
}

function statusRows(count = 6) {
  const locations = ["A동 1층", "A동 2층", "B동 1층", "B동 3층", "C동 실험실"];
  const equipmentLabels = ["CNC 가공기", "로봇 이송암", "순환 펌프", "비전 검사기"];

  return Array.from({ length: count }, (_, index) => {
    const serial = String(index + 1).padStart(3, "0");
    const label = equipmentLabels[index % equipmentLabels.length];
    return {
      id: `eq-status-${serial}`,
      name: `${label} ${serial}`,
      isOnline: index % 7 !== 0,
      isRunning: index % 4 !== 0,
      hasAlarm: index % 9 === 0,
      needsInspection: index % 11 === 0 || index % 13 === 0,
      isReserved: index % 5 === 0,
      updatedAt: `2026-06-17T09:${String(index % 60).padStart(2, "0")}:00Z`,
      location: locations[index % locations.length],
    };
  });
}

function wideColumnStatusRows(count = 6) {
  const labels = ["압력 센서 매트릭스", "온도 게이트웨이", "전력 계측 랙", "진동 분석 허브", "유량 텔레메트리", "품질 로그 브리지"];

  return Array.from({ length: count }, (_, index) => {
    const serial = String(index + 1).padStart(3, "0");
    return {
      id: `wide-status-${serial}`,
      name: `${labels[index % labels.length]} W${serial}`,
      isOnline: index % 2 === 0,
      isRunning: index % 3 !== 1,
      hasAlarm: index === 2,
      needsInspection: index === 4,
      isReserved: index % 3 === 0,
      updatedAt: `2026-06-17T10:${String(index * 7).padStart(2, "0")}:00Z`,
      location: `계측랩-${index + 1}`,
    };
  });
}

function largeRowStatusRows(count = 1000) {
  const labels = ["대량 검증 셀", "배치 컨베이어", "원격 IO 스테이션", "라인 버퍼 노드", "검사 슬롯", "예비 상태 노드"];

  return Array.from({ length: count }, (_, index) => {
    const serial = String(index + 1).padStart(4, "0");
    return {
      id: `bulk-status-${serial}`,
      name: `${labels[index % labels.length]} ${serial}`,
      isOnline: index % 19 !== 0,
      isRunning: index % 6 !== 0,
      hasAlarm: index % 37 === 0,
      needsInspection: index % 41 === 0 || index % 53 === 0,
      isReserved: index % 8 === 0,
      updatedAt: `2026-06-17T11:${String(index % 60).padStart(2, "0")}:00Z`,
      location: `대량검증-${String((index % 20) + 1).padStart(2, "0")}`,
    };
  });
}

function catalogRows(count = 6) {
  const imagePaths = [
    "/images/a2ui-template-poc/cnc.svg",
    "/images/a2ui-template-poc/robot-arm.svg",
    "/images/a2ui-template-poc/pump.svg",
    "/images/a2ui-template-poc/inspection.svg",
  ];
  const names = ["CNC 가공기", "로봇 이송암", "순환 펌프", "비전 검사기"];
  const categories = ["가공", "이송", "유틸리티", "검사"];

  return Array.from({ length: count }, (_, index) => {
    const serial = String(index + 1).padStart(3, "0");
    return {
      id: `eq-catalog-${serial}`,
      name: `${names[index % names.length]} ${serial}`,
      imageUrl: imagePaths[index % imagePaths.length],
      description: `${categories[index % categories.length]} 라인의 기준 장비입니다.`,
      category: categories[index % categories.length],
      location: index % 2 === 0 ? "A동" : "B동",
    };
  });
}

function equipmentResponse(items: Record<string, unknown>[], pageSize = items.length): EquipmentApiResponse<unknown> {
  return { items, total: items.length, page: 1, pageSize };
}

function scenarioSource(id: DataBoundaryScenarioId): EquipmentApiResponse<unknown> {
  if (id === "catalog") return equipmentResponse(catalogRows());
  if (id === "wide_columns") {
    return equipmentResponse(
      wideColumnStatusRows().map((row, rowIndex) => {
        const wide: Record<string, unknown> = { ...row };
        for (let index = 0; index < 120; index += 1) {
          wide[`telemetry_${String(index).padStart(3, "0")}`] = rowIndex * 1000 + index;
        }
        return wide;
      }),
    );
  }
  if (id === "large_rows") return equipmentResponse(largeRowStatusRows(1000), 1000);
  return equipmentResponse(statusRows());
}

function scenarioReceived(sourceData: EquipmentApiResponse<unknown>) {
  return JSON.parse(JSON.stringify(sourceData)) as EquipmentApiResponse<unknown>;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function dataShape(data: unknown) {
  if (data && typeof data === "object" && !Array.isArray(data) && Array.isArray((data as { items?: unknown }).items)) return "object{items:array<object>}";
  if (Array.isArray(data)) return "array";
  return data && typeof data === "object" ? "object" : typeof data;
}

function fingerprint(data: unknown): DataFingerprint {
  const canonical = stableStringify(data);
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const record = data && typeof data === "object" && !Array.isArray(data) ? (data as EquipmentApiResponse<unknown>) : undefined;
  return {
    dataHash: `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`,
    byteLength: new TextEncoder().encode(canonical).length,
    rowCount: record?.items?.length ?? 0,
    shape: dataShape(data),
    topLevelKeys: record ? Object.keys(record).sort() : undefined,
  };
}

function compareIntegrity(source: DataFingerprint, received: DataFingerprint): DataIntegrityComparison {
  const hashMatched = source.dataHash === received.dataHash;
  const rowCountMatched = source.rowCount === received.rowCount;
  const byteLengthMatched = source.byteLength === received.byteLength;
  return {
    expectedHash: source.dataHash,
    receivedHash: received.dataHash,
    hashMatched,
    expectedRowCount: source.rowCount,
    receivedRowCount: received.rowCount,
    rowCountMatched,
    expectedByteLength: source.byteLength,
    receivedByteLength: received.byteLength,
    byteLengthMatched,
    receivedShape: received.shape,
    receivedTopLevelKeys: received.topLevelKeys,
    matched: hashMatched && rowCountMatched && byteLengthMatched,
  };
}

function boolFromCode(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  if (["Y", "YES", "TRUE", "1", "ON", "RUN", "RUNNING", "ACTIVE", "OK"].includes(normalized)) return true;
  if (["N", "NO", "FALSE", "0", "OFF", "STOP", "STOPPED", "INACTIVE", "NG"].includes(normalized)) return false;
  return undefined;
}

function normalizeData(source: EquipmentApiResponse<unknown>, scenario: DataBoundaryScenario) {
  const sourceFingerprint = fingerprint(source);
  const rules: NormalizationTrace["rules"] = [];
  const shouldNormalizeStatus = scenario.apiId !== "equipment-catalog";
  const items = source.items
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((row, rowIndex) => {
      const next = { ...row };
      const assign = (targetField: string, sourceField: string, transform: string, value: unknown) => {
        next[targetField] = value;
        if (sourceField !== targetField || transform !== "identity") {
          rules.push({
            rowIndex,
            sourceField,
            targetField,
            transform,
            sourceValue: row[sourceField],
            normalizedValue: value,
          });
        }
      };

      if (!shouldNormalizeStatus) return next;

      if (row.eqpId && !row.id) assign("id", "eqpId", "alias", row.eqpId);
      if (row.eqpNm && !row.name) assign("name", "eqpNm", "alias", row.eqpNm);
      if (row.lastDtm && !row.updatedAt) assign("updatedAt", "lastDtm", "alias", row.lastDtm);
      if (row.site && !row.location) assign("location", "site", "alias", row.site);

      const online = boolFromCode(row.opYn ?? row.isOnline);
      const running = boolFromCode(row.runYn ?? row.isRunning);
      const inspection = boolFromCode(row.inspReqYn ?? row.needsInspection);
      if (typeof online === "boolean" && typeof row.isOnline !== "boolean") assign("isOnline", "opYn", "status_code_to_boolean", online);
      if (typeof running === "boolean" && typeof row.isRunning !== "boolean") assign("isRunning", "runYn", "status_code_to_boolean", running);
      if (typeof inspection === "boolean" && typeof row.needsInspection !== "boolean") assign("needsInspection", "inspReqYn", "status_code_to_boolean", inspection);
      if (typeof row.hasAlarm !== "boolean" && row.alrmCnt !== undefined) assign("hasAlarm", "alrmCnt", "count_to_boolean", Number(row.alrmCnt) > 0);
      if (typeof next.isReserved !== "boolean") {
        next.isReserved = false;
        rules.push({
          rowIndex,
          sourceField: "(default)",
          targetField: "isReserved",
          transform: "default_false",
          sourceValue: row.isReserved,
          normalizedValue: false,
        });
      }

      return next;
    });
  const displayData = { ...source, items };
  const displayFingerprint = fingerprint(displayData);
  const aliasApplied = rules.some((rule) => rule.transform === "alias");
  const statusApplied = rules.some((rule) => rule.transform === "status_code_to_boolean" || rule.transform === "count_to_boolean");
  const defaultApplied = rules.some((rule) => rule.transform === "default_false");
  return {
    displayData,
    trace: {
      applied: rules.length > 0,
      strategy: aliasApplied && statusApplied
        ? "equipment_alias_and_status_code_to_canonical"
        : aliasApplied
          ? "equipment_alias_to_canonical"
          : statusApplied
            ? "equipment_status_code_to_canonical"
            : defaultApplied
              ? "equipment_default_status_to_canonical"
              : "identity",
      sourceRowCount: source.items.length,
      displayRowCount: displayData.items.length,
      sourceShape: dataShape(source),
      displayShape: dataShape(displayData),
      sourceDataHash: sourceFingerprint.dataHash,
      displayDataHash: displayFingerprint.dataHash,
      rules,
      beforeRows: source.items.slice(0, 2) as Record<string, unknown>[],
      afterRows: displayData.items.slice(0, 2) as Record<string, unknown>[],
    } satisfies NormalizationTrace,
  };
}

const sensitiveKeyPattern = /(secret|token|password|authorization|cookie|phone|email)/i;

function maskValue(value: unknown, path: string, maskedFields: Set<string>): unknown {
  const key = path.split(".").pop() ?? path;
  if (sensitiveKeyPattern.test(key)) {
    maskedFields.add(path);
    return "[masked]";
  }
  if (Array.isArray(value)) return value.map((item, index) => maskValue(item, `${path}.${index}`, maskedFields));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [childKey, maskValue(childValue, path ? `${path}.${childKey}` : childKey, maskedFields)]));
  }
  return value;
}

function samplePreview(data: EquipmentApiResponse<unknown>, rowLimit = 10, byteLimit = 20000): LabPreview {
  const maskedFields = new Set<string>();
  let rows = data.items.slice(0, rowLimit).map((row, index) => maskValue(row, `items.${index}`, maskedFields));
  let previewData = { ...data, items: rows };
  while (rows.length > 1 && new TextEncoder().encode(JSON.stringify(previewData)).length > byteLimit) {
    rows = rows.slice(0, -1);
    previewData = { ...data, items: rows };
  }
  const byteLength = new TextEncoder().encode(JSON.stringify(previewData)).length;
  return {
    rowCount: data.items.length,
    sampleSize: rows.length,
    truncated: data.items.length > rows.length || byteLength > byteLimit,
    byteLength,
    maskedFields: Array.from(maskedFields).sort(),
    data: previewData,
  };
}

function fieldType(value: unknown): A2UIDerivedFieldType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "array";
  if (value && typeof value === "object") return "object";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return "datetime";
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
    return "string";
  }
  return "unknown";
}

function rolesForKey(key: string, type: A2UIDerivedFieldType): A2UIRole[] {
  const roles: A2UIRole[] = [];
  if (key === "id" || key.endsWith("Id")) roles.push("id");
  if (/name|title|equipmentName|eqpNm/i.test(key)) roles.push("title", "label");
  if (/description|content|summary/i.test(key)) roles.push("content", "description");
  if (/image|photo|thumbnail/i.test(key)) roles.push("image", "uri");
  if (type === "boolean") roles.push("booleanFlag", "status");
  if (/status|state|phase/i.test(key)) roles.push("status");
  if (/category|type/i.test(key)) roles.push("category");
  if (/updatedAt|lastDtm|date|time/i.test(key) || type === "date" || type === "datetime") roles.push("updatedAt", "time");
  if (/location|site|zone/i.test(key)) roles.push("location");
  if (type === "number" && /count|total|rate|score|metric|amount|size|cnt/i.test(key)) roles.push("metric");
  return Array.from(new Set(roles));
}

function derivedSchema(preview: LabPreview, sourceId: string): LabDerivedSchema {
  const rows = preview.data.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).sort();
  const fields = keys.map((key) => {
    const examples = rows.slice(0, 5).map((row) => row[key]).filter((value) => value !== undefined);
    const type = fieldType(examples.find((value) => value !== null));
    return {
      path: `items.${key}`,
      key,
      type,
      roles: rolesForKey(key, type),
      examples,
    };
  });
  return {
    sourceId,
    shape: "array<object>",
    primaryArrayPath: "items",
    rowCount: preview.rowCount,
    sampleSize: preview.sampleSize,
    fields,
    capabilities: {
      hasImages: fields.some((field) => field.roles.includes("image")),
      hasBooleans: fields.some((field) => field.type === "boolean"),
      hasStatus: fields.some((field) => field.roles.includes("status")),
      hasTimeField: fields.some((field) => field.roles.includes("time")),
      hasNumericMetrics: fields.some((field) => field.type === "number"),
      hasCategories: fields.some((field) => field.roles.includes("category")),
      hasNestedObjects: fields.some((field) => field.type === "object" || field.type === "array"),
    },
  };
}

function buildProfile(schema: LabDerivedSchema): A2UIDataProfile {
  return {
    shape: "array<object>",
    rowCount: schema.rowCount,
    listPath: "items",
    fields: schema.fields.map((field) => ({
      path: `items[].${field.key}`,
      key: field.key,
      type: field.roles.includes("image")
        ? "image-url"
        : field.type === "datetime"
          ? "date"
          : field.type === "string" || field.type === "number" || field.type === "boolean" || field.type === "date"
            ? field.type
            : "unknown",
      roleCandidates: field.roles,
      examples: field.examples,
    })),
    booleanFieldCount: schema.fields.filter((field) => field.type === "boolean").length,
    hasImageField: schema.capabilities.hasImages,
    hasContentField: schema.fields.some((field) => field.roles.includes("content")),
    hasDescriptionField: schema.fields.some((field) => field.roles.includes("description")),
  };
}

function firstField(schema: LabDerivedSchema, roles: A2UIRole[]) {
  return schema.fields.find((field) => roles.some((role) => field.roles.includes(role)));
}

function mappingSource(field: LabDerivedField, normalization: NormalizationTrace) {
  return normalization.rules.find((rule) => rule.targetField === field.key)?.sourceField ?? "direct";
}

function mappingComparison(schema: LabDerivedSchema, normalization: NormalizationTrace, template: A2UITemplateRegistration): FieldMappingComparison[] {
  const rows: FieldMappingComparison[] = [];
  const title = firstField(schema, ["title", "label"]);

  if (title) {
    rows.push({
      derivedField: title.path,
      templateSlot: template.surfaceConfig.viewType === "imageCardList" ? "cards[].title" : "items[].title",
      type: title.type,
      role: title.roles.join(", "),
      aliasOrNormalization: mappingSource(title, normalization),
      decision: "selected",
    });
  }

  if (template.surfaceConfig.viewType === "imageCardList") {
    const image = firstField(schema, ["image"]);
    const content = firstField(schema, ["content", "description"]);
    if (image) {
      rows.push({
        derivedField: image.path,
        templateSlot: "cards[].imageUrl",
        type: image.type,
        role: image.roles.join(", "),
        aliasOrNormalization: mappingSource(image, normalization),
        decision: "selected",
      });
    }
    if (content) {
      rows.push({
        derivedField: content.path,
        templateSlot: "cards[].description",
        type: content.type,
        role: content.roles.join(", "),
        aliasOrNormalization: mappingSource(content, normalization),
        decision: "selected",
      });
    }
    return rows;
  }

  rows.push(
    ...schema.fields
      .filter((field) => field.type === "boolean")
      .slice(0, 5)
      .map((field) => ({
        derivedField: field.path,
        templateSlot: "items[].statusFlags",
        type: field.type,
        role: field.roles.join(", "),
        aliasOrNormalization: normalization.rules.find((rule) => rule.targetField === field.key)?.transform ?? "direct",
        decision: "selected",
      })),
  );
  return rows;
}

function templateForScenario(scenario: DataBoundaryScenario) {
  return scenario.apiId === "equipment-catalog" ? catalogTemplate : statusTemplate;
}

function fieldMappingForTemplate(template: A2UITemplateRegistration) {
  if (template.surfaceConfig.viewType === "imageCardList") {
    return {
      title: "items[].name",
      content: "items[].description",
      image: "items[].imageUrl",
    };
  }

  return {
    title: "items[].name",
    booleanFlags: ["items[].isOnline", "items[].isRunning", "items[].hasAlarm", "items[].needsInspection", "items[].isReserved"],
  };
}

function scoreForScenario(template: A2UITemplateRegistration, schema: LabDerivedSchema, integrity: DataIntegrityComparison) {
  if (template.surfaceConfig.viewType === "imageCardList") {
    return integrity.matched && schema.capabilities.hasImages && firstField(schema, ["title", "label"]) ? 0.94 : 0.48;
  }

  const booleanCount = schema.fields.filter((field) => field.type === "boolean").length;
  if (integrity.matched && booleanCount >= 3) return 0.96;
  if (booleanCount >= 3) return 0.88;
  return 0.42;
}

function candidateTrace(template: A2UITemplateRegistration, score: number) {
  return [
    {
      templateId: template.componentId,
      score,
      reason: "Template inputSchema matched derived schema",
      rejected: false,
    },
  ];
}

export function buildDataBoundaryScenarioTrace(id: DataBoundaryScenarioId): DataBoundaryScenarioTrace {
  const scenario = dataBoundaryScenarioById(id);
  const template = templateForScenario(scenario);
  const sourceData = scenarioSource(id);
  const receivedData = scenarioReceived(sourceData);
  const sourceFingerprint = fingerprint(sourceData);
  const receivedFingerprint = fingerprint(receivedData);
  const integrity = compareIntegrity(sourceFingerprint, receivedFingerprint);
  const normalized = normalizeData(receivedData, scenario);
  const preview = samplePreview(normalized.displayData);
  const schema = derivedSchema(preview, scenario.apiId);
  const profile = buildProfile(schema);
  const mappingRows = mappingComparison(schema, normalized.trace, template);
  const score = scoreForScenario(template, schema, integrity);
  const renderPlan: A2UIRenderPlan = {
    selectedComponentId: template.componentId,
    viewType: template.surfaceConfig.viewType,
    score,
    reason: integrity.matched
      ? "Template inputSchema matched received derived schema"
      : "Template matched display data, but raw source/received integrity check failed",
    fieldMapping: fieldMappingForTemplate(template),
    isFallback: false,
    registryVersion: 2,
    maxItems: template.surfaceConfig.maxItems,
    strategy: "derived_schema",
    candidates: candidateTrace(template, score),
    mapping: {
      templateId: template.componentId,
      confidence: score,
      reason: "deterministic role/type mapping completed",
      mappings: mappingRows.map((row) => ({
        slot: row.templateSlot,
        sourcePath: row.derivedField.replace("items.", "items[]."),
        transform: "none",
      })),
      missingSlots: [],
    },
  };
  const surfaceEnvelope: A2UISurfaceEnvelope = {
    templateId: template.componentId,
    version: "1.0.0",
    payload: {
      apiTitle: scenario.label,
      apiId: scenario.apiId,
      data: normalized.displayData,
      profile,
      renderPlan,
    },
    surfaceConfig: template.surfaceConfig,
    sourceIntent: scenario.apiId === "equipment-catalog" ? "equipment.catalog.lookup" : "equipment.status.lookup",
    updatedAt: "2026-06-17T00:00:00.000Z",
    meta: {
      registryVersion: 2,
      decisionReason: renderPlan.reason,
      trace: ["source:fingerprint", "normalization:display-data", "matcher:derived_schema", `matcher:score:${score}`, "binding:renderer-payload"],
      strategy: "derived_schema",
      score,
      candidates: renderPlan.candidates,
      mapping: renderPlan.mapping,
    },
  };

  return {
    id,
    title: scenario.label,
    apiLabel: scenario.businessToolName,
    apiId: scenario.apiId,
    apiRoute: scenario.apiRoute,
    businessToolName: scenario.businessToolName,
    expectedTemplateId: scenario.expectedTemplateId,
    expectedTemplateNote: scenario.expectedTemplateNote,
    query: scenario.query,
    sourceData,
    receivedData,
    displayData: normalized.displayData,
    sourceFingerprint,
    receivedFingerprint,
    integrity,
    normalization: normalized.trace,
    sampleDataPreview: preview,
    derivedSchema: schema,
    templateContract: template,
    mappingComparison: mappingRows,
    renderPlan,
    surfaceEnvelope,
    a2uiRenderPayload: {
      kind: "a2ui.render.request",
      query: scenario.query,
      facts: {
        data: sourceData,
        displayData: normalized.displayData,
        sourceDataHash: sourceFingerprint.dataHash,
        sourceDataByteLength: sourceFingerprint.byteLength,
        sourceRowCount: sourceFingerprint.rowCount,
        sourceDataShape: sourceFingerprint.shape,
        sourceTopLevelKeys: sourceFingerprint.topLevelKeys,
      },
      sampleDataPreview: preview,
      derivedSchema: schema,
      toolMetadata: {
        sourceToolName: scenario.businessToolName,
        sourceToolResultId: `demo-tool-result-${scenario.id}`,
        sourceApiId: scenario.apiId,
        sourceApiRoute: scenario.apiRoute,
        renderToolName: "a2ui_render",
        renderToolCallPolicy: "deterministic_after_business_tool_result",
        normalizationTrace: normalized.trace,
      },
    },
  };
}

function eventData(trace: DataBoundaryScenarioTrace, step: string): Record<string, unknown> {
  if (step === "business_tool_result") {
    return {
      label: trace.apiLabel,
      apiId: trace.apiId,
      apiRoute: trace.apiRoute,
      sourceToolName: trace.businessToolName,
      sourceToolResultId: `demo-tool-result-${trace.id}`,
      sourceDataHash: trace.sourceFingerprint.dataHash,
      sourceRowCount: trace.sourceFingerprint.rowCount,
      sourceDataShape: trace.sourceFingerprint.shape,
      rawToolResult: trace.sourceData,
    };
  }
  if (step === "profile") {
    return {
      rowCount: trace.derivedSchema.rowCount,
      previewRowCount: trace.sampleDataPreview.rowCount,
      previewSampleSize: trace.sampleDataPreview.sampleSize,
      booleanFieldCount: trace.derivedSchema.fields.filter((field) => field.type === "boolean").length,
      normalizationTrace: trace.normalization,
      derivedSchema: trace.derivedSchema,
    };
  }
  if (step === "matcher") {
    return {
      mode: "render_surface",
      templateId: trace.templateContract.componentId,
      expectedTemplateId: trace.expectedTemplateId,
      expectedTemplateNote: trace.expectedTemplateNote,
      strategy: trace.renderPlan.strategy,
      score: trace.renderPlan.score,
      candidates: trace.renderPlan.candidates,
      candidateCount: trace.renderPlan.candidates?.length,
      mapping: trace.renderPlan.mapping,
      fieldMappingComparison: trace.mappingComparison,
    };
  }
  if (step === "a2ui_tool_result") {
    return {
      mode: "render_surface",
      templateId: trace.templateContract.componentId,
      strategy: trace.renderPlan.strategy,
      score: trace.renderPlan.score,
      dataIntegrity: trace.integrity,
    };
  }
  return {};
}

export function dataBoundaryFlowEvents(trace: DataBoundaryScenarioTrace): AgentFlowEvent[] {
  const turnId = `lab-${trace.id}`;
  const at = "2026-06-17T00:00:00.000Z";
  const base = {
    turnId,
    at,
    severity: "success" as const,
    physicalEmitter: "main-agent" as const,
  };
  return [
    { ...base, id: `${turnId}-request`, event: "request_start", phase: "request", from: "chat", to: "next", label: "POST /api/chat", detail: trace.query },
    { ...base, id: `${turnId}-bridge`, event: "response_open", phase: "bridge", from: "next", to: "main_agent", label: "Open /chat/stream", detail: "registry=v2" },
    { ...base, id: `${turnId}-planning`, event: "state:planning", phase: "planning", from: "main_agent", to: "main_agent", label: "Plan chat turn", detail: "장비 요청 해석" },
    { ...base, id: `${turnId}-intent`, event: "state:intent", phase: "intent", from: "main_agent", to: "llm", label: "Classify as data task", detail: `apiId=${trace.apiId}`, branch: "data" },
    { ...base, id: `${turnId}-tool-selected`, event: "state:business_tool_selected", phase: "intent", from: "main_agent", to: "main_agent", label: "Choose business API tool", detail: trace.businessToolName, branch: "data" },
    { ...base, id: `${turnId}-tool-call`, event: "state:business_tool_call", phase: "data_loaded", from: "main_agent", to: "business_db", label: "Call business API tool", detail: `${trace.businessToolName} -> ${trace.apiRoute}`, branch: "data" },
    { ...base, id: `${turnId}-tool-result`, event: "state:business_tool_result", phase: "data_loaded", from: "business_db", to: "main_agent", label: "Business tool result", detail: `rows=${trace.sourceFingerprint.rowCount} | hash=${trace.sourceFingerprint.dataHash}`, branch: "data", data: eventData(trace, "business_tool_result") },
    { ...base, id: `${turnId}-a2ui-selected`, event: "state:a2ui_tool_selected", phase: "registry_loaded", from: "main_agent", to: "main_agent", label: "Choose a2ui_render tool", detail: "policy=deterministic_after_business_tool_result", branch: "data" },
    { ...base, id: `${turnId}-a2ui-call`, event: "state:a2ui_tool_call", phase: "registry_loaded", from: "main_agent", to: "a2ui_render_tool", label: "Run a2ui_render tool", detail: "raw data + displayData payload", branch: "data", data: { a2uiRenderPayload: trace.a2uiRenderPayload } },
    { ...base, id: `${turnId}-profile`, event: "state:profile", phase: "profile", from: "a2ui_render_tool", to: "a2ui", label: "Build profile and derived schema", detail: `preview=${trace.sampleDataPreview.sampleSize}/${trace.sampleDataPreview.rowCount}`, branch: "data", data: eventData(trace, "profile") },
    { ...base, id: `${turnId}-registry`, event: "state:a2a", phase: "registry_loaded", from: "a2ui", to: "registry", label: "Load template contracts", detail: trace.expectedTemplateId, branch: "data" },
    { ...base, id: `${turnId}-registry-loaded`, event: "state:registry_loaded", phase: "registry_loaded", from: "registry", to: "a2ui", label: "Template contracts loaded", detail: "templates=2", branch: "data" },
    { ...base, id: `${turnId}-matcher`, event: "state:matcher", phase: "matcher", from: "a2ui", to: "a2ui", label: "Match template and fields", detail: `template=${trace.templateContract.componentId} | score=${trace.renderPlan.score}`, branch: "data", data: eventData(trace, "matcher") },
    { ...base, id: `${turnId}-result`, event: "state:a2ui_tool_result", phase: "matcher", from: "a2ui", to: "main_agent", label: "a2ui_render result", detail: `integrity=${trace.integrity.matched}`, branch: "data", data: eventData(trace, "a2ui_tool_result") },
    { ...base, id: `${turnId}-text`, event: "text", phase: "surface", from: "main_agent", to: "chat", label: "Return text summary", detail: "등록된 A2UI 템플릿으로 정리했습니다.", branch: "matched" },
    { ...base, id: `${turnId}-surface`, event: "surface", phase: "surface", from: "main_agent", to: "chat", label: "Return SurfaceEnvelope", detail: trace.templateContract.componentId, branch: "matched", data: { surface: trace.surfaceEnvelope } },
  ];
}

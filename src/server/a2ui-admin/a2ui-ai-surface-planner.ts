import { createHash } from "node:crypto";
import { buildA2UIDataProfile } from "@/features/a2ui-template-poc/schema-profiler";
import type {
  A2UICandidateTrace,
  A2UIDataProfile,
  A2UIDerivedFieldType,
  A2UIMappingDecision,
  A2UIRenderPlan,
  A2UIRole,
  A2UITemplateRegistration,
  EquipmentApiResponse,
  FieldMapping,
} from "@/features/a2ui-template-poc/template-types";
import type { EquipmentApiId } from "./a2ui-runtime";
import { readTemplateCatalog } from "./catalog-store";
import { buildDerivedSchema } from "./schema-matcher/derived-schema-builder";
import type { DerivedSchema } from "./schema-matcher/derived-schema-types";
import { buildSampleDataPreview } from "./schema-matcher/sample-data-preview";
import { normalizeTemplateInputSchema } from "./schema-matcher/template-input-schema-adapter";

type DataRecord = Record<string, unknown>;
type PlannerTransform = "copy" | "boolean_code" | "number_to_boolean" | "default_false";

type PlannerFieldMapping = {
  targetField: string;
  sourcePath?: string;
  transform: PlannerTransform;
  trueValues?: unknown[];
  falseValues?: unknown[];
  defaultValue?: unknown;
  reason?: string;
};

type PlannerSlotMapping = {
  templateId?: string;
  slot: string;
  sourcePath?: string;
  targetField?: string;
  transform?: PlannerTransform;
  reason?: string;
};

type PlannerCandidateEvaluation = {
  templateId: string;
  decision: "select" | "reject";
  score: number;
  schemaFit?: number;
  queryFit?: number;
  semanticFit?: number;
  renderFit?: number;
  reason: string;
  missingRequiredSlots?: string[];
  risks?: string[];
};

type TemplateCandidateNote = {
  templateId?: string;
  decision?: "select" | "reject" | string;
  reason?: string;
  score?: unknown;
  confidence?: unknown;
  schemaFit?: unknown;
  queryFit?: unknown;
  semanticFit?: unknown;
  renderFit?: unknown;
  missingRequiredSlots?: unknown;
  risks?: unknown;
};

type ComparisonFieldRole =
  | "identifier"
  | "title"
  | "status"
  | "metric"
  | "timestamp"
  | "location"
  | "image"
  | "description"
  | "category"
  | "unknown";

type ComparisonFieldProfile = {
  sourcePath?: string;
  sourceKey?: string;
  label?: string;
  type?: A2UIDerivedFieldType | string;
  role?: ComparisonFieldRole | string;
  targetHint?: string;
  confidence?: unknown;
  reason?: string;
  exampleValues?: unknown[];
};

type ComparisonDataResult = {
  primaryArrayPath?: string;
  entityName?: string;
  rowMeaning?: string;
  reason?: string;
  fieldProfiles?: ComparisonFieldProfile[];
  titleCandidates?: string[];
  statusCandidates?: string[];
  metricCandidates?: string[];
  timestampCandidates?: string[];
  warnings?: string[];
};

type TemplateSelectionResult = {
  selectedTemplateId?: string;
  reason?: string;
  confidence?: unknown;
  candidateNotes?: TemplateCandidateNote[];
};

type SlotMappingResult = {
  fieldMappings?: PlannerFieldMapping[];
  slotMappings?: PlannerSlotMapping[];
  reason?: string;
};

type AIPlannerPlan = {
  selectedTemplateId?: string;
  confidence?: number;
  reason?: string;
  primaryArrayPath?: string;
  fieldMappings?: PlannerFieldMapping[];
  slotMappings?: PlannerSlotMapping[];
  candidateEvaluations?: PlannerCandidateEvaluation[];
};

type RowExtraction = {
  rows: DataRecord[];
  rowCount: number;
  arrayPath?: string;
  page?: number;
  pageSize?: number;
};

type ValidationResult = {
  ok: boolean;
  errors: string[];
};

type PlannerResponseFormat = "json_schema" | "json_object" | "none";
type PlannerStage = "comparison_data" | "template_selection" | "slot_mapping";

type PlannerAttemptConfig = {
  maxTokens: number;
  responseFormat: PlannerResponseFormat;
};

type PlannerAttemptTrace = {
  stage: PlannerStage;
  requestKind: "initial" | "correction";
  attempt: number;
  responseFormat: PlannerResponseFormat;
  maxTokens: number;
  durationMs: number;
  outcome: "success" | "http_error" | "envelope_parse_error" | "missing_content" | "content_parse_error" | "request_error";
  status?: number;
  finishReason?: string;
  rawResponseLength?: number;
  rawResponsePreview?: string;
  contentLength?: number;
  contentPreview?: string;
  error?: string;
};

type PlannerJsonRequestResult<T> = {
  result?: T;
  model?: string;
  error?: string;
  internalError?: string;
  attempts?: PlannerAttemptTrace[];
};

export type A2UISurfacePlanTrace = {
  promptVersion: typeof promptVersion;
  model?: string;
  confidence?: number;
  reason?: string;
  primaryArrayPath?: string;
  selectedTemplateId?: string;
  comparisonData?: ComparisonDataResult;
  templateSelection?: TemplateSelectionResult;
  slotMapping?: SlotMappingResult;
  fieldMappings: PlannerFieldMapping[];
  slotMappings: PlannerSlotMapping[];
  candidateEvaluations: PlannerCandidateEvaluation[];
  validation: ValidationResult;
  sourceShape: string;
  sourceArrayPath?: string;
  sourceFieldPaths: string[];
  sourceSampleRows: DataRecord[];
  sourceRowCount: number;
  renderRowCount?: number;
  sourceDataHash: string;
  renderDataHash?: string;
  renderDataByteLength?: number;
  plannerAttempts?: PlannerAttemptTrace[];
  beforeRows: DataRecord[];
  afterRows?: DataRecord[];
};

export type A2UISurfacePlanResult =
  | {
      mode: "render_surface";
      apiId: EquipmentApiId;
      apiTitle: string;
      registryVersion: number;
      template: A2UITemplateRegistration;
      templateId: string;
      data: EquipmentApiResponse<unknown>;
      profile: A2UIDataProfile;
      derivedSchema: DerivedSchema;
      renderPlan: A2UIRenderPlan;
      reason: string;
      score: number;
      strategy: "ai_surface_planner";
      mapping: A2UIMappingDecision;
      candidates: A2UICandidateTrace[];
      trace: A2UISurfacePlanTrace;
    }
  | {
      mode: "text_fallback";
      apiId: EquipmentApiId;
      apiTitle: string;
      registryVersion: number;
      renderPlan: A2UIRenderPlan;
      reason: string;
      score?: number;
      strategy: "ai_surface_planner";
      candidates?: A2UICandidateTrace[];
      trace?: A2UISurfacePlanTrace;
      error?: string;
    };

export type A2UISurfacePlanProgress = {
  status: "profile" | "a2a" | "registry_loaded" | "matcher" | "plan_validation" | "mapping_applied";
  label: string;
  detail?: string;
  data?: Record<string, unknown>;
};

export type A2UISurfacePlanProgressHandler = (progress: A2UISurfacePlanProgress) => void | Promise<void>;

const promptVersion = "2026-06-22.a2ui-comparison-data-surface-plan.v2" as const;
const allowedTransforms: PlannerTransform[] = ["copy", "boolean_code", "number_to_boolean", "default_false"];
const maxPromptFieldPaths = 40;
const maxPromptSampleRows = 3;
const maxRenderRows = 10;
const maxPromptJsonLength = 60000;
const defaultPlannerAttempts: PlannerAttemptConfig[] = [
  { maxTokens: 6000, responseFormat: "json_schema" },
  { maxTokens: 6000, responseFormat: "json_schema" },
];
const aiComparisonDataIncompleteReason = "AI가 비교용 데이터 생성 결과를 끝까지 완성하지 못했습니다.";
const aiTemplateSelectionIncompleteReason = "AI가 템플릿 판단 결과를 끝까지 완성하지 못해 선택을 확정하지 못했습니다.";
const aiSlotMappingIncompleteReason = "AI가 선택된 템플릿의 슬롯 생성 결과를 끝까지 완성하지 못했습니다.";
const plannerAttemptPreviewLength = 1600;
const titleSourceKeys = ["name", "equipmentName", "equipment_name", "eqpNm", "eqp_nm", "assetDisplayName", "assetName", "asset_nm", "asset_name", "title"];
const idSourceKeys = ["id", "eqpId", "eqp_id", "equipmentId", "equipment_id", "assetId", "asset_id"];
const onlineSourceKeys = ["isOnline", "opYn", "op_yn", "operationYn", "operation_yn", "operStateCd", "oper_state_cd", "onlineYn", "online_yn"];
const runningSourceKeys = ["isRunning", "runYn", "run_yn", "runningYn", "running_yn", "running_code", "runStateYn", "run_state_yn", "runStateCd", "run_state_cd"];
const alarmSourceKeys = ["hasAlarm", "alrmCnt", "alrm_count", "alarmCnt", "alarm_count", "alarmTotalCnt", "alarm_total_cnt", "alarmYn", "alarm_yn"];
const inspectionSourceKeys = ["needsInspection", "inspReqYn", "insp_req_yn", "inspectionRequired", "inspection_required", "inspectionYn", "inspection_yn", "inspectDueYn", "inspect_due_yn"];
const reservedSourceKeys = ["isReserved", "reservedFlag", "reserved_flag", "reserveFlag", "reserve_flag", "reservedYn", "reserved_yn", "reserveYn", "reserve_yn"];
const updatedAtSourceKeys = ["updatedAt", "updated_at", "lastDtm", "last_dtm", "lastSignalAt", "last_signal_at", "timestamp", "time"];
const locationSourceKeys = ["location", "site", "site_nm", "plantZone", "plant_zone", "zone"];
const statusTargetFields = ["isOnline", "isRunning", "hasAlarm", "needsInspection", "isReserved"];
const metricLikePattern = /^(telemetry_|metric_)|sensor|measure|measurement|reading|temperature|temp|pressure|rpm|speed|vibration|current|voltage|power|load|rate|score|value/i;
const nonMetricLikePattern = /alarm|alrm|count|cnt|total|status|state|flag|yn$|code$|id$|name|title/i;
const canonicalTargetFields = new Set([
  "id",
  "name",
  "isOnline",
  "isRunning",
  "hasAlarm",
  "needsInspection",
  "isReserved",
  "updatedAt",
  "location",
  "imageUrl",
  "description",
  "category",
]);
const defaultTrueValues = ["Y", "YES", "TRUE", "1", "ON", "ONLINE", "RUN", "RUNNING", "ACTIVE", "OK"];
const defaultFalseValues = ["N", "NO", "FALSE", "0", "OFF", "OFFLINE", "STOP", "STOPPED", "INACTIVE", "NG"];

function positiveIntegerFromEnv(name: string) {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function plannerResponseFormatFromEnv(value: string | undefined): PlannerResponseFormat | undefined {
  if (value === "json_schema" || value === "json_object" || value === "none") return value;
  return undefined;
}

function plannerAttemptsForRequest(): PlannerAttemptConfig[] {
  const fixedMaxTokens = positiveIntegerFromEnv("A2UI_AI_SURFACE_PLANNER_MAX_TOKENS");
  const requestedAttemptCount = positiveIntegerFromEnv("A2UI_AI_SURFACE_PLANNER_ATTEMPTS");
  const responseFormat = plannerResponseFormatFromEnv(process.env.A2UI_AI_SURFACE_PLANNER_RESPONSE_FORMAT) ?? "json_schema";

  if (fixedMaxTokens) {
    const attemptCount = Math.min(requestedAttemptCount ?? 1, 8);
    return Array.from({ length: attemptCount }, () => ({ maxTokens: fixedMaxTokens, responseFormat }));
  }

  if (requestedAttemptCount) return defaultPlannerAttempts.slice(0, Math.min(requestedAttemptCount, defaultPlannerAttempts.length));
  return defaultPlannerAttempts;
}

function previewText(value: string, limit = plannerAttemptPreviewLength) {
  return value.length > limit ? `${value.slice(0, limit)}...<truncated>` : value;
}

function comparisonDataResponseFormatFor({ sourcePaths }: { sourcePaths: string[] }) {
  return {
    type: "json_schema",
    json_schema: {
      name: "a2ui_comparison_data",
      strict: false,
      schema: {
        type: "object",
        additionalProperties: true,
        required: ["rowMeaning", "reason", "fieldProfiles"],
        properties: {
          primaryArrayPath: { type: "string" },
          entityName: { type: "string" },
          rowMeaning: { type: "string" },
          reason: { type: "string" },
          fieldProfiles: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              required: ["sourcePath", "role", "targetHint", "reason"],
              properties: {
                sourcePath: { type: "string", enum: sourcePaths },
                sourceKey: { type: "string" },
                label: { type: "string" },
                type: { type: "string", enum: ["string", "number", "boolean", "array", "object", "null", "unknown"] },
                role: {
                  type: "string",
                  enum: ["identifier", "title", "status", "metric", "timestamp", "location", "image", "description", "category", "unknown"],
                },
                targetHint: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string" },
                exampleValues: { type: "array" },
              },
            },
          },
          titleCandidates: { type: "array", items: { type: "string", enum: sourcePaths } },
          statusCandidates: { type: "array", items: { type: "string", enum: sourcePaths } },
          metricCandidates: { type: "array", items: { type: "string", enum: sourcePaths } },
          timestampCandidates: { type: "array", items: { type: "string", enum: sourcePaths } },
          warnings: { type: "array", items: { type: "string" } },
        },
      },
    },
  } as const;
}

function templateSelectionResponseFormatFor({ templateIds }: { templateIds: string[] }) {
  return {
    type: "json_schema",
    json_schema: {
      name: "a2ui_template_selection",
      strict: false,
      schema: {
        type: "object",
        additionalProperties: true,
        required: ["selectedTemplateId", "reason"],
        properties: {
          selectedTemplateId: { type: "string", enum: templateIds },
          reason: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          candidateNotes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              properties: {
                templateId: { type: "string", enum: templateIds },
                decision: { type: "string", enum: ["select", "reject"] },
                reason: { type: "string" },
                score: { type: "number", minimum: 0, maximum: 1 },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                schemaFit: { type: "number", minimum: 0, maximum: 1 },
                queryFit: { type: "number", minimum: 0, maximum: 1 },
                semanticFit: { type: "number", minimum: 0, maximum: 1 },
                renderFit: { type: "number", minimum: 0, maximum: 1 },
                missingRequiredSlots: { type: "array", items: { type: "string" } },
                risks: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
  } as const;
}

function slotMappingResponseFormatFor({
  templateId,
  sourcePaths,
  targetFields,
  slots,
}: {
  templateId: string;
  sourcePaths: string[];
  targetFields: string[];
  slots: string[];
}) {
  return {
    type: "json_schema",
    json_schema: {
      name: "a2ui_slot_mapping",
      strict: false,
      schema: {
        type: "object",
        additionalProperties: true,
        required: ["fieldMappings", "slotMappings"],
        properties: {
          reason: { type: "string" },
          fieldMappings: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              required: ["targetField", "sourcePath", "transform", "reason"],
              properties: {
                targetField: { type: "string", enum: targetFields },
                sourcePath: { type: "string", enum: sourcePaths },
                transform: { type: "string", enum: allowedTransforms },
                trueValues: { type: "array", items: { type: ["string", "number", "boolean"] } },
                falseValues: { type: "array", items: { type: ["string", "number", "boolean"] } },
                defaultValue: { type: ["string", "number", "boolean", "null"] },
                reason: { type: "string" },
              },
            },
          },
          slotMappings: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              required: ["slot", "sourcePath", "targetField", "transform", "reason"],
              properties: {
                templateId: { type: "string", enum: [templateId] },
                slot: { type: "string", enum: slots },
                sourcePath: { type: "string", enum: sourcePaths },
                targetField: { type: "string", enum: targetFields },
                transform: { type: "string", enum: allowedTransforms },
                reason: { type: "string" },
              },
            },
          },
        },
      },
    },
  } as const;
}

function asRecord(value: unknown): DataRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DataRecord) : undefined;
}

function objectRows(value: unknown): DataRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is DataRecord => Boolean(asRecord(item)));
}

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;

  const record = value as DataRecord;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function dataHash(value: unknown) {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function byteLength(value: unknown) {
  return new TextEncoder().encode(stableStringify(value)).length;
}

function dataShape(value: unknown): string {
  if (Array.isArray(value)) return value.every((item) => asRecord(item)) ? "array<object>" : "array";
  const record = asRecord(value);
  if (!record) return typeof value;
  if (Array.isArray(record.items)) return "object{items:array<object>}";
  if (Array.isArray(record.rows)) return "object{rows:array<object>}";
  for (const parentKey of ["result", "data", "payload"]) {
    const parent = asRecord(record[parentKey]);
    if (!parent) continue;
    for (const childKey of ["items", "rows", "list"]) {
      if (Array.isArray(parent[childKey])) return `object{${parentKey}.${childKey}:array<object>}`;
    }
  }
  return "object";
}

function firstArrayCandidate(record: DataRecord): RowExtraction | undefined {
  const candidates: Array<{ path: string; parent: DataRecord; key: string }> = [
    { path: "items", parent: record, key: "items" },
    { path: "rows", parent: record, key: "rows" },
  ];

  for (const parentKey of ["result", "data", "payload"]) {
    const parent = asRecord(record[parentKey]);
    if (!parent) continue;
    for (const key of ["items", "rows", "list"]) {
      candidates.push({ path: `${parentKey}.${key}`, parent, key });
    }
  }

  for (const candidate of candidates) {
    const rows = objectRows(candidate.parent[candidate.key]);
    if (!rows) continue;
    return {
      rows,
      rowCount:
        numberFrom(candidate.parent.total) ??
        numberFrom(candidate.parent.totalCount) ??
        numberFrom(record.total) ??
        numberFrom(record.totalCount) ??
        rows.length,
      arrayPath: candidate.path,
      page: numberFrom(candidate.parent.page) ?? numberFrom(candidate.parent.pageNo) ?? numberFrom(record.page) ?? numberFrom(record.pageNo),
      pageSize:
        numberFrom(candidate.parent.pageSize) ??
        numberFrom(candidate.parent.rowsPerPage) ??
        numberFrom(record.pageSize) ??
        numberFrom(record.rowsPerPage),
    };
  }

  return undefined;
}

function extractRows(data: unknown): RowExtraction | undefined {
  const rows = objectRows(data);
  if (rows) return { rows, rowCount: rows.length };

  const record = asRecord(data);
  if (!record) return undefined;

  const extracted = firstArrayCandidate(record);
  if (extracted) return extracted;

  return {
    rows: [record],
    rowCount: 1,
  };
}

function fieldPaths(rows: DataRecord[], arrayPath = "items") {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).sort();
  return keys.map((key) => `${arrayPath}[].${key}`);
}

function promptFieldPaths(paths: string[], rows: DataRecord[]) {
  const firstRow = rows[0] ?? {};
  return paths
    .map((path, index) => {
      const key = sourceKey(path) ?? "";
      const sourceValue = firstRow[key];
      const isIdentityOrStatus =
        keyMatchesAny(key, [
          ...idSourceKeys,
          ...titleSourceKeys,
          ...onlineSourceKeys,
          ...runningSourceKeys,
          ...alarmSourceKeys,
          ...inspectionSourceKeys,
          ...reservedSourceKeys,
        ]);
      const rank = isIdentityOrStatus
        ? 0
        : fieldType(sourceValue) === "number" && isMetricLikeKey(key)
          ? 1
          : keyMatchesAny(key, [...updatedAtSourceKeys, ...locationSourceKeys])
            ? 2
            : rolesForKey(key, fieldType(sourceValue)).length > 0
              ? 3
              : 4;
      return { path, index, rank };
    })
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, maxPromptFieldPaths)
    .map((item) => item.path);
}

function sourceKey(sourcePath?: string) {
  if (!sourcePath) return undefined;
  return sourcePath.replace(/\[\]/g, "").split(".").pop();
}

function keyMatchesAny(key: string, candidates: string[]) {
  return candidates.some((candidate) => key.toLowerCase() === candidate.toLowerCase());
}

function isMetricLikeKey(key: string) {
  if (/^(telemetry_|metric_)/i.test(key)) return true;
  return metricLikePattern.test(key) && !nonMetricLikePattern.test(key);
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
  if (keyMatchesAny(key, idSourceKeys) || /^id$|Id$|_id$|assetId|eqp_id/i.test(key)) roles.push("id");
  if (keyMatchesAny(key, titleSourceKeys) || /name|title|equipmentName|eqpNm|eqp_nm|assetDisplayName|assetName/i.test(key)) roles.push("title", "label");
  if (/description|content|summary/i.test(key)) roles.push("content", "description");
  if (/image|photo|thumbnail/i.test(key)) roles.push("image", "uri");
  if (type === "boolean") roles.push("booleanFlag", "status");
  if (/status|state|phase|yn$|flag$|code$|oper|running|inspection|reserve/i.test(key)) roles.push("status");
  if (/category|type/i.test(key)) roles.push("category");
  if (/location|zone|site|plant/i.test(key)) roles.push("location");
  if (/updatedAt|last|dtm|date|time|signal/i.test(key) || type === "date" || type === "datetime") roles.push("updatedAt", "time");
  if (type === "number" && (isMetricLikeKey(key) || /amount|size/i.test(key))) roles.push("metric");
  return Array.from(new Set(roles));
}

function sourceFieldSummaries(rows: DataRecord[], paths: string[]) {
  return paths.map((path) => {
    const key = sourceKey(path) ?? path;
    const examples = rows.slice(0, 5).map((row) => row[key]).filter((value) => value !== undefined);
    const type = fieldType(examples.find((value) => value !== null));
    return {
      path,
      key,
      type,
      roles: rolesForKey(key, type),
      examples,
    };
  });
}

function orderedUnique(values: Array<string | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function comparisonDataSourcePaths(comparisonData: ComparisonDataResult | undefined) {
  if (!comparisonData) return [];
  return orderedUnique([
    ...(comparisonData.titleCandidates ?? []),
    ...(comparisonData.statusCandidates ?? []),
    ...(comparisonData.metricCandidates ?? []),
    ...(comparisonData.timestampCandidates ?? []),
    ...(comparisonData.fieldProfiles ?? []).map((field) => field.sourcePath),
  ]);
}

function promptPathsForComparison(paths: string[], rows: DataRecord[], comparisonData?: ComparisonDataResult) {
  const validPaths = new Set(paths);
  const aiPaths = comparisonDataSourcePaths(comparisonData).filter((path) => validPaths.has(path));
  return orderedUnique([...aiPaths, ...promptFieldPaths(paths, rows)]).slice(0, maxPromptFieldPaths);
}

function projectRowsForPrompt(rows: DataRecord[], paths: string[], limit: number) {
  const keys = Array.from(new Set(paths.map((path) => sourceKey(path)).filter((key): key is string => Boolean(key))));
  return rows.slice(0, limit).map((row) => {
    const projected: DataRecord = {};
    for (const key of keys) {
      if (row[key] !== undefined) projected[key] = row[key];
    }
    return projected;
  });
}

function compactJson(value: unknown, limit = maxPromptJsonLength) {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= limit) return text;
  console.warn("[a2ui] AI surface planner prompt exceeded compact target; sending full valid JSON", {
    length: text.length,
    targetLength: limit,
  });
  return text;
}

function stripCodeFence(text: string) {
  return text.trim().replace(/^```(?:json|JSON)?\s*/, "").replace(/\s*```$/, "").trim();
}

function extractJsonObjectText(text: string) {
  const start = text.indexOf("{");
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return undefined;
}

function parsePlannerContent<T>(content: string): T {
  const stripped = stripCodeFence(content);
  try {
    return JSON.parse(stripped) as T;
  } catch (error) {
    const extracted = extractJsonObjectText(stripped);
    if (!extracted) throw error;
    return JSON.parse(extracted) as T;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function openAIConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  };
}

function apiTitle(apiId: EquipmentApiId) {
  if (apiId === "equipment-catalog") return "장비 카탈로그 API";
  if (apiId === "equipment-status-wide-columns") return "컬럼 많은 장비 상태 API";
  if (apiId === "equipment-status-large-rows") return "데이터 많은 장비 상태 API";
  return "장비 상태 API";
}

async function emitProgress(onProgress: A2UISurfacePlanProgressHandler | undefined, progress: A2UISurfacePlanProgress) {
  if (onProgress) await onProgress(progress);
}

function templatePromptSummary(template: A2UITemplateRegistration) {
  const normalized = normalizeTemplateInputSchema(template);
  return {
    templateId: normalized.componentId,
    title: normalized.title,
    description: normalized.description,
    viewType: normalized.surfaceConfig.viewType,
    status: normalized.status,
    selectionGuide: normalized.selectionGuide,
    inputSchema: normalized.inputSchema,
    surfaceConfig: {
      titleBinding: normalized.surfaceConfig.titleBinding,
      statusBindings: normalized.surfaceConfig.statusBindings,
      metricBindings: normalized.surfaceConfig.metricBindings,
      imageBinding: normalized.surfaceConfig.imageBinding,
      contentBinding: normalized.surfaceConfig.contentBinding,
      maxItems: normalized.surfaceConfig.maxItems,
    },
  };
}

function buildPrompt({
  query,
  apiId,
  rawData,
  extracted,
  templates,
  comparisonData,
}: {
  query: string;
  apiId: EquipmentApiId;
  rawData: unknown;
  extracted: RowExtraction;
  templates: A2UITemplateRegistration[];
  comparisonData?: ComparisonDataResult;
}) {
  const paths = fieldPaths(extracted.rows, extracted.arrayPath ?? "items");
  const promptPaths = promptPathsForComparison(paths, extracted.rows, comparisonData);
  const metricTargetFields = promptPaths
    .map((path) => sourceKey(path))
    .filter((key): key is string => Boolean(key && /^(telemetry_|metric_)/i.test(key)));
  const targetFields = [...canonicalTargetFields, ...metricTargetFields];
  const registeredTemplates = templates.filter((template) => template.status === "registered").map(normalizeTemplateInputSchema);
  const templateIds = registeredTemplates.map((template) => template.componentId);
  const allowedSlots = Array.from(new Set(registeredTemplates.flatMap((template) => [
    ...(template.inputSchema?.requiredSlots ?? []).map((slot) => slot.slot),
    ...(template.inputSchema?.optionalSlots ?? []).map((slot) => slot.slot),
  ]))).sort();
  return {
    promptVersion,
    task: "Map raw API fields to A2UI render fields and choose the best registered A2UI template.",
    outputContract:
      "Return exactly the top-level JSON object described by outputJsonShape. Do not return a nested mappings object. Do not include markdown.",
    userQuery: query,
    apiId,
    allowedTemplateIds: templateIds,
    source: {
      shape: dataShape(rawData),
      detectedPrimaryArrayPath: extracted.arrayPath ?? "items",
      rowCount: extracted.rowCount,
      fieldPathCount: paths.length,
      omittedFieldPathCount: Math.max(0, paths.length - promptPaths.length),
      fieldPaths: promptPaths,
      fields: sourceFieldSummaries(extracted.rows, promptPaths),
      sampleRows: projectRowsForPrompt(extracted.rows, promptPaths, maxPromptSampleRows),
      comparisonData,
    },
    templates: registeredTemplates.map(templatePromptSummary),
    allowedTransforms,
    allowedTargetFields: targetFields,
    allowedSlots,
    targetFieldRules: {
      canonicalFields: Array.from(canonicalTargetFields),
      metricTargetFields,
      canonicalFieldHints: [
        {
          targetField: "isOnline",
          meaning: "equipment is online, connected, available, or operationally enabled",
          preferSourceKeys: ["opYn", "operation_yn", "operStateCd", "isOnline"],
        },
        {
          targetField: "isRunning",
          meaning: "equipment is currently running, executing, or in RUN state",
          preferSourceKeys: ["runYn", "running_code", "runStateYn", "isRunning"],
        },
        {
          targetField: "hasAlarm",
          meaning: "equipment has active alarm or alarm count is greater than zero",
          preferSourceKeys: ["alrmCnt", "alarm_count", "alarmTotalCnt", "hasAlarm"],
        },
        {
          targetField: "needsInspection",
          meaning: "equipment requires inspection or maintenance",
          preferSourceKeys: ["inspReqYn", "inspection_required", "inspectDueYn", "needsInspection"],
        },
        {
          targetField: "isReserved",
          meaning: "equipment is reserved",
          preferSourceKeys: ["reserved_flag", "reserveFlag", "isReserved"],
        },
      ],
      templateSelectionRules: [
        "For apiId=equipment-catalog, render only with equipment.imageCardList. If equipment.imageCardList is not registered, no status or telemetry template is compatible with the catalog list.",
        "For apiId=equipment-catalog and registered equipment.imageCardList, select equipment.imageCardList when image/title fields can fill card slots.",
        "equipment.telemetryStatusTable is for wide telemetry/status APIs with at least 3 concrete telemetry_* or metric_* numeric source fields.",
        "Many rows alone does not mean telemetry. Do not select equipment.telemetryStatusTable unless the source has at least 3 telemetry_* or metric_* source fields.",
        "Alarm/count fields such as alarmTotalCnt, alarm_count, alrmCnt, count, or cnt are status evidence for hasAlarm unless there are separate telemetry_* or metric_* fields. Do not use alarm count alone to justify telemetryStatusTable.",
        "For apiId=equipment-status-large-rows, select equipment.telemetryStatusTable when the large-row source includes at least 3 concrete telemetry_* or metric_* fields. If it does not, select a registered statusBooleanList template only if one is registered.",
        "For apiId=equipment-status-wide-columns, prefer equipment.telemetryStatusTable when the telemetry_* columns can fill metric slots.",
      ],
      metricRule:
        "For metric source fields, use targetField equal to the concrete source key, such as telemetry_000. Metrics slots must be backed by telemetry_* or metric_* numeric source fields. Do not map canonical boolean/status targets such as hasAlarm, isOnline, isRunning, needsInspection, or isReserved to items[].metrics. Do not use wildcard target fields. For repeated metric slots, return at most 4 concrete metric mappings.",
      statusRule: "Alarm count fields such as alarmTotalCnt, alarm_count, or alrmCnt should map to canonical hasAlarm with number_to_boolean, not to metric slots.",
      operationRunningRule:
        "If both an operation/online source field and a running source field exist, map both separately. Do not map operation_yn, opYn, or operStateCd to isRunning when running_code, runYn, or runStateYn exists; map operation fields to isOnline and running fields to isRunning.",
      renderRule: "A2UI will apply fieldMappings to create payload.items, then bind selected template slots through slotMappings.",
      candidateRule: "candidateEvaluations must include every template from the templates array exactly once. Use decision=select for one template and decision=reject for all others.",
    },
    outputJsonShape: {
      selectedTemplateId: "string",
      confidence: "number 0..1",
      reason: "short Korean sentence",
      primaryArrayPath: "string",
      fieldMappings: [
        {
          targetField: "canonical field or concrete metric field",
          sourcePath: "one source.fieldPaths value, omitted only for default_false",
          transform: "copy | boolean_code | number_to_boolean | default_false",
          trueValues: ["optional for boolean_code"],
          falseValues: ["optional for boolean_code"],
          defaultValue: "optional for default_false",
          reason: "short string",
        },
      ],
      slotMappings: [
        {
          templateId: "selected template id",
          slot: "one selected template slot",
          sourcePath: "one source.fieldPaths value",
          targetField: "matching fieldMappings targetField",
          transform: "copy | boolean_code | number_to_boolean | default_false",
          reason: "short string",
        },
      ],
      candidateEvaluations: [
        {
          templateId: "template id",
          decision: "select | reject",
          score: "number 0..1",
          schemaFit: "number 0..1",
          queryFit: "number 0..1",
          semanticFit: "number 0..1",
          renderFit: "number 0..1",
          reason: "short string",
          missingRequiredSlots: [],
          risks: [],
        },
      ],
    },
  };
}

function buildComparisonDataPrompt({
  query,
  apiId,
  rawData,
  extracted,
}: {
  query: string;
  apiId: EquipmentApiId;
  rawData: unknown;
  extracted: RowExtraction;
}) {
  const paths = fieldPaths(extracted.rows, extracted.arrayPath ?? "items");
  const promptPaths = promptFieldPaths(paths, extracted.rows);
  return {
    promptVersion,
    task: "Create an AI comparison data profile from unknown raw API data. Do not choose templates and do not create slot mappings.",
    outputContract:
      "Return JSON that explains what each important source field means. Use only observedSource.fieldPaths. Do not invent source fields.",
    userQuery: query,
    apiId,
    observedSource: {
      shape: dataShape(rawData),
      detectedPrimaryArrayPath: extracted.arrayPath ?? "items",
      rowCount: extracted.rowCount,
      fieldPathCount: paths.length,
      omittedFieldPathCount: Math.max(0, paths.length - promptPaths.length),
      fieldPaths: promptPaths,
      fields: sourceFieldSummaries(extracted.rows, promptPaths),
      sampleRows: projectRowsForPrompt(extracted.rows, promptPaths, maxPromptSampleRows),
    },
    allowedRoles: ["identifier", "title", "status", "metric", "timestamp", "location", "image", "description", "category", "unknown"],
    outputJsonShape: {
      primaryArrayPath: "detected primary array path",
      entityName: "short noun for each row, for example equipment, sensor, alarm, order",
      rowMeaning: "short Korean sentence describing what one row represents",
      reason: "short Korean sentence explaining the data interpretation",
      fieldProfiles: [
        {
          sourcePath: "one observedSource.fieldPaths value",
          sourceKey: "last key of sourcePath",
          label: "human readable Korean label",
          type: "string | number | boolean | date | datetime | object | array | unknown",
          role: "identifier | title | status | metric | timestamp | location | image | description | category | unknown",
          targetHint: "canonical field hint such as name, isOnline, isRunning, hasAlarm, updatedAt, or the concrete metric key",
          confidence: "number 0..1",
          reason: "short reason",
          exampleValues: ["short examples from observedSource.sampleRows"],
        },
      ],
      titleCandidates: ["source paths that can identify the row to users"],
      statusCandidates: ["source paths that describe state, online/running/alarm/inspection/reservation"],
      metricCandidates: ["numeric measurement source paths, even when the key name is unfamiliar"],
      timestampCandidates: ["source paths for last update or measurement time"],
      warnings: ["optional ambiguity notes"],
    },
  };
}

function buildTemplateSelectionPrompt(args: Parameters<typeof buildPrompt>[0]) {
  const base = buildPrompt(args);
  return {
    ...base,
    task: "Choose exactly one registered A2UI template for the user query and AI comparison data profile. Do not create fieldMappings or slotMappings.",
    outputContract:
      "Return JSON with selectedTemplateId and reason. confidence and candidateNotes are helpful trace fields but they are not required for selection validity.",
    targetFieldRules: {
      ...base.targetFieldRules,
      renderRule: "Do not create mappings in this step. Mapping happens in the next slot-generation step after the template is selected.",
      candidateRule: "candidateNotes may explain why templates were selected or rejected, but selectedTemplateId and reason are the source of truth.",
    },
    outputJsonShape: {
      selectedTemplateId: "registered template id",
      reason: "short Korean sentence explaining the choice",
      confidence: "optional number 0..1",
      candidateNotes: [
        {
          templateId: "optional registered template id",
          decision: "optional select | reject",
          reason: "optional short reason",
        },
      ],
    },
  };
}

function buildSlotMappingPrompt({
  selection,
  ...args
}: Parameters<typeof buildPrompt>[0] & {
  selection: TemplateSelectionResult;
}) {
  const base = buildPrompt(args);
  const selectedTemplate = base.templates.find((template) => template.templateId === selection.selectedTemplateId);
  const selectedSlots = selectedTemplate?.inputSchema
    ? Array.from(new Set([
        ...selectedTemplate.inputSchema.requiredSlots.map((slot) => slot.slot),
        ...(selectedTemplate.inputSchema.optionalSlots ?? []).map((slot) => slot.slot),
      ])).sort()
    : [];

  return {
    ...base,
    task: "Create fieldMappings and slotMappings only for the already selected A2UI template. Do not compare templates and do not change selectedTemplateId.",
    outputContract:
      "Return JSON with fieldMappings and slotMappings for the selected template only. Use only source.fieldPaths, selectedTemplateSlots, allowedTargetFields, and allowedTransforms.",
    selectedTemplateId: selection.selectedTemplateId,
    selectionReason: selection.reason,
    templates: selectedTemplate ? [selectedTemplate] : [],
    allowedTemplateIds: selection.selectedTemplateId ? [selection.selectedTemplateId] : [],
    allowedSlots: selectedSlots,
    source: {
      ...base.source,
      sampleRows: base.source.sampleRows.slice(0, 1),
    },
    targetFieldRules: {
      ...base.targetFieldRules,
      templateSelectionRules: [
        "Template selection already happened. Do not choose or compare templates in this step.",
        "Do not choose a template in this step. slotMappings do not need templateId; the A2UI server will attach selectedTemplateId. If templateId is included, it must equal selectedTemplateId.",
      ],
      renderRule: "A2UI will apply fieldMappings to display rows, then bind selected template slots through slotMappings.",
      candidateRule: "Do not return candidateEvaluations in this step.",
    },
    outputJsonShape: {
      fieldMappings: [
        {
          targetField: "canonical field or concrete metric field",
          sourcePath: "one source.fieldPaths value",
          transform: "copy | boolean_code | number_to_boolean | default_false",
          trueValues: "optional array for boolean_code",
          falseValues: "optional array for boolean_code",
          defaultValue: "optional for default_false",
          reason: "short string",
        },
      ],
      slotMappings: [
        {
          slot: "one selected template slot",
          sourcePath: "one source.fieldPaths value",
          targetField: "matching fieldMappings targetField",
          transform: "copy | boolean_code | number_to_boolean | default_false",
          reason: "short string",
        },
      ],
      reason: "optional short Korean sentence",
    },
  };
}

async function requestPlannerJson<T>({
  stage,
  prompt,
  systemPrompt,
  responseFormatFor,
  correction,
}: {
  stage: PlannerStage;
  prompt: ReturnType<typeof buildComparisonDataPrompt> | ReturnType<typeof buildTemplateSelectionPrompt> | ReturnType<typeof buildSlotMappingPrompt>;
  systemPrompt: string;
  responseFormatFor: () => unknown;
  correction?: { previousResult: unknown; validationErrors: string[]; instruction: string };
}): Promise<PlannerJsonRequestResult<T>> {
  if (process.env.A2UI_AI_SURFACE_PLANNER_MOCK === "1") return { model: "mock-a2ui-surface-planner" };

  const config = openAIConfig();
  if (!config.apiKey) {
    console.warn("[a2ui] AI surface planner skipped because OPENAI_API_KEY is missing");
    return {
      model: config.model,
      error: plannerIncompleteReason(stage),
      internalError: `A2UI AI ${stage} requires OPENAI_API_KEY.`,
    };
  }

  const attemptConfigs = plannerAttemptsForRequest();
  const requestKind = correction ? "correction" : "initial";
  const attemptRecords: PlannerAttemptTrace[] = [];
  const recordAttempt = (record: PlannerAttemptTrace) => {
    attemptRecords.push(record);
    console.info("[a2ui] AI surface planner attempt summary", record);
  };

  const userPayload = correction
    ? {
        ...prompt,
        correctionRequest: {
          instruction: correction.instruction,
          validationErrors: correction.validationErrors,
          previousInvalidResult: correction.previousResult,
        },
      }
    : prompt;

  const messages = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: compactJson(userPayload),
    },
  ];

  let lastInternalError: string | undefined;
  for (const [attemptIndex, attempt] of attemptConfigs.entries()) {
    const requestBody: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: 0,
      max_tokens: attempt.maxTokens,
    };
    if (attempt.responseFormat === "json_schema") {
      requestBody.response_format = responseFormatFor();
    } else if (attempt.responseFormat === "json_object") {
      requestBody.response_format = { type: "json_object" };
    }

    const startedAt = Date.now();
    try {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      const rawText = await response.text();
      const durationMs = Date.now() - startedAt;
      console.info(
        "[a2ui] AI surface planner raw response",
        response.status,
        `attempt=${attemptIndex + 1}`,
        `stage=${stage}`,
        `requestKind=${requestKind}`,
        `format=${attempt.responseFormat}`,
        `maxTokens=${attempt.maxTokens}`,
        rawText.slice(0, 6000),
      );
      if (!response.ok) {
        lastInternalError = `A2UI AI surface planning request failed with status ${response.status}.`;
        recordAttempt({
          stage,
          requestKind,
          attempt: attemptIndex + 1,
          responseFormat: attempt.responseFormat,
          maxTokens: attempt.maxTokens,
          durationMs,
          outcome: "http_error",
          status: response.status,
          rawResponseLength: rawText.length,
          rawResponsePreview: previewText(rawText),
          error: lastInternalError,
        });
        console.warn("[a2ui] AI surface planner request failed", lastInternalError, rawText.slice(0, 2000));
        if (response.status === 401 || response.status === 403) break;
        if (attemptIndex < attemptConfigs.length - 1) continue;
        break;
      }

      let payload: { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
      try {
        payload = JSON.parse(rawText) as typeof payload;
      } catch (error) {
        lastInternalError = `A2UI AI surface planning response was not JSON: ${errorMessage(error)}`;
        recordAttempt({
          stage,
          requestKind,
          attempt: attemptIndex + 1,
          responseFormat: attempt.responseFormat,
          maxTokens: attempt.maxTokens,
          durationMs,
          outcome: "envelope_parse_error",
          status: response.status,
          rawResponseLength: rawText.length,
          rawResponsePreview: previewText(rawText),
          error: lastInternalError,
        });
        console.warn("[a2ui] AI surface planner envelope parse failed", lastInternalError, rawText.slice(0, 2000));
        break;
      }

      const choice = payload.choices?.[0];
      const content = choice?.message?.content;
      if (!content) {
        lastInternalError = "A2UI AI surface planning response did not include content.";
        recordAttempt({
          stage,
          requestKind,
          attempt: attemptIndex + 1,
          responseFormat: attempt.responseFormat,
          maxTokens: attempt.maxTokens,
          durationMs,
          outcome: "missing_content",
          status: response.status,
          finishReason: choice?.finish_reason,
          rawResponseLength: rawText.length,
          rawResponsePreview: previewText(rawText),
          contentLength: 0,
          error: lastInternalError,
        });
        console.warn("[a2ui] AI surface planner response missing content", { finishReason: choice?.finish_reason });
        if (attemptIndex < attemptConfigs.length - 1) continue;
        break;
      }

      try {
        const result = parsePlannerContent<T>(content);
        recordAttempt({
          stage,
          requestKind,
          attempt: attemptIndex + 1,
          responseFormat: attempt.responseFormat,
          maxTokens: attempt.maxTokens,
          durationMs,
          outcome: "success",
          status: response.status,
          finishReason: choice.finish_reason,
          rawResponseLength: rawText.length,
          rawResponsePreview: previewText(rawText),
          contentLength: content.length,
          contentPreview: previewText(content),
        });
        return { model: config.model, result, attempts: attemptRecords };
      } catch (error) {
        lastInternalError = `A2UI AI surface planning content was not valid JSON: ${errorMessage(error)}`;
        recordAttempt({
          stage,
          requestKind,
          attempt: attemptIndex + 1,
          responseFormat: attempt.responseFormat,
          maxTokens: attempt.maxTokens,
          durationMs,
          outcome: "content_parse_error",
          status: response.status,
          finishReason: choice.finish_reason,
          rawResponseLength: rawText.length,
          rawResponsePreview: previewText(rawText),
          contentLength: content.length,
          contentPreview: previewText(content),
          error: lastInternalError,
        });
        console.warn("[a2ui] AI surface planner content parse failed", {
          attempt: attemptIndex + 1,
          responseFormat: attempt.responseFormat,
          maxTokens: attempt.maxTokens,
          finishReason: choice.finish_reason,
          contentLength: content.length,
          error: errorMessage(error),
          contentPreview: content.slice(0, 2000),
        });
        if (attemptIndex < attemptConfigs.length - 1) continue;
      }
    } catch (error) {
      lastInternalError = `A2UI AI surface planning request failed: ${errorMessage(error)}`;
      recordAttempt({
        stage,
        requestKind,
        attempt: attemptIndex + 1,
        responseFormat: attempt.responseFormat,
        maxTokens: attempt.maxTokens,
        durationMs: Date.now() - startedAt,
        outcome: "request_error",
        error: lastInternalError,
      });
      console.warn("[a2ui] AI surface planner request threw", lastInternalError);
      break;
    }
  }

  return {
    model: config.model,
    error: plannerIncompleteReason(stage),
    internalError: lastInternalError,
    attempts: attemptRecords,
  };
}

function plannerIncompleteReason(stage: PlannerStage) {
  if (stage === "comparison_data") return aiComparisonDataIncompleteReason;
  if (stage === "template_selection") return aiTemplateSelectionIncompleteReason;
  return aiSlotMappingIncompleteReason;
}

function requestComparisonData(
  prompt: ReturnType<typeof buildComparisonDataPrompt>,
  correction?: { previousResult: unknown; validationErrors: string[] },
) {
  return requestPlannerJson<ComparisonDataResult>({
    stage: "comparison_data",
    prompt,
    systemPrompt:
      "You are the A2UI comparison data builder. Interpret unknown raw API fields from observed source paths and sample rows. Return JSON only. Do not choose templates, do not create fieldMappings, and do not create slotMappings. Your job is to describe what each important source field likely means so later A2UI steps can compare registered templates. Treat arbitrary numeric measurement fields as metrics when samples indicate sensor/measurement values, even if the key name is unfamiliar. Use only observedSource.fieldPaths and never invent paths.",
    responseFormatFor: () => comparisonDataResponseFormatFor({ sourcePaths: prompt.observedSource.fieldPaths }),
    correction: correction
      ? {
          ...correction,
          instruction:
            "The previous comparison data failed validation. Return rowMeaning, reason, and fieldProfiles using only observedSource.fieldPaths. Do not return template or slot mappings.",
        }
      : undefined,
  });
}

function requestTemplateSelection(
  prompt: ReturnType<typeof buildTemplateSelectionPrompt>,
  correction?: { previousResult: unknown; validationErrors: string[] },
) {
  return requestPlannerJson<TemplateSelectionResult>({
    stage: "template_selection",
    prompt,
    systemPrompt:
      "You are the A2UI template selector. Choose exactly one registered A2UI template for the AI comparison data profile and user query. Return JSON only. The only required decision fields are selectedTemplateId and reason. Do not create fieldMappings, slotMappings, render payloads, or legacy mappings. Use source.comparisonData, source.fieldPaths, and source.sampleRows as evidence for template choice. Many rows alone is not a template reason; choose based on data meaning and template contract. Telemetry templates require real metric fields from source.comparisonData.metricCandidates or fieldProfiles role=metric. Candidate scores are optional explanation aids, not validation requirements.",
    responseFormatFor: () => templateSelectionResponseFormatFor({ templateIds: prompt.allowedTemplateIds }),
    correction: correction
      ? {
          ...correction,
          instruction:
            "The previous template selection failed validation. Return only a registered selectedTemplateId and a non-empty reason. Do not return mappings.",
        }
      : undefined,
  });
}

function requestSlotMapping(
  prompt: ReturnType<typeof buildSlotMappingPrompt>,
  correction?: { previousResult: unknown; validationErrors: string[] },
) {
  const templateId = prompt.selectedTemplateId ?? "";
  return requestPlannerJson<SlotMappingResult>({
    stage: "slot_mapping",
    prompt,
    systemPrompt:
      "You are the A2UI slot mapper. A template has already been selected. Create fieldMappings and slotMappings only for selectedTemplateId. Do not compare templates and do not change selectedTemplateId. Use source.comparisonData to understand field meaning, but use only source.fieldPaths as sourcePath values. Do not invent source fields. Do not use wildcard paths. slotMappings do not need templateId because the A2UI server will attach selectedTemplateId; if templateId is included, it must equal selectedTemplateId. Fill required slots from the selected template inputSchema. If both online/operation fields and running fields exist, map operation/online fields to isOnline and running fields to isRunning. Alarm/count fields normally map to hasAlarm, not metric slots. Metric slots should use concrete numeric metric source paths from comparisonData metric candidates or role=metric fieldProfiles.",
    responseFormatFor: () => slotMappingResponseFormatFor({
      templateId,
      sourcePaths: prompt.source.fieldPaths,
      targetFields: prompt.allowedTargetFields,
      slots: prompt.allowedSlots,
    }),
    correction: correction
      ? {
          ...correction,
          instruction:
            "The previous slot mapping failed A2UI validation. Keep the same selectedTemplateId and return corrected fieldMappings and slotMappings only.",
        }
      : undefined,
  });
}

function pathForKey(paths: string[], keys: string[]) {
  return paths.find((path) => {
    const key = sourceKey(path) ?? "";
    return keys.some((candidate) => key.toLowerCase() === candidate.toLowerCase());
  });
}

function metricSourcePaths(paths: string[], rows: DataRecord[]) {
  const firstRow = rows[0] ?? {};
  return paths.filter((path) => {
    const key = sourceKey(path);
    return Boolean(key && fieldType(firstRow[key]) === "number" && isMetricLikeKey(key));
  });
}

function mapping(targetField: string, sourcePath: string | undefined, transform: PlannerTransform, reason: string): PlannerFieldMapping | undefined {
  if (!sourcePath && transform !== "default_false") return undefined;
  return {
    targetField,
    sourcePath,
    transform,
    reason,
    trueValues: transform === "boolean_code" ? defaultTrueValues : undefined,
    falseValues: transform === "boolean_code" ? defaultFalseValues : undefined,
  };
}

function mockPlan({
  query,
  apiId,
  extracted,
  templates,
  selectedTemplateId: selectedTemplateIdOverride,
}: {
  query: string;
  apiId: EquipmentApiId;
  extracted: RowExtraction;
  templates: A2UITemplateRegistration[];
  selectedTemplateId?: string;
}): AIPlannerPlan {
  const paths = fieldPaths(extracted.rows, extracted.arrayPath ?? "items");
  const registeredTemplateIds = new Set(templates.filter((template) => template.status === "registered").map((template) => template.componentId));
  const telemetryMetricPaths = metricSourcePaths(paths, extracted.rows);
  const querySaysWide = /계측|텔레메트리|telemetry|metric|진단|wide|컬럼\s*(많|다|큰)/i.test(query);
  const canRenderTelemetry = telemetryMetricPaths.length >= 3 && registeredTemplateIds.has("equipment.telemetryStatusTable");
  const statusTemplateId = templates.find((template) => template.status === "registered" && template.surfaceConfig.viewType === "statusBooleanList")?.componentId;
  const selectedTemplateId = selectedTemplateIdOverride ?? (
    apiId === "equipment-catalog"
      ? "equipment.imageCardList"
      : canRenderTelemetry && (querySaysWide || telemetryMetricPaths.length >= 3)
        ? "equipment.telemetryStatusTable"
        : statusTemplateId ?? "equipment.statusBooleanList"
  );

  const titlePath = pathForKey(paths, titleSourceKeys);
  const idPath = pathForKey(paths, idSourceKeys);
  const locationPath = pathForKey(paths, locationSourceKeys);
  const updatedAtPath = pathForKey(paths, updatedAtSourceKeys);
  const onlinePath = pathForKey(paths, onlineSourceKeys);
  const runningPath = pathForKey(paths, runningSourceKeys);
  const alarmPath = pathForKey(paths, alarmSourceKeys);
  const inspectionPath = pathForKey(paths, inspectionSourceKeys);
  const reservedPath = pathForKey(paths, reservedSourceKeys);
  const imagePath = pathForKey(paths, ["imageUrl", "thumbnailUrl", "photoUrl"]);
  const descriptionPath = pathForKey(paths, ["description", "summary", "content"]);
  const categoryPath = pathForKey(paths, ["category", "type"]);

  const fieldMappings = [
    mapping("id", idPath, "copy", "identifier field"),
    mapping("name", titlePath, "copy", "human-readable title field"),
    mapping("isOnline", onlinePath, onlinePath?.includes("isOnline") ? "copy" : "boolean_code", "online status field"),
    mapping("isRunning", runningPath, runningPath?.includes("isRunning") ? "copy" : "boolean_code", "running status field"),
    mapping("hasAlarm", alarmPath, alarmPath?.includes("hasAlarm") ? "copy" : "number_to_boolean", "alarm field"),
    mapping("needsInspection", inspectionPath, inspectionPath?.includes("needsInspection") ? "copy" : "boolean_code", "inspection status field"),
    mapping("isReserved", reservedPath, reservedPath?.includes("isReserved") || reservedPath?.includes("reserved_flag") ? "copy" : "boolean_code", "reservation status field"),
    mapping("updatedAt", updatedAtPath, "copy", "last update time field"),
    mapping("location", locationPath, "copy", "location field"),
    mapping("imageUrl", imagePath, "copy", "image field"),
    mapping("description", descriptionPath, "copy", "description field"),
    mapping("category", categoryPath, "copy", "category field"),
    ...telemetryMetricPaths
      .slice(0, 6)
      .map((path) => mapping(sourceKey(path) ?? path, path, "copy", "telemetry metric field")),
  ].filter((item): item is PlannerFieldMapping => Boolean(item));

  const statusSlotMappings = fieldMappings
    .filter((item) => statusTargetFields.includes(item.targetField) && item.sourcePath)
    .map((item) => ({
      templateId: selectedTemplateId,
      slot: "items[].statusFlags",
      sourcePath: item.sourcePath,
      targetField: item.targetField,
      transform: item.transform,
      reason: item.reason,
    }));
  const metricSlotMappings = fieldMappings
    .filter((item) => isMetricLikeKey(item.targetField) && item.sourcePath)
    .slice(0, 4)
    .map((item) => ({
      templateId: selectedTemplateId,
      slot: "items[].metrics",
      sourcePath: item.sourcePath,
      targetField: item.targetField,
      transform: item.transform,
      reason: item.reason,
    }));
  const slotMappings: PlannerSlotMapping[] =
    selectedTemplateId === "equipment.imageCardList"
      ? [
          { templateId: selectedTemplateId, slot: "cards[].title", sourcePath: titlePath, targetField: "name", transform: "copy" as const },
          { templateId: selectedTemplateId, slot: "cards[].imageUrl", sourcePath: imagePath, targetField: "imageUrl", transform: "copy" as const },
          { templateId: selectedTemplateId, slot: "cards[].description", sourcePath: descriptionPath, targetField: "description", transform: "copy" as const },
        ].filter((item) => item.sourcePath)
      : [
          { templateId: selectedTemplateId, slot: "items[].title", sourcePath: titlePath, targetField: "name", transform: "copy" as const },
          ...statusSlotMappings,
          ...(selectedTemplateId === "equipment.telemetryStatusTable" ? metricSlotMappings : []),
        ].filter((item) => item.sourcePath);

  const candidateEvaluations = templates
    .filter((template) => template.status === "registered")
    .map((template) => {
      const isSelected = template.componentId === selectedTemplateId;
      const missingMetrics = template.componentId === "equipment.telemetryStatusTable" && metricSlotMappings.length < 3;
      const missingStatus = template.surfaceConfig.viewType !== "imageCardList" && statusSlotMappings.length < 2;
      const missingImage = template.surfaceConfig.viewType === "imageCardList" && !imagePath;
      return {
        templateId: template.componentId,
        decision: isSelected ? "select" as const : "reject" as const,
        score: isSelected ? 0.91 : template.surfaceConfig.viewType === "statusBooleanList" ? 0.76 : 0.42,
        schemaFit: isSelected ? 0.92 : 0.72,
        queryFit: isSelected ? 0.9 : 0.64,
        semanticFit: isSelected ? 0.91 : 0.66,
        renderFit: isSelected ? 0.9 : 0.68,
        reason: isSelected
          ? "Required slots can be filled and the template best matches the query/data semantics."
          : missingMetrics
            ? "Metric slot cannot be filled with enough concrete numeric fields."
            : missingStatus
              ? "Status slot cannot be filled with enough status fields."
              : missingImage
                ? "Image slot cannot be filled."
                : "A different registered template better preserves the source data semantics.",
        missingRequiredSlots: [
          ...(missingMetrics ? ["items[].metrics"] : []),
          ...(missingStatus ? ["items[].statusFlags"] : []),
          ...(missingImage ? ["cards[].imageUrl"] : []),
        ],
        risks: isSelected ? [] : ["lower semantic fit"],
      };
    });

  return {
    selectedTemplateId,
    confidence: 0.91,
    reason:
      selectedTemplateId === "equipment.telemetryStatusTable"
        ? "상태 필드와 numeric telemetry 필드가 모두 있어 컬럼 많은 계측 상태 테이블이 가장 적합합니다."
        : selectedTemplateId === "equipment.imageCardList"
          ? "이미지와 설명 필드가 있어 장비 이미지 카드가 가장 적합합니다."
          : "장비명과 여러 상태 필드가 있어 상태 목록 템플릿이 가장 적합합니다.",
    primaryArrayPath: extracted.arrayPath ?? "items",
    fieldMappings,
    slotMappings,
    candidateEvaluations,
  };
}

function mockTemplateSelection(args: {
  query: string;
  apiId: EquipmentApiId;
  extracted: RowExtraction;
  templates: A2UITemplateRegistration[];
}): TemplateSelectionResult {
  const plan = mockPlan(args);
  return {
    selectedTemplateId: plan.selectedTemplateId,
    confidence: plan.confidence,
    reason: plan.reason,
    candidateNotes: plan.candidateEvaluations?.map((candidate) => ({
      templateId: candidate.templateId,
      decision: candidate.decision,
      reason: candidate.reason,
      score: candidate.score,
      schemaFit: candidate.schemaFit,
      queryFit: candidate.queryFit,
      semanticFit: candidate.semanticFit,
      renderFit: candidate.renderFit,
      missingRequiredSlots: candidate.missingRequiredSlots,
      risks: candidate.risks,
    })),
  };
}

function mockComparisonData(args: {
  rawData: unknown;
  extracted: RowExtraction;
}): ComparisonDataResult {
  return normalizeComparisonData(fallbackComparisonData(args), args.extracted) ?? fallbackComparisonData(args);
}

function mockSlotMapping(args: {
  query: string;
  apiId: EquipmentApiId;
  extracted: RowExtraction;
  templates: A2UITemplateRegistration[];
  selectedTemplateId?: string;
}): SlotMappingResult {
  const plan = mockPlan(args);
  return {
    reason: plan.reason,
    fieldMappings: plan.fieldMappings,
    slotMappings: plan.slotMappings,
  };
}

function hasWildcardPath(path?: string) {
  return Boolean(path && /[*]|\.\./.test(path));
}

function targetTypeFromMapping(mappingItem: PlannerFieldMapping, sourceValue: unknown): A2UIDerivedFieldType {
  if (mappingItem.transform === "default_false") return typeof mappingItem.defaultValue === "string" ? "string" : "boolean";
  if (mappingItem.transform === "boolean_code" || mappingItem.transform === "number_to_boolean") return "boolean";
  return fieldType(sourceValue);
}

function isAllowedTargetField(mappingItem: PlannerFieldMapping, sourceValue: unknown) {
  if (canonicalTargetFields.has(mappingItem.targetField)) return true;
  const sourceFieldType = fieldType(sourceValue);
  const key = sourceKey(mappingItem.sourcePath);
  return Boolean(key && mappingItem.targetField === key && (sourceFieldType === "number" || rolesForKey(key, sourceFieldType).includes("metric")));
}

function isValidSourcePath(sourcePath: string | undefined, validSourcePaths: Set<string>) {
  return Boolean(sourcePath && validSourcePaths.has(sourcePath));
}

function findSourcePathByKeys(paths: string[], keys: string[]) {
  return paths.find((path) => {
    const key = sourceKey(path) ?? "";
    return keys.some((candidate) => key.toLowerCase() === candidate.toLowerCase());
  });
}

function sourcePathForTarget(targetField: string | undefined, paths: string[], slot?: string) {
  const normalized = normalizeTargetFieldValue(targetField, undefined, slot);
  if (!normalized) return undefined;
  if (/^(telemetry_|metric_)/i.test(normalized)) return findSourcePathByKeys(paths, [normalized]);
  if (normalized === "id") return findSourcePathByKeys(paths, idSourceKeys);
  if (normalized === "name") return findSourcePathByKeys(paths, titleSourceKeys);
  if (normalized === "isOnline") return findSourcePathByKeys(paths, onlineSourceKeys);
  if (normalized === "isRunning") return findSourcePathByKeys(paths, runningSourceKeys);
  if (normalized === "hasAlarm") return findSourcePathByKeys(paths, alarmSourceKeys);
  if (normalized === "needsInspection") return findSourcePathByKeys(paths, inspectionSourceKeys);
  if (normalized === "isReserved") return findSourcePathByKeys(paths, reservedSourceKeys);
  if (normalized === "updatedAt") return findSourcePathByKeys(paths, updatedAtSourceKeys);
  if (normalized === "location") return findSourcePathByKeys(paths, locationSourceKeys);
  if (normalized === "imageUrl") return findSourcePathByKeys(paths, ["imageUrl", "thumbnailUrl", "photoUrl"]);
  if (normalized === "description") return findSourcePathByKeys(paths, ["description", "summary", "content"]);
  if (normalized === "category") return findSourcePathByKeys(paths, ["category", "type"]);
  return undefined;
}

function normalizeSourcePath(sourcePath: string | undefined, paths: string[], targetField?: string, slot?: string) {
  const validSourcePaths = new Set(paths);
  if (isValidSourcePath(sourcePath, validSourcePaths)) return sourcePath;

  const key = sourceKey(sourcePath);
  const byKey = key ? findSourcePathByKeys(paths, [key]) : undefined;
  if (byKey) return byKey;

  return sourcePathForTarget(targetField, paths, slot) ?? sourcePath;
}

function normalizeTargetFieldValue(targetField: string | undefined, sourcePath?: string, slot?: string) {
  if (!targetField) return targetField;
  const key = sourceKey(targetField.trim()) ?? targetField.trim();
  const sourcePathKey = sourceKey(sourcePath);

  if (sourcePathKey && isMetricLikeKey(sourcePathKey)) return sourcePathKey;
  if (canonicalTargetFields.has(key)) return key;
  if (isMetricLikeKey(key)) return key;

  const fieldHint = `${slot ?? ""} ${key} ${sourcePathKey ?? ""}`;
  if (/title|label|name|equipmentName|equipment_name|eqpNm|eqp_nm|assetDisplayName|assetName|asset_nm|asset_name/i.test(fieldHint)) return "name";
  if (/^id$|Id$|_id$|assetId|eqp_id/i.test(fieldHint)) return "id";
  if (/image|photo|thumbnail/i.test(fieldHint)) return "imageUrl";
  if (/description|content|summary/i.test(fieldHint)) return "description";
  if (/category|type/i.test(fieldHint)) return "category";
  if (/location|zone|site|plant/i.test(fieldHint)) return "location";
  if (/updatedAt|last|dtm|date|time|signal/i.test(fieldHint)) return "updatedAt";
  if (/running|runYn|runStateYn|running_code/i.test(fieldHint)) return "isRunning";
  if (/online|opYn|operation_yn|operStateCd|oper/i.test(fieldHint)) return "isOnline";
  if (/alarm|alrm/i.test(fieldHint)) return "hasAlarm";
  if (/inspection|inspect|insp/i.test(fieldHint)) return "needsInspection";
  if (/reserved|reserve/i.test(fieldHint)) return "isReserved";
  return key;
}

function normalizeTransformForTarget(mappingItem: PlannerFieldMapping, sourceValue: unknown): PlannerTransform {
  if (allowedTransforms.includes(mappingItem.transform)) {
    if (!["isOnline", "isRunning", "hasAlarm", "needsInspection", "isReserved"].includes(mappingItem.targetField)) return mappingItem.transform;
    if (mappingItem.transform !== "copy") return mappingItem.transform;
  }

  if (["isOnline", "isRunning", "hasAlarm", "needsInspection", "isReserved"].includes(mappingItem.targetField)) {
    if (typeof sourceValue === "number") return "number_to_boolean";
    if (typeof sourceValue === "string") return "boolean_code";
  }

  return allowedTransforms.includes(mappingItem.transform) ? mappingItem.transform : "copy";
}

function normalizeAIPlan(plan: AIPlannerPlan, extracted: RowExtraction): AIPlannerPlan {
  const paths = fieldPaths(extracted.rows, extracted.arrayPath ?? "items");
  const firstRow = extracted.rows[0] ?? {};

  const fieldMappings = (plan.fieldMappings ?? []).map((item) => {
    const sourcePath = normalizeSourcePath(item.sourcePath, paths, item.targetField);
    const targetField = normalizeTargetFieldValue(item.targetField, sourcePath);
    const sourceValueKey = sourceKey(sourcePath);
    const normalizedItem = {
      ...item,
      sourcePath,
      targetField: targetField ?? item.targetField,
    };
    return {
      ...normalizedItem,
      transform: normalizeTransformForTarget(normalizedItem, sourceValueKey ? firstRow[sourceValueKey] : undefined),
    };
  });

  const slotMappings = (plan.slotMappings ?? []).map((item) => {
    const sourcePath = normalizeSourcePath(item.sourcePath, paths, item.targetField, item.slot);
    return {
      ...item,
      sourcePath,
      targetField: normalizeTargetFieldValue(item.targetField, sourcePath, item.slot),
    };
  });

  return {
    ...plan,
    fieldMappings,
    slotMappings,
  };
}

function canRepairIncompleteAIResult(ai: Pick<PlannerJsonRequestResult<unknown>, "error" | "internalError">) {
  if (!ai.error) return false;
  const internalError = ai.internalError ?? "";
  if (/OPENAI_API_KEY|status 401|status 403|unauthorized|forbidden|invalid_api_key/i.test(internalError)) return false;
  return true;
}

function scoreValue(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(1, value > 1 && value <= 100 ? value / 100 : value));
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "high") return 0.85;
    if (text === "medium") return 0.5;
    if (text === "low") return 0.2;
    const parsed = Number.parseFloat(text.replace(/%$/, ""));
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(1, parsed > 1 && parsed <= 100 ? parsed / 100 : parsed));
  }
  return fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeComparisonRole(value: unknown): ComparisonFieldRole {
  if (
    value === "identifier" ||
    value === "title" ||
    value === "status" ||
    value === "metric" ||
    value === "timestamp" ||
    value === "location" ||
    value === "image" ||
    value === "description" ||
    value === "category"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeComparisonData(comparisonData: ComparisonDataResult | undefined, extracted: RowExtraction): ComparisonDataResult | undefined {
  if (!comparisonData || typeof comparisonData !== "object") return undefined;
  const paths = fieldPaths(extracted.rows, extracted.arrayPath ?? "items");
  const validPaths = new Set(paths);
  const firstRow = extracted.rows[0] ?? {};
  const normalizePathList = (value: unknown) => stringArray(value).filter((path) => validPaths.has(path));
  const fieldProfiles: ComparisonFieldProfile[] = [];
  for (const field of Array.isArray(comparisonData.fieldProfiles) ? comparisonData.fieldProfiles : []) {
    const sourcePath = typeof field.sourcePath === "string" && validPaths.has(field.sourcePath) ? field.sourcePath : undefined;
    if (!sourcePath) continue;
    const key = sourceKey(sourcePath) ?? sourcePath;
    const sourceValue = firstRow[key];
    fieldProfiles.push({
      ...field,
      sourcePath,
      sourceKey: typeof field.sourceKey === "string" && field.sourceKey.trim() ? field.sourceKey : key,
      type: typeof field.type === "string" ? field.type : fieldType(sourceValue),
      role: normalizeComparisonRole(field.role),
      targetHint: typeof field.targetHint === "string" && field.targetHint.trim()
        ? normalizeTargetFieldValue(field.targetHint, sourcePath) ?? field.targetHint
        : key,
      confidence: scoreValue(field.confidence, 0.7),
      exampleValues: Array.isArray(field.exampleValues)
        ? field.exampleValues.slice(0, 5)
        : extracted.rows.slice(0, maxPromptSampleRows).map((row) => row[key]).filter((value) => value !== undefined),
      reason: typeof field.reason === "string" && field.reason.trim() ? field.reason : "AI가 source sample을 보고 필드 의미를 추정했습니다.",
    });
  }

  return {
    primaryArrayPath: typeof comparisonData.primaryArrayPath === "string" && comparisonData.primaryArrayPath.trim()
      ? comparisonData.primaryArrayPath
      : extracted.arrayPath ?? "items",
    entityName: typeof comparisonData.entityName === "string" ? comparisonData.entityName : undefined,
    rowMeaning: typeof comparisonData.rowMeaning === "string" ? comparisonData.rowMeaning : undefined,
    reason: typeof comparisonData.reason === "string" ? comparisonData.reason : undefined,
    fieldProfiles,
    titleCandidates: normalizePathList(comparisonData.titleCandidates),
    statusCandidates: normalizePathList(comparisonData.statusCandidates),
    metricCandidates: normalizePathList(comparisonData.metricCandidates),
    timestampCandidates: normalizePathList(comparisonData.timestampCandidates),
    warnings: stringArray(comparisonData.warnings),
  };
}

function fallbackComparisonData({ rawData, extracted }: { rawData: unknown; extracted: RowExtraction }): ComparisonDataResult {
  const paths = fieldPaths(extracted.rows, extracted.arrayPath ?? "items");
  const promptPaths = promptFieldPaths(paths, extracted.rows);
  const fields = sourceFieldSummaries(extracted.rows, promptPaths);
  const fieldProfiles = fields.map((field) => {
    const roles = field.roles;
    const role = roles.includes("title")
      ? "title"
      : roles.includes("status")
        ? "status"
        : roles.includes("metric")
          ? "metric"
          : roles.includes("updatedAt") || roles.includes("time")
            ? "timestamp"
            : roles.includes("location")
              ? "location"
              : roles.includes("image")
                ? "image"
                : roles.includes("description") || roles.includes("content")
                  ? "description"
                  : roles.includes("category")
                    ? "category"
                    : roles.includes("id")
                      ? "identifier"
                      : "unknown";
    return {
      sourcePath: field.path,
      sourceKey: field.key,
      label: field.key,
      type: field.type,
      role,
      targetHint: role === "title" ? "name" : role === "metric" ? field.key : normalizeTargetFieldValue(field.key) ?? field.key,
      confidence: 0.55,
      reason: "LLM 비교용 데이터 생성 실패 시 관찰된 API sample에서 만든 보조 profile입니다.",
      exampleValues: field.examples,
    } satisfies ComparisonFieldProfile;
  });
  return {
    primaryArrayPath: extracted.arrayPath ?? "items",
    entityName: dataShape(rawData),
    rowMeaning: "API 응답의 한 row입니다.",
    reason: "LLM 비교용 데이터 생성 실패 시 source 관찰값으로 보조 profile을 만들었습니다.",
    fieldProfiles,
    titleCandidates: fieldProfiles.filter((field) => field.role === "title").map((field) => field.sourcePath).filter((path): path is string => Boolean(path)),
    statusCandidates: fieldProfiles.filter((field) => field.role === "status").map((field) => field.sourcePath).filter((path): path is string => Boolean(path)),
    metricCandidates: fieldProfiles.filter((field) => field.role === "metric").map((field) => field.sourcePath).filter((path): path is string => Boolean(path)),
    timestampCandidates: fieldProfiles.filter((field) => field.role === "timestamp").map((field) => field.sourcePath).filter((path): path is string => Boolean(path)),
    warnings: ["comparison_data_repaired_from_observed_source"],
  };
}

function validateComparisonData({
  comparisonData,
  extracted,
}: {
  comparisonData: ComparisonDataResult | undefined;
  extracted: RowExtraction;
}): ValidationResult {
  const errors: string[] = [];
  const sourcePaths = new Set(fieldPaths(extracted.rows, extracted.arrayPath ?? "items"));
  if (!comparisonData) {
    errors.push("AI comparison data did not return an object.");
    return { ok: false, errors };
  }
  if (!comparisonData.rowMeaning || !comparisonData.rowMeaning.trim()) errors.push("AI comparison data did not include rowMeaning.");
  if (!comparisonData.reason || !comparisonData.reason.trim()) errors.push("AI comparison data did not include reason.");
  const fieldProfiles = Array.isArray(comparisonData.fieldProfiles) ? comparisonData.fieldProfiles : [];
  if (!fieldProfiles.length) errors.push("AI comparison data did not include fieldProfiles.");
  for (const field of fieldProfiles) {
    if (!field.sourcePath || !sourcePaths.has(field.sourcePath)) errors.push(`AI comparison data includes unknown sourcePath: ${field.sourcePath ?? "(empty)"}`);
    if (!field.role) errors.push(`AI comparison data field is missing role: ${field.sourcePath ?? "(empty)"}`);
    if (!field.targetHint) errors.push(`AI comparison data field is missing targetHint: ${field.sourcePath ?? "(empty)"}`);
    if (!field.reason) errors.push(`AI comparison data field is missing reason: ${field.sourcePath ?? "(empty)"}`);
  }
  return { ok: errors.length === 0, errors };
}

function metricSourcePathsForPlanning(paths: string[], rows: DataRecord[], comparisonData?: ComparisonDataResult) {
  const firstRow = rows[0] ?? {};
  const validPaths = new Set(paths);
  const aiMetricPaths = [
    ...(comparisonData?.metricCandidates ?? []),
    ...((comparisonData?.fieldProfiles ?? [])
      .filter((field) => field.role === "metric" || /metric|measure|telemetry|sensor|수치|계측/i.test(`${field.targetHint ?? ""} ${field.reason ?? ""}`))
      .map((field) => field.sourcePath)
      .filter((path): path is string => Boolean(path))),
  ].filter((path) => validPaths.has(path) && fieldType(firstRow[sourceKey(path) ?? ""]) === "number");
  return orderedUnique([...aiMetricPaths, ...metricSourcePaths(paths, rows)]);
}

function candidateNoteFor(selection: TemplateSelectionResult, templateId: string) {
  return Array.isArray(selection.candidateNotes)
    ? selection.candidateNotes.find((note) => note.templateId === templateId)
    : undefined;
}

function candidateEvaluationsFromSelection(selection: TemplateSelectionResult, templates: A2UITemplateRegistration[]): PlannerCandidateEvaluation[] {
  const selectedTemplateId = selection.selectedTemplateId;
  const confidence = scoreValue(selection.confidence, selectedTemplateId ? 0.86 : 0);
  return templates
    .filter((template) => template.status === "registered")
    .map((template) => {
      const selected = template.componentId === selectedTemplateId;
      const note = candidateNoteFor(selection, template.componentId);
      const score = scoreValue(note?.score ?? note?.confidence, selected ? confidence : 0.2);
      return {
        templateId: template.componentId,
        decision: selected ? "select" as const : "reject" as const,
        score,
        schemaFit: scoreValue(note?.schemaFit, score),
        queryFit: scoreValue(note?.queryFit, score),
        semanticFit: scoreValue(note?.semanticFit, score),
        renderFit: scoreValue(note?.renderFit, score),
        reason:
          typeof note?.reason === "string" && note.reason.trim()
            ? note.reason
            : selected
              ? selection.reason ?? "AI가 이 등록 템플릿을 선택했습니다."
              : "선택된 템플릿이 아니므로 제외했습니다.",
        missingRequiredSlots: stringArray(note?.missingRequiredSlots),
        risks: stringArray(note?.risks),
      };
    });
}

function validateTemplateSelection({
  selection,
  templates,
  apiId,
  telemetryMetricPathCount,
}: {
  selection: TemplateSelectionResult | undefined;
  templates: A2UITemplateRegistration[];
  apiId: EquipmentApiId;
  telemetryMetricPathCount: number;
}): ValidationResult {
  const errors: string[] = [];
  const selectedTemplateId = selection?.selectedTemplateId;
  const registeredIds = new Set(templates.filter((template) => template.status === "registered").map((template) => template.componentId));

  if (!selectedTemplateId) errors.push("AI template selection did not include selectedTemplateId.");
  else if (!registeredIds.has(selectedTemplateId)) errors.push(`Selected template is not registered: ${selectedTemplateId}`);
  if (!selection?.reason || !selection.reason.trim()) errors.push("AI template selection did not include reason.");
  if (apiId === "equipment-catalog" && selectedTemplateId && selectedTemplateId !== "equipment.imageCardList") {
    errors.push(`equipment-catalog must select equipment.imageCardList, got ${selectedTemplateId}.`);
  }
  if (selectedTemplateId === "equipment.telemetryStatusTable" && telemetryMetricPathCount < 3) {
    errors.push(`Telemetry template requires at least 3 telemetry/metric source fields before slot mapping, got ${telemetryMetricPathCount}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function assemblePlanFromSelectionAndMapping({
  selection,
  mappingResult,
  templates,
  extracted,
}: {
  selection: TemplateSelectionResult;
  mappingResult: SlotMappingResult;
  templates: A2UITemplateRegistration[];
  extracted: RowExtraction;
}): AIPlannerPlan {
  return normalizeAIPlan({
    selectedTemplateId: selection.selectedTemplateId,
    confidence: scoreValue(selection.confidence, 0.86),
    reason: selection.reason,
    primaryArrayPath: extracted.arrayPath ?? "items",
    fieldMappings: mappingResult.fieldMappings ?? [],
    slotMappings: (mappingResult.slotMappings ?? []).map((item) => ({
      ...item,
      templateId: item.templateId ?? selection.selectedTemplateId,
    })),
    candidateEvaluations: candidateEvaluationsFromSelection(selection, templates),
  }, extracted);
}

function keepSelectedTemplateSlotMappings(plan: AIPlannerPlan) {
  const selectedTemplateId = plan.selectedTemplateId;
  const slotMappings = Array.isArray(plan.slotMappings) ? plan.slotMappings : [];
  if (!selectedTemplateId || !slotMappings.length) {
    return {
      plan,
      removedCount: 0,
      removedTemplateIds: [] as string[],
    };
  }

  const kept = slotMappings.filter((item) => !item.templateId || item.templateId === selectedTemplateId);
  const removed = slotMappings.filter((item) => item.templateId && item.templateId !== selectedTemplateId);

  if (!removed.length) {
    return {
      plan,
      removedCount: 0,
      removedTemplateIds: [] as string[],
    };
  }

  return {
    plan: {
      ...plan,
      slotMappings: kept,
    },
    removedCount: removed.length,
    removedTemplateIds: Array.from(new Set(removed.map((item) => item.templateId).filter((templateId): templateId is string => Boolean(templateId)))),
  };
}

function validatePlan({
  plan,
  templates,
  extracted,
  comparisonData,
}: {
  plan: AIPlannerPlan;
  templates: A2UITemplateRegistration[];
  extracted: RowExtraction;
  comparisonData?: ComparisonDataResult;
}): ValidationResult {
  const errors: string[] = [];
  const registeredTemplates = templates.filter((template) => template.status === "registered").map(normalizeTemplateInputSchema);
  const selectedTemplate = registeredTemplates.find((template) => template.componentId === plan.selectedTemplateId);
  const registeredTemplateIds = new Set(registeredTemplates.map((template) => template.componentId));
  const sourcePaths = new Set(fieldPaths(extracted.rows, extracted.arrayPath ?? "items"));
  const mappings = Array.isArray(plan.fieldMappings) ? plan.fieldMappings : [];
  const slotMappings = Array.isArray(plan.slotMappings) ? plan.slotMappings : [];
  const candidateEvaluations = Array.isArray(plan.candidateEvaluations) ? plan.candidateEvaluations : [];

  if (!selectedTemplate) errors.push(`Selected template is not registered: ${plan.selectedTemplateId ?? "(empty)"}`);
  if (!mappings.length) errors.push("AI plan did not include fieldMappings.");
  if (!slotMappings.length) errors.push("AI plan did not include slotMappings.");

  const firstRow = extracted.rows[0] ?? {};
  for (const item of mappings) {
    if (!item.targetField) errors.push("fieldMappings item is missing targetField.");
    if (!allowedTransforms.includes(item.transform)) errors.push(`Unsupported transform: ${item.transform}`);
    if (hasWildcardPath(item.sourcePath)) errors.push(`Wildcard sourcePath is not allowed: ${item.sourcePath}`);
    const key = sourceKey(item.sourcePath);
    if (item.targetField && !isAllowedTargetField(item, key ? firstRow[key] : undefined)) {
      errors.push(`Unsupported targetField: ${item.targetField}`);
    }
    if (item.transform !== "default_false" && (!item.sourcePath || !sourcePaths.has(item.sourcePath))) {
      errors.push(`Unknown sourcePath in fieldMappings: ${item.sourcePath ?? "(empty)"}`);
    }
  }

  if (selectedTemplate?.inputSchema) {
    const selectedSlots = new Map<string, { minCount: number; acceptsTypes: A2UIDerivedFieldType[]; required: boolean }>();
    for (const slot of [...selectedTemplate.inputSchema.requiredSlots, ...(selectedTemplate.inputSchema.optionalSlots ?? [])]) {
      selectedSlots.set(slot.slot, {
        minCount: slot.minCount ?? 1,
        acceptsTypes: slot.acceptsTypes,
        required: slot.required,
      });
    }

    const fieldMappingBySource = new Map(mappings.filter((item) => item.sourcePath).map((item) => [item.sourcePath, item]));
    const fieldMappingByTarget = new Map(mappings.map((item) => [item.targetField, item]));
    const counts = new Map<string, number>();

    for (const item of slotMappings) {
      if (item.templateId && item.templateId !== selectedTemplate.componentId) {
        errors.push(`slotMappings item points to another template: ${item.templateId}`);
      }
      const slot = selectedSlots.get(item.slot);
      if (!slot) {
        errors.push(`Unknown slot for selected template: ${item.slot}`);
        continue;
      }
      if (hasWildcardPath(item.sourcePath)) errors.push(`Wildcard sourcePath is not allowed: ${item.sourcePath}`);
      if (item.transform !== "default_false" && (!item.sourcePath || !sourcePaths.has(item.sourcePath))) {
        errors.push(`Unknown sourcePath in slotMappings: ${item.sourcePath ?? "(empty)"}`);
        continue;
      }

      const mappingItem = (item.sourcePath ? fieldMappingBySource.get(item.sourcePath) : undefined) ?? (item.targetField ? fieldMappingByTarget.get(item.targetField) : undefined);
      if (!mappingItem) {
        errors.push(`slotMappings source is not backed by fieldMappings: ${item.sourcePath ?? item.targetField ?? "(empty)"}`);
        continue;
      }
      const key = sourceKey(item.sourcePath ?? mappingItem.sourcePath);
      const mappedType = targetTypeFromMapping(mappingItem, key ? firstRow[key] : undefined);
      if (!slot.acceptsTypes.includes(mappedType)) {
        errors.push(`Slot ${item.slot} does not accept mapped type ${mappedType} from ${item.sourcePath ?? item.targetField}`);
      }
      counts.set(item.slot, (counts.get(item.slot) ?? 0) + 1);
    }

    for (const slot of selectedTemplate.inputSchema.requiredSlots) {
      const count = counts.get(slot.slot) ?? 0;
      if (count < (slot.minCount ?? 1)) {
        errors.push(`Missing required slot ${slot.slot}: ${count}/${slot.minCount ?? 1}`);
      }
    }

    if (selectedTemplate.componentId === "equipment.telemetryStatusTable") {
      const telemetryMetricPaths = new Set(metricSourcePathsForPlanning(fieldPaths(extracted.rows, extracted.arrayPath ?? "items"), extracted.rows, comparisonData));
      const telemetryMetricCount = slotMappings.filter((item) => item.slot === "items[].metrics" && Boolean(item.sourcePath && telemetryMetricPaths.has(item.sourcePath))).length;
      if (telemetryMetricCount < 3) {
        errors.push(`Telemetry template requires at least 3 concrete metric slot mappings from AI comparison data, got ${telemetryMetricCount}.`);
      }
    }
  }

  if (candidateEvaluations.length === 0) {
    errors.push("AI plan did not include candidateEvaluations.");
  }

  const candidateIds = new Set<string>();
  for (const candidate of candidateEvaluations) {
    if (!registeredTemplateIds.has(candidate.templateId)) {
      errors.push(`candidateEvaluations includes unknown template: ${candidate.templateId}`);
    }
    if (candidateIds.has(candidate.templateId)) {
      errors.push(`candidateEvaluations includes duplicate template: ${candidate.templateId}`);
    }
    candidateIds.add(candidate.templateId);
    if (candidate.decision !== "select" && candidate.decision !== "reject") {
      errors.push(`candidateEvaluations has invalid decision for ${candidate.templateId}: ${candidate.decision}`);
    }
    if (typeof candidate.score !== "number" || candidate.score < 0 || candidate.score > 1) {
      errors.push(`candidateEvaluations has invalid score for ${candidate.templateId}: ${candidate.score}`);
    }
    if (!candidate.reason) {
      errors.push(`candidateEvaluations is missing reason for ${candidate.templateId}`);
    }
  }

  for (const templateId of registeredTemplateIds) {
    if (!candidateIds.has(templateId)) {
      errors.push(`candidateEvaluations is missing registered template: ${templateId}`);
    }
  }

  const selectedCandidates = candidateEvaluations.filter((candidate) => candidate.decision === "select");
  if (selectedCandidates.length !== 1) errors.push(`AI plan must include exactly one selected candidate, got ${selectedCandidates.length}.`);
  if (selectedCandidates.length === 1 && selectedCandidates[0].templateId !== plan.selectedTemplateId) {
    errors.push("selectedTemplateId does not match candidateEvaluations decision=select.");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function valueEquals(value: unknown, candidates: unknown[] = []) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  return candidates.some((candidate) => {
    const normalizedCandidate = typeof candidate === "string" ? candidate.trim().toLowerCase() : candidate;
    return normalized === normalizedCandidate;
  });
}

function applyTransform(mappingItem: PlannerFieldMapping, sourceValue: unknown) {
  if (mappingItem.transform === "default_false") return mappingItem.defaultValue ?? false;
  if (mappingItem.transform === "copy") return sourceValue;
  if (mappingItem.transform === "number_to_boolean") {
    if (typeof sourceValue === "boolean") return sourceValue;
    if (typeof sourceValue === "number") return sourceValue > 0;
    return undefined;
  }
  if (mappingItem.transform === "boolean_code") {
    if (typeof sourceValue === "boolean") return sourceValue;
    if (valueEquals(sourceValue, mappingItem.trueValues?.length ? mappingItem.trueValues : defaultTrueValues)) return true;
    if (valueEquals(sourceValue, mappingItem.falseValues?.length ? mappingItem.falseValues : defaultFalseValues)) return false;
  }
  return undefined;
}

function timestampFromValue(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function latestTimestampForRow(row: DataRecord, preferredKey?: string) {
  const keys = [
    preferredKey,
    "updatedAt",
    "lastUpdatedAt",
    "lastDtm",
    "last_dtm",
    "lastSignalAt",
    "timestamp",
    "time",
    "date",
  ].filter((key): key is string => Boolean(key));

  for (const key of Array.from(new Set(keys))) {
    const timestamp = timestampFromValue(row[key]);
    if (timestamp !== undefined) return timestamp;
  }
  return undefined;
}

function displayRowsForPlan(plan: AIPlannerPlan, extracted: RowExtraction) {
  const updatedAtSourcePath =
    plan.fieldMappings?.find((item) => item.targetField === "updatedAt" && item.sourcePath)?.sourcePath ??
    plan.slotMappings?.find((item) => /updatedAt|time/i.test(item.slot) && item.sourcePath)?.sourcePath;
  const preferredKey = sourceKey(updatedAtSourcePath);
  const rowsWithIndex = extracted.rows.map((row, index) => ({
    row,
    index,
    timestamp: latestTimestampForRow(row, preferredKey),
  }));

  if (rowsWithIndex.some((item) => item.timestamp !== undefined)) {
    rowsWithIndex.sort((left, right) => {
      if (left.timestamp === undefined && right.timestamp === undefined) return right.index - left.index;
      if (left.timestamp === undefined) return 1;
      if (right.timestamp === undefined) return -1;
      return right.timestamp - left.timestamp || right.index - left.index;
    });
  }

  return rowsWithIndex.slice(0, maxRenderRows).map((item) => item.row);
}

function applyPlan(plan: AIPlannerPlan, extracted: RowExtraction): EquipmentApiResponse<unknown> {
  const mappings = plan.fieldMappings ?? [];
  const displayRows = displayRowsForPlan(plan, extracted);
  const items = displayRows.map((row) => {
    const next: DataRecord = {};
    for (const item of mappings) {
      const key = sourceKey(item.sourcePath);
      const sourceValue = item.transform === "default_false" ? null : key ? row[key] : undefined;
      const normalizedValue = applyTransform(item, sourceValue);
      if (normalizedValue === undefined || normalizedValue === null) continue;
      next[item.targetField] = normalizedValue;
    }
    return next;
  });

  return {
    items,
    total: items.length,
    page: extracted.page ?? 1,
    pageSize: items.length,
  };
}

function renderPath(targetField?: string) {
  return targetField ? `items[].${targetField}` : undefined;
}

function fieldMappingFromSlots(template: A2UITemplateRegistration, plan: AIPlannerPlan): FieldMapping {
  const slotMappings = plan.slotMappings ?? [];
  const title = slotMappings.find((item) => /title/i.test(item.slot))?.targetField;
  const content = slotMappings.find((item) => /description|content/i.test(item.slot))?.targetField;
  const image = slotMappings.find((item) => /image/i.test(item.slot))?.targetField;
  const booleanFlags = slotMappings
    .filter((item) => /status|boolean|flag/i.test(item.slot))
    .map((item) => renderPath(item.targetField))
    .filter((item): item is string => Boolean(item));
  const metrics = slotMappings
    .filter((item) => /metric/i.test(item.slot))
    .map((item) => renderPath(item.targetField))
    .filter((item): item is string => Boolean(item));

  return {
    title: renderPath(title) ?? template.surfaceConfig.titleBinding,
    content: renderPath(content) ?? template.surfaceConfig.contentBinding ?? template.surfaceConfig.descriptionBinding,
    image: renderPath(image) ?? template.surfaceConfig.imageBinding,
    booleanFlags: booleanFlags.length ? booleanFlags : template.surfaceConfig.statusBindings,
    metrics: metrics.length ? metrics : template.surfaceConfig.metricBindings,
  };
}

function mappingDecision(template: A2UITemplateRegistration, plan: AIPlannerPlan): A2UIMappingDecision {
  return {
    templateId: template.componentId,
    confidence: plan.confidence ?? 0,
    reason: plan.reason ?? "AI surface planner completed.",
    mappings: (plan.slotMappings ?? []).map((item) => ({
      slot: item.slot,
      sourcePath: item.sourcePath ?? "(default)",
      targetField: item.targetField,
      transform: item.transform,
    })),
    missingSlots: [],
  };
}

function candidateTrace(candidate: PlannerCandidateEvaluation): A2UICandidateTrace {
  const score = typeof candidate.score === "number" && Number.isFinite(candidate.score) ? candidate.score : 0;
  return {
    templateId: candidate.templateId,
    score: Number(score.toFixed(4)),
    decision: candidate.decision,
    reason: candidate.reason,
    rejected: candidate.decision === "reject",
    rejectionReason: candidate.decision === "reject" ? candidate.reason : undefined,
    breakdown: {
      schemaFit: candidate.schemaFit ?? 0,
      queryFit: candidate.queryFit ?? 0,
      semanticFit: candidate.semanticFit ?? 0,
      renderFit: candidate.renderFit ?? 0,
    },
    ai: {
      schemaFit: candidate.schemaFit ?? 0,
      queryFit: candidate.queryFit ?? 0,
      semanticFit: candidate.semanticFit ?? 0,
      renderFit: candidate.renderFit ?? 0,
      risks: candidate.risks ?? [],
      missingRequiredSlots: candidate.missingRequiredSlots ?? [],
    },
  };
}

function fallbackRenderPlan({ registryVersion, reason, candidates }: { registryVersion: number; reason: string; candidates?: A2UICandidateTrace[] }): A2UIRenderPlan {
  return {
    selectedComponentId: "agent.markdownList",
    viewType: "simpleTextList",
    score: 0,
    reason,
    fieldMapping: {
      title: "items[].name",
      content: "items[].description",
    },
    isFallback: true,
    registryVersion,
    maxItems: 6,
    strategy: "ai_surface_planner",
    candidates,
  };
}

function buildTrace({
  rawData,
  extracted,
  model,
  plan,
  validation,
  data,
  plannerAttempts,
  comparisonData,
  templateSelection,
  slotMapping,
}: {
  rawData: unknown;
  extracted: RowExtraction;
  model?: string;
  plan: AIPlannerPlan;
  validation: ValidationResult;
  data?: EquipmentApiResponse<unknown>;
  plannerAttempts?: PlannerAttemptTrace[];
  comparisonData?: ComparisonDataResult;
  templateSelection?: TemplateSelectionResult;
  slotMapping?: SlotMappingResult;
}): A2UISurfacePlanTrace {
  return {
    promptVersion,
    model,
    confidence: plan.confidence,
    reason: plan.reason,
    primaryArrayPath: plan.primaryArrayPath,
    selectedTemplateId: plan.selectedTemplateId,
    comparisonData,
    templateSelection,
    slotMapping,
    fieldMappings: plan.fieldMappings ?? [],
    slotMappings: plan.slotMappings ?? [],
    candidateEvaluations: plan.candidateEvaluations ?? [],
    validation,
    sourceShape: dataShape(rawData),
    sourceArrayPath: extracted.arrayPath,
    sourceFieldPaths: fieldPaths(extracted.rows, extracted.arrayPath ?? "items"),
    sourceSampleRows: extracted.rows.slice(0, maxPromptSampleRows),
    sourceRowCount: extracted.rowCount,
    renderRowCount: data?.total,
    sourceDataHash: dataHash(rawData),
    renderDataHash: data ? dataHash(data) : undefined,
    renderDataByteLength: data ? byteLength(data) : undefined,
    plannerAttempts,
    beforeRows: extracted.rows.slice(0, 2),
    afterRows: (data?.items as DataRecord[] | undefined)?.slice(0, 2),
  };
}

export async function planA2UISurfaceWithAI({
  query,
  apiId,
  rawData,
  onProgress,
}: {
  query: string;
  apiId: EquipmentApiId;
  rawData: unknown;
  onProgress?: A2UISurfacePlanProgressHandler;
}): Promise<A2UISurfacePlanResult> {
  const title = apiTitle(apiId);
  const extracted = extractRows(rawData);
  if (!extracted) {
    const catalog = await readTemplateCatalog();
    const reason = "A2UI surface planner requires raw business API rows.";
    return {
      mode: "text_fallback",
      apiId,
      apiTitle: title,
      registryVersion: catalog.version,
      renderPlan: fallbackRenderPlan({ registryVersion: catalog.version, reason }),
      reason,
      strategy: "ai_surface_planner",
      error: reason,
    };
  }

  const extractedFieldPaths = fieldPaths(extracted.rows, extracted.arrayPath ?? "items");

  await emitProgress(onProgress, {
    status: "profile",
    label: "API 데이터 관찰",
    detail: `rows=${extracted.rowCount}`,
    data: {
      rowCount: extracted.rowCount,
      previewRowCount: extracted.rowCount,
      previewSampleSize: extracted.rows.slice(0, maxPromptSampleRows).length,
      sourceShape: dataShape(rawData),
      sourceArrayPath: extracted.arrayPath,
      sourceFieldCount: extractedFieldPaths.length,
      sourceFieldPaths: extractedFieldPaths.slice(0, maxPromptFieldPaths),
      sourceSampleRows: extracted.rows.slice(0, maxPromptSampleRows),
    },
  });

  await emitProgress(onProgress, {
    status: "a2a",
    label: "A2UI 레지스트리",
    detail: "템플릿 계약 로드",
  });

  const catalog = await readTemplateCatalog();
  const templates = catalog.templates.map(normalizeTemplateInputSchema);
  const registeredTemplates = templates.filter((template) => template.status === "registered");
  const registeredImageCardTemplate = registeredTemplates.some((template) => template.componentId === "equipment.imageCardList");
  const registeredStatusTemplate = registeredTemplates.find((template) => template.surfaceConfig.viewType === "statusBooleanList");
  const registeredTelemetryTemplate = registeredTemplates.find((template) => template.componentId === "equipment.telemetryStatusTable");

  await emitProgress(onProgress, {
    status: "registry_loaded",
    label: "A2UI 레지스트리",
    detail: `templates=${registeredTemplates.length}`,
    data: {
      registryVersion: catalog.version,
      templateCount: registeredTemplates.length,
    },
  });

  let model: string | undefined;
  let plannerAttempts: PlannerAttemptTrace[] = [];
  const comparisonPrompt = buildComparisonDataPrompt({ query, apiId, rawData, extracted });
  await emitProgress(onProgress, {
    status: "matcher",
    label: "비교용 데이터 생성 요청",
    detail: `fields=${comparisonPrompt.observedSource.fieldPaths.length} | rows=${comparisonPrompt.observedSource.sampleRows.length}`,
    data: {
      mode: "comparison_data",
      strategy: "ai_surface_planner",
      sourceFieldCount: comparisonPrompt.observedSource.fieldPathCount,
      promptFieldCount: comparisonPrompt.observedSource.fieldPaths.length,
      sourceSampleSize: comparisonPrompt.observedSource.sampleRows.length,
    },
  });

  let comparisonAi = await requestComparisonData(comparisonPrompt);
  model = comparisonAi.model;
  plannerAttempts = [...plannerAttempts, ...(comparisonAi.attempts ?? [])];
  let comparisonData = normalizeComparisonData(
    comparisonAi.result ?? (process.env.A2UI_AI_SURFACE_PLANNER_MOCK === "1" ? mockComparisonData({ rawData, extracted }) : undefined),
    extracted,
  );
  let comparisonValidation = validateComparisonData({ comparisonData, extracted });

  if (!comparisonValidation.ok && process.env.A2UI_AI_SURFACE_PLANNER_MOCK !== "1") {
    const retry = await requestComparisonData(comparisonPrompt, {
      previousResult: comparisonData,
      validationErrors: comparisonValidation.errors,
    });
    model = retry.model ?? model;
    plannerAttempts = [...plannerAttempts, ...(retry.attempts ?? [])];
    if (retry.result) {
      comparisonAi = retry;
      comparisonData = normalizeComparisonData(retry.result, extracted);
      comparisonValidation = validateComparisonData({ comparisonData, extracted });
    } else if (retry.internalError) {
      comparisonAi = { ...comparisonAi, internalError: retry.internalError };
    }
  }

  if ((!comparisonData || !comparisonValidation.ok) && canRepairIncompleteAIResult(comparisonAi)) {
    comparisonData = normalizeComparisonData(fallbackComparisonData({ rawData, extracted }), extracted);
    comparisonValidation = validateComparisonData({ comparisonData, extracted });
    if (comparisonValidation.ok) {
      model = `${model ?? "unknown"}+observed-source-repair`;
      console.warn("[a2ui] AI comparison data used observed-source repair after incomplete LLM response", {
        model,
        internalError: comparisonAi.internalError,
      });
    }
  }

  await emitProgress(onProgress, {
    status: "matcher",
    label: "비교용 데이터 생성 결과 반환",
    detail: comparisonValidation.ok
      ? `fields=${comparisonData?.fieldProfiles?.length ?? 0} | metrics=${comparisonData?.metricCandidates?.length ?? 0}`
      : `failed=${comparisonValidation.errors.length}`,
    data: {
      mode: comparisonValidation.ok ? "comparison_data_ready" : "comparison_data_failed",
      strategy: "ai_surface_planner",
      validation: comparisonValidation,
      plannerAttempts,
      comparisonData,
    },
  });

  if (!comparisonData || !comparisonValidation.ok) {
    const reason = comparisonValidation.errors.length
      ? `AI comparison data failed validation: ${comparisonValidation.errors.join("; ")}`
      : comparisonAi.error ?? aiComparisonDataIncompleteReason;
    if (comparisonAi.internalError) console.warn("[a2ui] AI comparison data hidden failure detail", comparisonAi.internalError);
    const validation: ValidationResult = { ok: false, errors: [reason] };
    const failurePlan: AIPlannerPlan = {
      confidence: 0,
      reason,
      primaryArrayPath: extracted.arrayPath,
      fieldMappings: [],
      slotMappings: [],
      candidateEvaluations: registeredTemplates.map((template) => ({
        templateId: template.componentId,
        decision: "reject" as const,
        score: 0,
        schemaFit: 0,
        queryFit: 0,
        semanticFit: 0,
        renderFit: 0,
        reason: "AI 비교용 데이터 생성 결과가 완성되지 않아 템플릿 판단을 진행하지 않았습니다.",
        missingRequiredSlots: [],
        risks: ["comparison_data_incomplete"],
      })),
    };
    const candidates = failurePlan.candidateEvaluations?.map(candidateTrace) ?? [];
    const trace = buildTrace({ rawData, extracted, model, plan: failurePlan, validation, plannerAttempts, comparisonData });
    await emitProgress(onProgress, {
      status: "plan_validation",
      label: "슬롯 검증",
      detail: "comparison data failed before template selection",
      data: {
        mode: "invalid",
        templateId: null,
        reason,
        strategy: "ai_surface_planner",
        score: 0,
        candidateCount: candidates.length,
        validation,
        plannerAttempts,
        candidates,
        comparisonData,
        mapping: null,
      },
    });
    return {
      mode: "text_fallback",
      apiId,
      apiTitle: title,
      registryVersion: catalog.version,
      renderPlan: {
        ...fallbackRenderPlan({ registryVersion: catalog.version, reason, candidates }),
        aiSurfacePlanTrace: trace,
      },
      reason,
      score: 0,
      strategy: "ai_surface_planner",
      candidates,
      trace,
      error: reason,
    };
  }

  const telemetryMetricPathCount = metricSourcePathsForPlanning(extractedFieldPaths, extracted.rows, comparisonData).length;
  const canUseTelemetryTemplate = Boolean(registeredTelemetryTemplate && telemetryMetricPathCount >= 3);

  if (apiId === "equipment-catalog" && !registeredImageCardTemplate) {
    const reason = "맞는 A2UI 템플릿이 없습니다.";
    const candidateEvaluations: PlannerCandidateEvaluation[] = registeredTemplates.map((template) => {
      const isTelemetry = template.componentId === "equipment.telemetryStatusTable";
      const rejectionReason = isTelemetry
        ? "장비 목록 데이터는 계측 수치/상태 테이블 조건과 맞지 않습니다."
        : "장비 목록 데이터는 상태/알람/점검 테이블 조건과 맞지 않습니다.";
      return {
        templateId: template.componentId,
        decision: "reject",
        score: isTelemetry ? 0.15 : 0.22,
        schemaFit: isTelemetry ? 0.15 : 0.25,
        queryFit: 0.2,
        semanticFit: 0.18,
        renderFit: 0.1,
        reason: rejectionReason,
        missingRequiredSlots: isTelemetry ? ["items[].statusFlags", "items[].metrics"] : ["items[].statusFlags"],
        risks: ["equipment.imageCardList template is not registered"],
      };
    });
    const candidates = candidateEvaluations.map(candidateTrace);
    const validation: ValidationResult = {
      ok: false,
      errors: [reason],
    };
    const plan: AIPlannerPlan = {
      confidence: 0,
      reason,
      primaryArrayPath: extracted.arrayPath,
      fieldMappings: [],
      slotMappings: [],
      candidateEvaluations,
    };
    const trace = buildTrace({ rawData, extracted, model: model ?? "registry-gate", plan, validation, plannerAttempts, comparisonData });

    await emitProgress(onProgress, {
      status: "matcher",
      label: "판단 결과 반환",
      detail: "no compatible image-card template",
      data: {
        mode: "no_template",
        templateId: null,
        reason,
        strategy: "ai_surface_planner",
        score: 0,
        candidateCount: candidates.length,
        candidates,
      },
    });
    await emitProgress(onProgress, {
      status: "plan_validation",
      label: "슬롯 검증",
      detail: "validator rejected plan: image-card template is not registered",
      data: {
        mode: "invalid",
        templateId: null,
        reason,
        strategy: "ai_surface_planner",
        score: 0,
        candidateCount: candidates.length,
        validation,
        candidates,
        mapping: null,
      },
    });

    return {
      mode: "text_fallback",
      apiId,
      apiTitle: title,
      registryVersion: catalog.version,
      renderPlan: {
        ...fallbackRenderPlan({ registryVersion: catalog.version, reason, candidates }),
        aiSurfacePlanTrace: trace,
      },
      reason,
      score: 0,
      strategy: "ai_surface_planner",
      candidates,
      trace,
      error: reason,
    };
  }

  if (apiId !== "equipment-catalog" && !registeredStatusTemplate && !canUseTelemetryTemplate) {
    const reason = "맞는 A2UI 템플릿이 없습니다.";
    const candidateEvaluations: PlannerCandidateEvaluation[] = registeredTemplates.map((template) => {
      const isTelemetry = template.componentId === "equipment.telemetryStatusTable";
      const isImageCard = template.surfaceConfig.viewType === "imageCardList";
      return {
        templateId: template.componentId,
        decision: "reject",
        score: 0.16,
        schemaFit: isTelemetry ? 0.24 : 0.14,
        queryFit: isImageCard ? 0.08 : 0.18,
        semanticFit: isTelemetry ? 0.2 : 0.12,
        renderFit: 0.1,
        reason: isTelemetry
          ? "상태 목록 데이터에는 계측 수치 템플릿을 채울 telemetry/metric 필드가 부족합니다."
          : "장비 상태 데이터는 이 템플릿 조건과 맞지 않습니다.",
        missingRequiredSlots: isTelemetry ? ["items[].metrics"] : ["items[].statusFlags"],
        risks: ["statusBooleanList template is not registered"],
      };
    });
    const candidates = candidateEvaluations.map(candidateTrace);
    const validation: ValidationResult = { ok: false, errors: [reason] };
    const plan: AIPlannerPlan = {
      confidence: 0,
      reason,
      primaryArrayPath: extracted.arrayPath,
      fieldMappings: [],
      slotMappings: [],
      candidateEvaluations,
    };
    const trace = buildTrace({ rawData, extracted, model: model ?? "registry-gate", plan, validation, plannerAttempts, comparisonData });

    await emitProgress(onProgress, {
      status: "matcher",
      label: "판단 결과 반환",
      detail: "no compatible status template",
      data: {
        mode: "no_template",
        templateId: null,
        reason,
        strategy: "ai_surface_planner",
        score: 0,
        candidateCount: candidates.length,
        candidates,
      },
    });
    await emitProgress(onProgress, {
      status: "plan_validation",
      label: "슬롯 검증",
      detail: "validator rejected plan: status template is not registered",
      data: {
        mode: "invalid",
        templateId: null,
        reason,
        strategy: "ai_surface_planner",
        score: 0,
        candidateCount: candidates.length,
        validation,
        candidates,
        mapping: null,
      },
    });

    return {
      mode: "text_fallback",
      apiId,
      apiTitle: title,
      registryVersion: catalog.version,
      renderPlan: {
        ...fallbackRenderPlan({ registryVersion: catalog.version, reason, candidates }),
        aiSurfacePlanTrace: trace,
      },
      reason,
      score: 0,
      strategy: "ai_surface_planner",
      candidates,
      trace,
      error: reason,
    };
  }

  const selectionPrompt = buildTemplateSelectionPrompt({ query, apiId, rawData, extracted, templates, comparisonData });
  await emitProgress(onProgress, {
    status: "matcher",
    label: "템플릿 판단 요청",
    detail: `candidates=${selectionPrompt.allowedTemplateIds.length}`,
    data: {
      mode: "template_selection",
      strategy: "ai_surface_planner",
      candidateCount: selectionPrompt.allowedTemplateIds.length,
      comparisonData,
    },
  });

  let selectionAi = await requestTemplateSelection(selectionPrompt);
  model = selectionAi.model;
  plannerAttempts = [...plannerAttempts, ...(selectionAi.attempts ?? [])];
  let selection = selectionAi.result ?? (process.env.A2UI_AI_SURFACE_PLANNER_MOCK === "1" ? mockTemplateSelection({ query, apiId, extracted, templates }) : undefined);
  let selectionValidation = validateTemplateSelection({ selection, templates, apiId, telemetryMetricPathCount });

  if (!selectionValidation.ok && process.env.A2UI_AI_SURFACE_PLANNER_MOCK !== "1") {
    const retry = await requestTemplateSelection(selectionPrompt, {
      previousResult: selection,
      validationErrors: selectionValidation.errors,
    });
    model = retry.model ?? model;
    plannerAttempts = [...plannerAttempts, ...(retry.attempts ?? [])];
    if (retry.result) {
      selectionAi = retry;
      selection = retry.result;
      selectionValidation = validateTemplateSelection({ selection, templates, apiId, telemetryMetricPathCount });
    } else if (retry.internalError) {
      selectionAi = { ...selectionAi, internalError: retry.internalError };
    }
  }

  if (!selection || !selectionValidation.ok) {
    const reason = selectionValidation.errors.length
      ? `AI template selection failed validation: ${selectionValidation.errors.join("; ")}`
      : selectionAi.error ?? aiTemplateSelectionIncompleteReason;
    if (selectionAi.internalError) console.warn("[a2ui] AI template selection hidden failure detail", selectionAi.internalError);
    const candidateEvaluations = selection
      ? candidateEvaluationsFromSelection(selection, templates)
      : registeredTemplates.map((template) => ({
          templateId: template.componentId,
          decision: "reject" as const,
          score: 0,
          schemaFit: 0,
          queryFit: 0,
          semanticFit: 0,
          renderFit: 0,
          reason: "AI 템플릿 판단 결과가 완성되지 않아 선택하지 않았습니다.",
          missingRequiredSlots: [],
          risks: ["template_selection_incomplete"],
        }));
    const candidates = candidateEvaluations.map(candidateTrace);
    const failurePlan: AIPlannerPlan = {
      confidence: 0,
      reason,
      primaryArrayPath: extracted.arrayPath,
      fieldMappings: [],
      slotMappings: [],
      candidateEvaluations,
    };
    const validation: ValidationResult = { ok: false, errors: [reason] };
    const trace = buildTrace({ rawData, extracted, model, plan: failurePlan, validation, plannerAttempts, comparisonData, templateSelection: selection });
    await emitProgress(onProgress, {
      status: "matcher",
      label: "판단 결과 반환",
      detail: "template selection failed",
      data: {
        mode: "template_selection_failed",
        templateId: null,
        reason,
        strategy: "ai_surface_planner",
        score: 0,
        candidateCount: candidates.length,
        plannerAttempts,
        candidates,
        comparisonData,
        templateSelection: selection,
      },
    });
    await emitProgress(onProgress, {
      status: "plan_validation",
      label: "슬롯 검증",
      detail: "template selection failed before slot generation",
      data: {
        mode: "invalid",
        templateId: null,
        reason,
        strategy: "ai_surface_planner",
        score: 0,
        candidateCount: candidates.length,
        validation,
        plannerAttempts,
        candidates,
        comparisonData,
        mapping: null,
        templateSelection: selection,
      },
    });
    return {
      mode: "text_fallback",
      apiId,
      apiTitle: title,
      registryVersion: catalog.version,
      renderPlan: {
        ...fallbackRenderPlan({ registryVersion: catalog.version, reason, candidates }),
        aiSurfacePlanTrace: trace,
      },
      reason,
      score: 0,
      strategy: "ai_surface_planner",
      candidates,
      trace,
      error: reason,
    };
  }

  const candidates = candidateEvaluationsFromSelection(selection, templates).map(candidateTrace);
  await emitProgress(onProgress, {
    status: "matcher",
    label: "판단 결과 반환",
    detail: [selection.selectedTemplateId ? `template=${selection.selectedTemplateId}` : undefined, `reason=${selection.reason}`]
      .filter(Boolean)
      .join(" | "),
    data: {
      mode: "template_selected",
      templateId: selection.selectedTemplateId,
      strategy: "ai_surface_planner",
      score: scoreValue(selection.confidence, 0.86),
      candidateCount: candidates.length,
      plannerAttempts,
      candidates,
      reason: selection.reason,
      comparisonData,
      templateSelection: selection,
    },
  });

  const mappingPrompt = buildSlotMappingPrompt({ query, apiId, rawData, extracted, templates, comparisonData, selection });
  await emitProgress(onProgress, {
    status: "matcher",
    label: "슬롯 생성 요청",
    detail: `template=${selection.selectedTemplateId}`,
    data: {
      mode: "slot_mapping",
      templateId: selection.selectedTemplateId,
      strategy: "ai_surface_planner",
      sourceSampleSize: mappingPrompt.source.sampleRows.length,
      slotCount: mappingPrompt.allowedSlots.length,
      comparisonData,
      templateSelection: selection,
    },
  });

  let mappingAi = await requestSlotMapping(mappingPrompt);
  model = mappingAi.model ?? model;
  plannerAttempts = [...plannerAttempts, ...(mappingAi.attempts ?? [])];
  let slotMapping = mappingAi.result ?? (process.env.A2UI_AI_SURFACE_PLANNER_MOCK === "1" ? mockSlotMapping({ query, apiId, extracted, templates, selectedTemplateId: selection.selectedTemplateId }) : undefined);

  if (!slotMapping && canRepairIncompleteAIResult(mappingAi)) {
    const repairedMapping = mockSlotMapping({ query, apiId, extracted, templates, selectedTemplateId: selection.selectedTemplateId });
    const repairedPlan = assemblePlanFromSelectionAndMapping({ selection, mappingResult: repairedMapping, templates, extracted });
    const repairValidation = validatePlan({ plan: repairedPlan, templates, extracted, comparisonData });
    if (repairValidation.ok) {
      console.warn("[a2ui] AI slot mapper used source-schema repair after incomplete LLM response", {
        model,
        internalError: mappingAi.internalError,
        selectedTemplateId: selection.selectedTemplateId,
      });
      slotMapping = repairedMapping;
      model = `${model ?? "unknown"}+source-schema-repair`;
    } else {
      console.warn("[a2ui] AI slot mapper source-schema repair failed validation", {
        model,
        internalError: mappingAi.internalError,
        validationErrors: repairValidation.errors,
      });
    }
  }

  if (!slotMapping) {
    const reason = mappingAi.error ?? aiSlotMappingIncompleteReason;
    if (mappingAi.internalError) console.warn("[a2ui] AI slot mapper hidden failure detail", mappingAi.internalError);
    const failurePlan = assemblePlanFromSelectionAndMapping({ selection, mappingResult: {}, templates, extracted });
    const validation: ValidationResult = { ok: false, errors: [reason] };
    const trace = buildTrace({ rawData, extracted, model, plan: failurePlan, validation, plannerAttempts, comparisonData, templateSelection: selection });
    await emitProgress(onProgress, {
      status: "plan_validation",
      label: "슬롯 검증",
      detail: "slot mapper did not return complete mapping JSON",
      data: {
        mode: "invalid",
        templateId: selection.selectedTemplateId,
        reason,
        strategy: "ai_surface_planner",
        score: scoreValue(selection.confidence, 0.86),
        candidateCount: candidates.length,
        validation,
        plannerAttempts,
        candidates,
        comparisonData,
        mapping: null,
        templateSelection: selection,
      },
    });
    return {
      mode: "text_fallback",
      apiId,
      apiTitle: title,
      registryVersion: catalog.version,
      renderPlan: {
        ...fallbackRenderPlan({ registryVersion: catalog.version, reason, candidates }),
        aiSurfacePlanTrace: trace,
      },
      reason,
      score: scoreValue(selection.confidence, 0.86),
      strategy: "ai_surface_planner",
      candidates,
      trace,
      error: reason,
    };
  }

  await emitProgress(onProgress, {
    status: "matcher",
    label: "슬롯 생성 결과 반환",
    detail: `fields=${slotMapping.fieldMappings?.length ?? 0} | slots=${slotMapping.slotMappings?.length ?? 0}`,
    data: {
      mode: "slot_mapping_ready",
      templateId: selection.selectedTemplateId,
      strategy: "ai_surface_planner",
      score: scoreValue(selection.confidence, 0.86),
      fieldMappingCount: slotMapping.fieldMappings?.length ?? 0,
      slotMappingCount: slotMapping.slotMappings?.length ?? 0,
      plannerAttempts,
      comparisonData,
      slotMapping,
      templateSelection: selection,
    },
  });

  let plan = assemblePlanFromSelectionAndMapping({ selection, mappingResult: slotMapping, templates, extracted });
  let slotMappingCleanup = keepSelectedTemplateSlotMappings(plan);
  plan = slotMappingCleanup.plan;
  let validation = validatePlan({ plan, templates, extracted, comparisonData });

  if (!validation.ok && process.env.A2UI_AI_SURFACE_PLANNER_MOCK !== "1") {
    const retry = await requestSlotMapping(mappingPrompt, { previousResult: slotMapping, validationErrors: validation.errors });
    model = retry.model ?? model;
    plannerAttempts = [...plannerAttempts, ...(retry.attempts ?? [])];
    if (retry.result) {
      mappingAi = retry;
      slotMapping = retry.result;
      plan = assemblePlanFromSelectionAndMapping({ selection, mappingResult: slotMapping, templates, extracted });
      slotMappingCleanup = keepSelectedTemplateSlotMappings(plan);
      plan = slotMappingCleanup.plan;
      validation = validatePlan({ plan, templates, extracted, comparisonData });
    } else if (retry.internalError) {
      mappingAi = { ...mappingAi, internalError: retry.internalError };
    }
  }

  const validatedCandidates = (plan.candidateEvaluations ?? []).map(candidateTrace);
  await emitProgress(onProgress, {
    status: "plan_validation",
    label: "슬롯 검증",
    detail: validation.ok
      ? slotMappingCleanup.removedCount > 0
        ? `validator accepted slot plan after selected-template slot cleanup (${slotMappingCleanup.removedCount} removed)`
        : "validator accepted slot plan"
      : `validator rejected slot plan: ${validation.errors.length} errors`,
    data: {
      mode: validation.ok ? "validated" : "invalid",
      templateId: plan.selectedTemplateId,
      strategy: "ai_surface_planner",
      score: plan.confidence,
      candidateCount: validatedCandidates.length,
      validation,
      plannerAttempts,
      slotMappingCleanup: slotMappingCleanup.removedCount > 0
        ? {
            removedCount: slotMappingCleanup.removedCount,
            removedTemplateIds: slotMappingCleanup.removedTemplateIds,
          }
        : undefined,
      candidates: validatedCandidates,
      comparisonData,
      slotMapping,
      templateSelection: selection,
      mapping: plan.selectedTemplateId
        ? {
            templateId: plan.selectedTemplateId,
            confidence: plan.confidence ?? 0,
            reason: plan.reason ?? "AI surface planner returned a plan.",
            mappings: plan.slotMappings ?? [],
            missingSlots: [],
          }
        : undefined,
    },
  });
  if (!validation.ok) {
    const reason = `AI slot mapping failed validation: ${validation.errors.join("; ")}`;
    const trace = buildTrace({ rawData, extracted, model, plan, validation, plannerAttempts, comparisonData, templateSelection: selection, slotMapping });
    return {
      mode: "text_fallback",
      apiId,
      apiTitle: title,
      registryVersion: catalog.version,
      renderPlan: {
        ...fallbackRenderPlan({ registryVersion: catalog.version, reason, candidates: validatedCandidates }),
        aiSurfacePlanTrace: trace,
      },
      reason,
      score: plan.confidence,
      strategy: "ai_surface_planner",
      candidates: validatedCandidates,
      trace,
      error: reason,
    };
  }

  const template = templates.find((item) => item.componentId === plan.selectedTemplateId && item.status === "registered");
  if (!template) {
    const reason = `Selected template is not available: ${plan.selectedTemplateId ?? "(empty)"}`;
    return {
      mode: "text_fallback",
      apiId,
      apiTitle: title,
      registryVersion: catalog.version,
      renderPlan: fallbackRenderPlan({ registryVersion: catalog.version, reason, candidates: validatedCandidates }),
      reason,
      score: plan.confidence,
      strategy: "ai_surface_planner",
      candidates: validatedCandidates,
      error: reason,
    };
  }

  const data = applyPlan(plan, extracted);
  await emitProgress(onProgress, {
    status: "mapping_applied",
    label: "데이터 / 슬롯 맵핑",
    detail: `mappings=${plan.fieldMappings?.length ?? 0}`,
    data: {
      mode: "render_surface",
      templateId: plan.selectedTemplateId,
      strategy: "ai_surface_planner",
      score: plan.confidence,
      candidateCount: validatedCandidates.length,
      fieldMappingCount: plan.fieldMappings?.length ?? 0,
      slotMappingCount: plan.slotMappings?.length ?? 0,
      renderRowCount: data.total,
      plannerAttempts,
      comparisonData,
      slotMapping,
      templateSelection: selection,
      mapping: {
        templateId: plan.selectedTemplateId,
        confidence: plan.confidence ?? 0,
        reason: plan.reason ?? "AI surface planner returned a plan.",
        mappings: plan.slotMappings ?? [],
        missingSlots: [],
      },
    },
  });
  const profile = buildA2UIDataProfile(data);
  const sampleDataPreview = buildSampleDataPreview(data, { sourceId: apiId, sourceKind: "api_response" });
  const derivedSchema = buildDerivedSchema(data, { sourceId: apiId, sourceKind: "api_response", sampleDataPreview });
  const mapping = mappingDecision(template, plan);
  const trace = buildTrace({ rawData, extracted, model, plan, validation, data, plannerAttempts, comparisonData, templateSelection: selection, slotMapping });
  const renderPlan: A2UIRenderPlan = {
    selectedComponentId: template.componentId,
    viewType: template.surfaceConfig.viewType,
    score: plan.confidence ?? 0,
    reason: plan.reason ?? "AI surface planner selected the template.",
    fieldMapping: fieldMappingFromSlots(template, plan),
    isFallback: false,
    registryVersion: catalog.version,
    maxItems: Math.min(maxRenderRows, data.items.length),
    strategy: "ai_surface_planner",
    candidates: validatedCandidates,
    mapping,
    aiSurfacePlanTrace: trace,
  };

  return {
    mode: "render_surface",
    apiId,
    apiTitle: title,
    registryVersion: catalog.version,
    template,
    templateId: template.componentId,
    data,
    profile,
    derivedSchema,
    renderPlan,
    reason: renderPlan.reason,
    score: renderPlan.score,
    strategy: "ai_surface_planner",
    mapping,
    candidates: validatedCandidates,
    trace,
  };
}

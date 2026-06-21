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

export type A2UISurfacePlanTrace = {
  promptVersion: typeof promptVersion;
  model?: string;
  confidence?: number;
  reason?: string;
  primaryArrayPath?: string;
  selectedTemplateId?: string;
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

const promptVersion = "2026-06-21.a2ui-surface-plan.v1" as const;
const allowedTransforms: PlannerTransform[] = ["copy", "boolean_code", "number_to_boolean", "default_false"];
const maxPromptFieldPaths = 64;
const maxPromptSampleRows = 3;
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
function plannerResponseFormatFor({
  templateIds,
  sourcePaths,
  targetFields,
  slots,
}: {
  templateIds: string[];
  sourcePaths: string[];
  targetFields: string[];
  slots: string[];
}) {
  return {
    type: "json_schema",
    json_schema: {
      name: "a2ui_surface_plan",
      strict: true,
      schema: {
      type: "object",
      additionalProperties: false,
      required: ["selectedTemplateId", "confidence", "reason", "primaryArrayPath", "fieldMappings", "slotMappings", "candidateEvaluations"],
      properties: {
        selectedTemplateId: { type: "string", enum: templateIds },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reason: { type: "string" },
        primaryArrayPath: { type: "string" },
        fieldMappings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["targetField", "sourcePath", "transform", "trueValues", "falseValues", "defaultValue", "reason"],
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
            additionalProperties: false,
            required: ["templateId", "slot", "sourcePath", "targetField", "transform", "reason"],
            properties: {
              templateId: { type: "string", enum: templateIds },
              slot: { type: "string", enum: slots },
              sourcePath: { type: "string", enum: sourcePaths },
              targetField: { type: "string", enum: targetFields },
              transform: { type: "string", enum: allowedTransforms },
              reason: { type: "string" },
            },
          },
        },
        candidateEvaluations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["templateId", "decision", "score", "schemaFit", "queryFit", "semanticFit", "renderFit", "reason", "missingRequiredSlots", "risks"],
            properties: {
              templateId: { type: "string", enum: templateIds },
              decision: { type: "string", enum: ["select", "reject"] },
              score: { type: "number", minimum: 0, maximum: 1 },
              schemaFit: { type: "number", minimum: 0, maximum: 1 },
              queryFit: { type: "number", minimum: 0, maximum: 1 },
              semanticFit: { type: "number", minimum: 0, maximum: 1 },
              renderFit: { type: "number", minimum: 0, maximum: 1 },
              reason: { type: "string" },
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

function sourceKey(sourcePath?: string) {
  if (!sourcePath) return undefined;
  return sourcePath.replace(/\[\]/g, "").split(".").pop();
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
  if (/^id$|Id$|_id$|assetId|eqp_id/i.test(key)) roles.push("id");
  if (/name|title|equipmentName|eqpNm|eqp_nm|assetDisplayName|assetName/i.test(key)) roles.push("title", "label");
  if (/description|content|summary/i.test(key)) roles.push("content", "description");
  if (/image|photo|thumbnail/i.test(key)) roles.push("image", "uri");
  if (type === "boolean") roles.push("booleanFlag", "status");
  if (/status|state|phase|yn$|flag$|code$|oper|running|inspection|reserve/i.test(key)) roles.push("status");
  if (/category|type/i.test(key)) roles.push("category");
  if (/location|zone|site|plant/i.test(key)) roles.push("location");
  if (/updatedAt|last|dtm|date|time|signal/i.test(key) || type === "date" || type === "datetime") roles.push("updatedAt", "time");
  if (type === "number" && /count|cnt|total|rate|score|metric|telemetry|amount|size|alarm/i.test(key)) roles.push("metric");
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

function compactJson(value: unknown, limit = 14000) {
  const text = JSON.stringify(value, null, 2);
  return text.length > limit ? `${text.slice(0, limit)}\n...truncated` : text;
}

function stripCodeFence(text: string) {
  return text.trim().replace(/^```(?:json|JSON)?\s*/, "").replace(/\s*```$/, "").trim();
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
}: {
  query: string;
  apiId: EquipmentApiId;
  rawData: unknown;
  extracted: RowExtraction;
  templates: A2UITemplateRegistration[];
}) {
  const paths = fieldPaths(extracted.rows, extracted.arrayPath ?? "items");
  const promptPaths = paths.slice(0, maxPromptFieldPaths);
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
      sampleRows: extracted.rows.slice(0, maxPromptSampleRows),
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
        "Many rows alone does not mean telemetry. If the source has many rows but does not have at least 3 telemetry_* or metric_* source fields, prefer equipment.commonStatusTable for status-list requests.",
        "Alarm/count fields such as alarmTotalCnt, alarm_count, alrmCnt, count, or cnt are status evidence for hasAlarm unless there are separate telemetry_* or metric_* fields. Do not use alarm count alone to justify telemetryStatusTable.",
        "For apiId=equipment-status-large-rows, prefer equipment.commonStatusTable unless the source also has at least 3 concrete telemetry_* or metric_* fields.",
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

async function requestAIPlan(
  prompt: ReturnType<typeof buildPrompt>,
  correction?: { previousPlan: AIPlannerPlan; validationErrors: string[] },
): Promise<{ plan?: AIPlannerPlan; model?: string; error?: string }> {
  if (process.env.A2UI_AI_SURFACE_PLANNER_MOCK === "1") return { model: "mock-a2ui-surface-planner" };

  const config = openAIConfig();
  if (!config.apiKey) {
    return { model: config.model, error: "A2UI AI surface planning requires OPENAI_API_KEY." };
  }

  const userPayload = correction
    ? {
        ...prompt,
        correctionRequest: {
          instruction:
            "The previous plan failed A2UI validation. Re-evaluate all templates from the raw source schema and return a corrected plan. Do not patch only the invalid field; choose another template if the selected template cannot satisfy required slots.",
          validationErrors: correction.validationErrors,
          previousInvalidPlan: correction.previousPlan,
        },
      }
    : prompt;

  const messages = [
    {
      role: "system",
      content:
        "You are the A2UI server-side surface planner. You must do two jobs: map raw business API fields to A2UI display fields and template slots, then compare all registered A2UI template candidates and choose the best one. Return JSON only in the required schema. Do not return a legacy mappings object. Do not invent source fields. Use only source paths listed in source.fieldPaths. Use transforms only from allowedTransforms. Prefer the template whose inputSchema can be filled with high confidence and whose selectionGuide matches the user query and source data semantics. If both online/operation fields and running fields exist, map operation/online fields to isOnline and running fields to isRunning. If two templates are similar, explain the tie-breaker using required slots, metric/status/image evidence, row count, and user query. candidateEvaluations must include every registered template exactly once: one decision=select and all others decision=reject. For every rejected candidate, include the concrete reason. The final selected template must still satisfy required slots. For repeated metric/status slots, return one mapping per concrete source path, with at most 4 metric mappings. Do not use wildcard paths. " +
        "Telemetry templates require real telemetry or metric columns: select equipment.telemetryStatusTable only when at least 3 concrete telemetry_* or metric_* numeric source fields can fill metric slots. Many rows alone is not telemetry. Alarm/count fields such as alarm_count, alarmTotalCnt, alrmCnt, count, or cnt should normally become hasAlarm status evidence, not items[].metrics.",
    },
    {
      role: "user",
      content: compactJson(userPayload),
    },
  ];

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0,
        max_tokens: 2500,
        response_format: plannerResponseFormatFor({
          templateIds: prompt.allowedTemplateIds,
          sourcePaths: prompt.source.fieldPaths,
          targetFields: prompt.allowedTargetFields,
          slots: prompt.allowedSlots,
        }),
      }),
    });
    const rawText = await response.text();
    console.info("[a2ui] AI surface planner raw response", response.status, rawText.slice(0, 6000));
    if (!response.ok) return { model: config.model, error: `A2UI AI surface planning request failed with status ${response.status}.` };

    const payload = JSON.parse(rawText) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return { model: config.model, error: "A2UI AI surface planning response did not include content." };
    return { model: config.model, plan: JSON.parse(stripCodeFence(content)) as AIPlannerPlan };
  } catch (error) {
    return { model: config.model, error: `A2UI AI surface planning failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function pathForKey(paths: string[], keys: string[]) {
  return paths.find((path) => {
    const key = sourceKey(path) ?? "";
    return keys.some((candidate) => key.toLowerCase() === candidate.toLowerCase());
  });
}

function pathsMatching(paths: string[], pattern: RegExp) {
  return paths.filter((path) => pattern.test(sourceKey(path) ?? ""));
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
}: {
  query: string;
  apiId: EquipmentApiId;
  extracted: RowExtraction;
  templates: A2UITemplateRegistration[];
}): AIPlannerPlan {
  const paths = fieldPaths(extracted.rows, extracted.arrayPath ?? "items");
  const registeredTemplateIds = new Set(templates.filter((template) => template.status === "registered").map((template) => template.componentId));
  const metricPaths = pathsMatching(paths, /^(telemetry_|metric_|.*count$|.*cnt$|alarmTotalCnt$|alarm_count$)/i);
  const telemetryMetricPaths = metricPaths.filter((path) => /^(telemetry_|metric_)/i.test(sourceKey(path) ?? ""));
  const querySaysWide = /계측|텔레메트리|telemetry|metric|진단|wide|컬럼\s*(많|다|큰)/i.test(query);
  const canRenderTelemetry = telemetryMetricPaths.length >= 3 && registeredTemplateIds.has("equipment.telemetryStatusTable");
  const selectedTemplateId =
    apiId === "equipment-catalog"
      ? "equipment.imageCardList"
      : canRenderTelemetry && (querySaysWide || telemetryMetricPaths.length >= 3)
        ? "equipment.telemetryStatusTable"
        : "equipment.commonStatusTable";

  const titlePath = pathForKey(paths, ["name", "equipmentName", "eqpNm", "eqp_nm", "assetDisplayName", "assetName", "title"]);
  const idPath = pathForKey(paths, ["id", "eqpId", "eqp_id", "assetId"]);
  const locationPath = pathForKey(paths, ["location", "site", "site_nm", "plantZone"]);
  const updatedAtPath = pathForKey(paths, ["updatedAt", "lastDtm", "last_dtm", "lastSignalAt"]);
  const onlinePath = pathForKey(paths, ["isOnline", "opYn", "operation_yn", "operStateCd"]);
  const runningPath = pathForKey(paths, ["isRunning", "runYn", "running_code", "runStateYn"]);
  const alarmPath = pathForKey(paths, ["hasAlarm", "alrmCnt", "alarm_count", "alarmTotalCnt"]);
  const inspectionPath = pathForKey(paths, ["needsInspection", "inspReqYn", "inspection_required", "inspectDueYn"]);
  const reservedPath = pathForKey(paths, ["isReserved", "reserved_flag", "reserveFlag"]);
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
    .filter((item) => ["isOnline", "isRunning", "hasAlarm", "needsInspection", "isReserved"].includes(item.targetField) && item.sourcePath)
    .map((item) => ({
      templateId: selectedTemplateId,
      slot: "items[].statusFlags",
      sourcePath: item.sourcePath,
      targetField: item.targetField,
      transform: item.transform,
      reason: item.reason,
    }));
  const metricSlotMappings = fieldMappings
    .filter((item) => /^telemetry_/i.test(item.targetField) && item.sourcePath)
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
        score: isSelected ? 0.91 : template.componentId === "equipment.commonStatusTable" ? 0.76 : 0.42,
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
          : "장비명과 여러 상태 필드가 있어 공용 장비 상태 템플릿이 가장 적합합니다.",
    primaryArrayPath: extracted.arrayPath ?? "items",
    fieldMappings,
    slotMappings,
    candidateEvaluations,
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
  return Boolean(key && mappingItem.targetField === key && rolesForKey(key, sourceFieldType).includes("metric"));
}

function isConcreteTelemetryMetricPath(path?: string) {
  const key = sourceKey(path);
  return Boolean(key && /^(telemetry_|metric_)/i.test(key));
}

function validatePlan({
  plan,
  templates,
  extracted,
}: {
  plan: AIPlannerPlan;
  templates: A2UITemplateRegistration[];
  extracted: RowExtraction;
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
      const telemetryMetricCount = slotMappings.filter((item) => item.slot === "items[].metrics" && isConcreteTelemetryMetricPath(item.sourcePath)).length;
      if (telemetryMetricCount < 3) {
        errors.push(`Telemetry template requires at least 3 concrete telemetry_* or metric_* metric slot mappings, got ${telemetryMetricCount}.`);
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

function applyPlan(plan: AIPlannerPlan, extracted: RowExtraction): EquipmentApiResponse<unknown> {
  const mappings = plan.fieldMappings ?? [];
  const items = extracted.rows.map((row) => {
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
    total: extracted.rowCount,
    page: extracted.page ?? 1,
    pageSize: extracted.pageSize ?? items.length,
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
}: {
  rawData: unknown;
  extracted: RowExtraction;
  model?: string;
  plan: AIPlannerPlan;
  validation: ValidationResult;
  data?: EquipmentApiResponse<unknown>;
}): A2UISurfacePlanTrace {
  return {
    promptVersion,
    model,
    confidence: plan.confidence,
    reason: plan.reason,
    primaryArrayPath: plan.primaryArrayPath,
    selectedTemplateId: plan.selectedTemplateId,
    fieldMappings: plan.fieldMappings ?? [],
    slotMappings: plan.slotMappings ?? [],
    candidateEvaluations: plan.candidateEvaluations ?? [],
    validation,
    sourceShape: dataShape(rawData),
    sourceArrayPath: extracted.arrayPath,
    sourceFieldPaths: fieldPaths(extracted.rows, extracted.arrayPath ?? "items"),
    sourceSampleRows: extracted.rows.slice(0, 5),
    sourceRowCount: extracted.rowCount,
    renderRowCount: data?.total,
    sourceDataHash: dataHash(rawData),
    renderDataHash: data ? dataHash(data) : undefined,
    renderDataByteLength: data ? byteLength(data) : undefined,
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

  await emitProgress(onProgress, {
    status: "profile",
    label: "Build A2UI source preview",
    detail: `rows=${extracted.rowCount}`,
    data: {
      rowCount: extracted.rowCount,
      previewRowCount: extracted.rowCount,
      previewSampleSize: extracted.rows.slice(0, 5).length,
      sourceShape: dataShape(rawData),
      sourceArrayPath: extracted.arrayPath,
      sourceFieldCount: fieldPaths(extracted.rows, extracted.arrayPath ?? "items").length,
    },
  });

  await emitProgress(onProgress, {
    status: "a2a",
    label: "A2UI Registry",
    detail: "Load template contracts",
  });

  const catalog = await readTemplateCatalog();
  const templates = catalog.templates.map(normalizeTemplateInputSchema);
  const registeredTemplates = templates.filter((template) => template.status === "registered");
  const registeredImageCardTemplate = registeredTemplates.some((template) => template.componentId === "equipment.imageCardList");

  await emitProgress(onProgress, {
    status: "registry_loaded",
    label: "A2UI Registry",
    detail: `templates=${registeredTemplates.length}`,
    data: {
      registryVersion: catalog.version,
      templateCount: registeredTemplates.length,
    },
  });

  if (apiId === "equipment-catalog" && !registeredImageCardTemplate) {
    const reason = "장비 목록은 장비 이미지 카드 템플릿이 등록되어 있어야 A2UI로 렌더링할 수 있습니다.";
    const candidateEvaluations: PlannerCandidateEvaluation[] = registeredTemplates.map((template) => {
      const isTelemetry = template.componentId === "equipment.telemetryStatusTable";
      return {
        templateId: template.componentId,
        decision: "reject",
        score: isTelemetry ? 0.15 : 0.22,
        schemaFit: isTelemetry ? 0.15 : 0.25,
        queryFit: 0.2,
        semanticFit: 0.18,
        renderFit: 0.1,
        reason: "장비 목록 API는 장비 이미지 카드 템플릿이 등록된 경우에만 렌더링할 수 있으므로 이 템플릿은 선택하지 않습니다.",
        missingRequiredSlots: isTelemetry ? ["items[].statusFlags", "items[].metrics"] : ["items[].statusFlags"],
        risks: ["equipment.imageCardList template is not registered"],
      };
    });
    const candidates = candidateEvaluations.map(candidateTrace);
    const validation: ValidationResult = {
      ok: false,
      errors: ["Missing registered template equipment.imageCardList"],
    };
    const plan: AIPlannerPlan = {
      confidence: 0,
      reason,
      primaryArrayPath: extracted.arrayPath,
      fieldMappings: [],
      slotMappings: [],
      candidateEvaluations,
    };
    const trace = buildTrace({ rawData, extracted, model: "registry-gate", plan, validation });

    await emitProgress(onProgress, {
      status: "matcher",
      label: "AI Surface Planner",
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
      label: "Validate AI plan",
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

  const prompt = buildPrompt({ query, apiId, rawData, extracted, templates });
  await emitProgress(onProgress, {
    status: "matcher",
    label: "AI Surface Planner",
    detail: `candidates=${prompt.allowedTemplateIds.length}`,
    data: {
      mode: "planning",
      strategy: "ai_surface_planner",
      candidateCount: prompt.allowedTemplateIds.length,
    },
  });

  let ai = await requestAIPlan(prompt);
  let plan = ai.plan ?? (process.env.A2UI_AI_SURFACE_PLANNER_MOCK === "1" ? mockPlan({ query, apiId, extracted, templates }) : undefined);
  if (!plan) {
    const reason = ai.error ?? "A2UI AI surface planner did not return a plan.";
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

  const candidates = (plan.candidateEvaluations ?? []).map(candidateTrace);
  await emitProgress(onProgress, {
    status: "matcher",
    label: "AI Surface Planner",
    detail: [plan.selectedTemplateId ? `template=${plan.selectedTemplateId}` : undefined, typeof plan.confidence === "number" ? `score=${plan.confidence.toFixed(2)}` : undefined]
      .filter(Boolean)
      .join(" | "),
    data: {
      mode: "plan_ready",
      templateId: plan.selectedTemplateId,
      strategy: "ai_surface_planner",
      score: plan.confidence,
      candidateCount: candidates.length,
      candidates,
    },
  });

  let validation = validatePlan({ plan, templates, extracted });
  if (!validation.ok && process.env.A2UI_AI_SURFACE_PLANNER_MOCK !== "1") {
    const retry = await requestAIPlan(prompt, { previousPlan: plan, validationErrors: validation.errors });
    if (retry.plan) {
      ai = retry;
      plan = retry.plan;
      validation = validatePlan({ plan, templates, extracted });
    }
  }

  const validatedCandidates = (plan.candidateEvaluations ?? []).map(candidateTrace);
  await emitProgress(onProgress, {
    status: "plan_validation",
    label: "Validate AI plan",
    detail: validation.ok ? "validator accepted returned plan" : `validator rejected plan: ${validation.errors.length} errors`,
    data: {
      mode: validation.ok ? "validated" : "invalid",
      templateId: plan.selectedTemplateId,
      strategy: "ai_surface_planner",
      score: plan.confidence,
      candidateCount: validatedCandidates.length,
      validation,
      candidates: validatedCandidates,
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
    const reason = `AI surface plan failed validation: ${validation.errors.join("; ")}`;
    const trace = buildTrace({ rawData, extracted, model: ai.model, plan, validation });
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
    label: "Apply field/slot mapping",
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
  const trace = buildTrace({ rawData, extracted, model: ai.model, plan, validation, data });
  const renderPlan: A2UIRenderPlan = {
    selectedComponentId: template.componentId,
    viewType: template.surfaceConfig.viewType,
    score: plan.confidence ?? 0,
    reason: plan.reason ?? "AI surface planner selected the template.",
    fieldMapping: fieldMappingFromSlots(template, plan),
    isFallback: false,
    registryVersion: catalog.version,
    maxItems: template.surfaceConfig.maxItems,
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

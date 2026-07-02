import type { A2UIDerivedFieldType, A2UIRole } from "@/features/a2ui-template-poc/template-types";

export type PreprocessorWarning =
  | "empty_dataset"
  | "multiple_dataset_candidates"
  | "max_depth_reached"
  | "max_field_paths_reached"
  | "non_object_dataset"
  | "single_object_wrapped_as_dataset";

export type PreprocessorInput = {
  rawData: unknown;
  sourceId?: string;
  sourceKind?: "api_response" | "tool_result" | "sample";
  limits?: {
    maxDepth?: number;
    maxRowsToProfile?: number;
    maxSampleRows?: number;
    maxFieldPaths?: number;
    maxByteLength?: number;
  };
};

export type ObservedDatasetCandidate = {
  rawPath: string;
  plannerPath: string;
  kind: "root_array" | "nested_array" | "single_object";
  itemType: "object" | "primitive" | "mixed";
  rowCount: number;
  sampleSize: number;
  objectRowRatio: number;
  fieldRepeatability: number;
  depth: number;
  score: number;
  reasonCodes: string[];
  page?: number;
  pageSize?: number;
};

export type ObservedField = {
  sourcePath: string;
  rowPath: string;
  derivedSchemaPath: string;
  key: string;
  parentPath: string;
  depth: number;
  type: A2UIDerivedFieldType | "mixed";
  format?: "image-url" | "uri" | "date" | "datetime";
  roleCandidates: A2UIRole[];
  examples: unknown[];
  completeness: number;
  uniqueRatio?: number;
  nullCount: number;
  missingCount: number;
};

export type ObservedSource = {
  sourceId: string;
  sourceKind: "api_response" | "tool_result" | "sample";
  root: {
    type: "object" | "array" | "primitive" | "null";
    topLevelKeys: string[];
    maxDepth: number;
    byteLength: number;
  };
  datasetCandidates: ObservedDatasetCandidate[];
  selectedDataset?: ObservedDatasetCandidate;
  fields: ObservedField[];
  sampleRows: Record<string, unknown>[];
  maskedFields: string[];
  warnings: PreprocessorWarning[];
  truncated: boolean;
};

const sensitiveKeyPattern = /(secret|token|password|authorization|cookie|phone|email)/i;
const totalKeys = ["total", "totalCount", "count", "rowCount"] as const;
const pageKeys = ["page", "pageNo"] as const;
const pageSizeKeys = ["pageSize", "rowsPerPage"] as const;
const defaultLimits = {
  maxDepth: 12,
  maxRowsToProfile: 50,
  maxSampleRows: 3,
  maxFieldPaths: 80,
  maxByteLength: 60_000,
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function rootType(value: unknown): ObservedSource["root"]["type"] {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return "primitive";
}

function byteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value) ?? "null").length;
}

function stableString(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableString(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableString(record[key])}`)
    .join(",")}}`;
}

function pathFromSegments(segments: string[]) {
  return segments.length ? segments.join(".") : "$";
}

function pathDepth(path: string) {
  return path === "$" ? 0 : path.split(".").length;
}

function lastPathSegment(path: string) {
  return path.split(".").filter(Boolean).pop() ?? path;
}

function parentPath(path: string) {
  const parts = path.split(".").filter(Boolean);
  return parts.slice(0, -1).join(".");
}

function numberFromKeys(record: Record<string, unknown> | undefined, keys: readonly string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function valueAtRawPath(data: unknown, rawPath: string): unknown {
  if (rawPath === "$") return data;
  let current = data;
  for (const segment of rawPath.split(".")) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[segment];
  }
  return current;
}

export function getValueAtRowPath(row: Record<string, unknown>, rowPath: string): unknown {
  if (!rowPath) return row;
  let current: unknown = row;
  for (const segment of rowPath.split(".")) {
    if (Array.isArray(current)) {
      if (segment === "length") return current.length;
      if (segment === "first") {
        current = current[0];
        continue;
      }
      const index = Number.parseInt(segment, 10);
      if (Number.isFinite(index)) {
        current = current[index];
        continue;
      }
      return undefined;
    }
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[segment];
  }
  return current;
}

function scalarType(value: unknown): A2UIDerivedFieldType {
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

function fieldType(values: unknown[]): A2UIDerivedFieldType | "mixed" {
  const present = values.filter((value) => value !== undefined && value !== null);
  if (!present.length) return "unknown";
  const types = Array.from(new Set(present.map(scalarType)));
  return types.length === 1 ? types[0] : "mixed";
}

function fieldFormat(key: string, values: unknown[]) {
  const firstString = values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (!firstString) return undefined;
  if (/image|photo|thumbnail/i.test(key) || /\.(png|jpe?g|webp|gif|svg)$/i.test(firstString) || firstString.startsWith("/images/")) {
    return "image-url" as const;
  }
  if (/url|uri/i.test(key) || /^https?:\/\//i.test(firstString) || firstString.startsWith("/")) return "uri" as const;
  if (/^\d{4}-\d{2}-\d{2}T/.test(firstString)) return "datetime" as const;
  if (/^\d{4}-\d{2}-\d{2}/.test(firstString)) return "date" as const;
  return undefined;
}

function rolesForField(path: string, key: string, type: A2UIDerivedFieldType | "mixed", format?: string): A2UIRole[] {
  const roles: A2UIRole[] = [];
  const text = `${path} ${key}`;
  if (/^id$|Id$|_id$|assetId|eqp_id/i.test(key)) roles.push("id");
  if (/name|title|label|displayName|equipmentName|eqpNm|eqp_nm|assetDisplayName|assetName|명칭|제목/i.test(text)) roles.push("title", "label");
  if (/description|content|summary|설명|요약/i.test(text)) roles.push("content", "description");
  if (format === "image-url" || /image|photo|thumbnail|이미지|사진/i.test(text)) roles.push("image", "uri");
  else if (format === "uri" || /url|uri/i.test(text)) roles.push("uri");
  if (type === "boolean") roles.push("booleanFlag", "status");
  if (/status|state|phase|yn$|flag$|code$|oper|running|inspection|reserve|상태|여부/i.test(text)) roles.push("status");
  if (/category|type|분류/i.test(text)) roles.push("category");
  if (/location|zone|site|plant|factory|line/i.test(text)) roles.push("location");
  if (/updatedAt|last|dtm|date|time|timestamp|signal/i.test(text) || type === "date" || type === "datetime") roles.push("updatedAt", "time");
  if (type === "number" && /metric|telemetry|sensor|measure|temperature|temp|pressure|rpm|speed|vibration|current|voltage|power|load|rate|score|amount|size|count|total/i.test(text)) {
    roles.push("metric");
  }
  if (type === "number" && /progress|percent|percentage|completion|completeRate|completionRate|doneRatio|done_rate|진행률|완료율|달성률/i.test(text)) roles.push("progress", "metric");
  if (/priority|severity|urgency|rank|우선순위/i.test(text)) roles.push("priority");
  if (/assignee|owner|manager|담당|담당자|responsible|operator/i.test(text)) roles.push("assignee");
  if (/due|deadline|targetDate|target_at|dueAt|due_at|마감일/i.test(text)) roles.push("dueAt", "time");
  if (/actor|author|createdBy|created_by|user|requester/i.test(text)) roles.push("actor");
  if (/^(parentId|parent_id|parent|pid)$/i.test(key)) roles.push("parentId");
  if (/children|childNodes|nodes/i.test(text)) roles.push("children");
  if (/delta|change|diff|variance|growth/i.test(text)) roles.push("delta", "metric");
  if (/unit|currency|uom/i.test(text)) roles.push("unit");
  if (/action|href|link/i.test(text)) roles.push("action");
  return Array.from(new Set(roles));
}

function maskedValue(value: unknown, rowPath: string, maskedFields: Set<string>) {
  const key = lastPathSegment(rowPath);
  if (sensitiveKeyPattern.test(key)) {
    maskedFields.add(rowPath);
    return "[masked]";
  }
  return value;
}

function collectLeafPaths(value: unknown, prefix: string, output: Set<string>, depth: number, maxDepth: number, warnings: Set<PreprocessorWarning>) {
  if (depth > maxDepth) {
    warnings.add("max_depth_reached");
    return;
  }

  if (Array.isArray(value)) {
    if (prefix) output.add(`${prefix}.length`);
    const first = value.find((item) => item !== undefined && item !== null);
    if (first !== undefined && prefix) collectLeafPaths(first, `${prefix}.first`, output, depth + 1, maxDepth, warnings);
    return;
  }

  const record = asRecord(value);
  if (record) {
    const entries = Object.entries(record);
    if (!entries.length && prefix) output.add(prefix);
    for (const [key, child] of entries) {
      collectLeafPaths(child, prefix ? `${prefix}.${key}` : key, output, depth + 1, maxDepth, warnings);
    }
    return;
  }

  if (prefix) output.add(prefix);
}

function objectRows(value: unknown[]): Record<string, unknown>[] {
  return value.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
}

function leafPathSetForRows(rows: Record<string, unknown>[], maxDepth: number, warnings: Set<PreprocessorWarning>) {
  const result = new Set<string>();
  for (const row of rows) collectLeafPaths(row, "", result, 0, maxDepth, warnings);
  return result;
}

function fieldRepeatability(rows: Record<string, unknown>[], maxDepth: number, warnings: Set<PreprocessorWarning>) {
  if (!rows.length) return 0;
  const allPaths = Array.from(leafPathSetForRows(rows, maxDepth, warnings));
  if (!allPaths.length) return 0;
  const repeated = allPaths.filter((path) => rows.every((row) => getValueAtRowPath(row, path) !== undefined)).length;
  return repeated / allPaths.length;
}

function itemTypeForArray(items: unknown[]) {
  if (!items.length) return "mixed" as const;
  const objectCount = objectRows(items).length;
  if (objectCount === items.length) return "object" as const;
  if (objectCount === 0) return "primitive" as const;
  return "mixed" as const;
}

function pathHintScore(path: string) {
  const key = lastPathSegment(path);
  if (/items|rows|list|data|result|payload/i.test(key)) return 0.12;
  return 0;
}

function metadataPenalty(path: string) {
  return /metadata|debug|errors?|warnings?|logs?/i.test(path) ? 0.25 : 0;
}

function scoreCandidate(candidate: Omit<ObservedDatasetCandidate, "score" | "reasonCodes">, averageLeafFieldCount: number) {
  let score = 0;
  score += Math.min(0.22, candidate.rowCount / 50);
  score += candidate.objectRowRatio * 0.28;
  score += candidate.fieldRepeatability * 0.2;
  score += Math.min(0.18, averageLeafFieldCount / 30);
  score += pathHintScore(candidate.plannerPath);
  score -= Math.min(0.08, candidate.depth * 0.01);
  score -= metadataPenalty(candidate.plannerPath);
  if (candidate.kind === "single_object") score -= 0.08;
  return Math.max(0, Math.min(1, score));
}

function reasonCodesFor(candidate: ObservedDatasetCandidate) {
  const reasons: string[] = [];
  if (candidate.itemType === "object") reasons.push("array_object");
  if (candidate.kind === "single_object") reasons.push("single_object_fallback");
  if (candidate.fieldRepeatability > 0.5) reasons.push("has_repeated_leaf_fields");
  if (pathHintScore(candidate.plannerPath) > 0) reasons.push(`path_hint_${lastPathSegment(candidate.plannerPath)}`);
  if (metadataPenalty(candidate.plannerPath) > 0) reasons.push("metadata_path_penalty");
  if (!candidate.rowCount) reasons.push("empty_dataset");
  return reasons;
}

function collectArrayCandidates(
  value: unknown,
  segments: string[],
  parent: Record<string, unknown> | undefined,
  limits: typeof defaultLimits,
  warnings: Set<PreprocessorWarning>,
  candidates: ObservedDatasetCandidate[],
  rootValue: unknown,
) {
  if (segments.length > limits.maxDepth) {
    warnings.add("max_depth_reached");
    return;
  }

  if (Array.isArray(value)) {
    const rawPath = pathFromSegments(segments);
    const plannerPath = rawPath === "$" ? "items" : rawPath;
    const rows = objectRows(value).slice(0, limits.maxRowsToProfile);
    const leafPaths = leafPathSetForRows(rows, limits.maxDepth, warnings);
    const baseCandidate = {
      rawPath,
      plannerPath,
      kind: rawPath === "$" ? "root_array" as const : "nested_array" as const,
      itemType: itemTypeForArray(value),
      rowCount: numberFromKeys(parent, totalKeys) ?? value.length,
      sampleSize: Math.min(value.length, limits.maxRowsToProfile),
      objectRowRatio: value.length ? objectRows(value).length / value.length : 0,
      fieldRepeatability: fieldRepeatability(rows, limits.maxDepth, warnings),
      depth: pathDepth(rawPath),
      page: numberFromKeys(parent, pageKeys),
      pageSize: numberFromKeys(parent, pageSizeKeys),
    };
    const score = scoreCandidate(baseCandidate, leafPaths.size);
    const candidate: ObservedDatasetCandidate = { ...baseCandidate, score, reasonCodes: [] };
    candidate.reasonCodes = reasonCodesFor(candidate);
    candidates.push(candidate);
    return;
  }

  const record = asRecord(value);
  if (!record) return;
  if (value !== rootValue && metadataPenalty(pathFromSegments(segments)) > 0) return;
  for (const [key, child] of Object.entries(record)) {
    collectArrayCandidates(child, [...segments, key], record, limits, warnings, candidates, rootValue);
  }
}

function selectedCandidateFor(data: unknown, limits: typeof defaultLimits, warnings: Set<PreprocessorWarning>) {
  const candidates: ObservedDatasetCandidate[] = [];
  collectArrayCandidates(data, [], undefined, limits, warnings, candidates, data);

  if (!candidates.length) {
    const record = asRecord(data);
    if (record) {
      warnings.add("single_object_wrapped_as_dataset");
      const leafPaths = leafPathSetForRows([record], limits.maxDepth, warnings);
      const baseCandidate = {
        rawPath: "$",
        plannerPath: "items",
        kind: "single_object" as const,
        itemType: "object" as const,
        rowCount: 1,
        sampleSize: 1,
        objectRowRatio: 1,
        fieldRepeatability: 1,
        depth: 0,
      };
      const score = scoreCandidate(baseCandidate, leafPaths.size);
      const candidate: ObservedDatasetCandidate = { ...baseCandidate, score, reasonCodes: [] };
      candidate.reasonCodes = reasonCodesFor(candidate);
      candidates.push(candidate);
    }
  }

  candidates.sort((left, right) => right.score - left.score || right.objectRowRatio - left.objectRowRatio || right.rowCount - left.rowCount);
  if (candidates.length > 1) warnings.add("multiple_dataset_candidates");
  const selected = candidates[0];
  if (selected && selected.rowCount === 0) warnings.add("empty_dataset");
  if (selected && selected.itemType !== "object" && selected.kind !== "single_object") warnings.add("non_object_dataset");
  return { candidates, selected };
}

export function rowsFromObservedSource(rawData: unknown, observedSource: ObservedSource): Record<string, unknown>[] {
  const selected = observedSource.selectedDataset;
  if (!selected) return [];
  if (selected.kind === "single_object") {
    const record = asRecord(rawData);
    return record ? [record] : [];
  }
  const value = valueAtRawPath(rawData, selected.rawPath);
  return Array.isArray(value) ? objectRows(value) : [];
}

export function rowPathForSourcePath(observedSource: ObservedSource, sourcePath: string): string | undefined {
  return observedSource.fields.find((field) => field.sourcePath === sourcePath)?.rowPath;
}

export function fieldForSourcePath(observedSource: ObservedSource, sourcePath: string): ObservedField | undefined {
  return observedSource.fields.find((field) => field.sourcePath === sourcePath);
}

export function shapeFromObservedSource(observedSource: ObservedSource) {
  const selected = observedSource.selectedDataset;
  if (!selected) return "unknown";
  if (selected.kind === "single_object") return "object";
  if (selected.rawPath === "$") return selected.itemType === "object" ? "array<object>" : "array<primitive>";
  return `object{${selected.plannerPath}:array<${selected.itemType === "object" ? "object" : selected.itemType}>}`;
}

function fieldPathLimitScore(field: ObservedField) {
  const roleBonus = field.roleCandidates.length ? 0 : 1;
  return roleBonus + (1 - field.completeness) + field.depth / 100;
}

function buildObservedFields(rows: Record<string, unknown>[], selected: ObservedDatasetCandidate, limits: typeof defaultLimits, warnings: Set<PreprocessorWarning>) {
  const profileRows = rows.slice(0, limits.maxRowsToProfile);
  const fieldPaths = Array.from(leafPathSetForRows(profileRows, limits.maxDepth, warnings)).sort();
  const maskedFields = new Set<string>();
  const fields = fieldPaths.map((rowPath) => {
    const values = profileRows.map((row) => getValueAtRowPath(row, rowPath));
    const presentValues = values.filter((value) => value !== undefined);
    const key = lastPathSegment(rowPath);
    const type = fieldType(presentValues);
    const format = fieldFormat(key, presentValues);
    const examples = presentValues
      .filter((value) => value !== null)
      .slice(0, 5)
      .map((value) => maskedValue(value, rowPath, maskedFields));
    const uniqueValues = new Set(presentValues.map(stableString));
    const sourcePath = `${selected.plannerPath}[].${rowPath}`;
    const derivedSchemaPath = `${selected.plannerPath}.${rowPath}`;
    const missingCount = values.filter((value) => value === undefined).length;
    return {
      sourcePath,
      rowPath,
      derivedSchemaPath,
      key,
      parentPath: parentPath(rowPath),
      depth: pathDepth(rowPath),
      type,
      format,
      roleCandidates: rolesForField(rowPath, key, type, format),
      examples,
      completeness: profileRows.length ? (profileRows.length - missingCount) / profileRows.length : 0,
      uniqueRatio: presentValues.length ? uniqueValues.size / presentValues.length : undefined,
      nullCount: values.filter((value) => value === null).length,
      missingCount,
    } satisfies ObservedField;
  });

  fields.sort((left, right) => fieldPathLimitScore(left) - fieldPathLimitScore(right) || left.sourcePath.localeCompare(right.sourcePath));
  const truncated = fields.length > limits.maxFieldPaths;
  if (truncated) warnings.add("max_field_paths_reached");
  return {
    fields: fields.slice(0, limits.maxFieldPaths),
    maskedFields,
    truncated,
  };
}

function buildSampleRows(rows: Record<string, unknown>[], fields: ObservedField[], limits: typeof defaultLimits, maskedFields: Set<string>) {
  return rows.slice(0, limits.maxSampleRows).map((row) => {
    const sample: Record<string, unknown> = {};
    for (const field of fields) {
      const value = getValueAtRowPath(row, field.rowPath);
      if (value === undefined) continue;
      sample[field.sourcePath] = maskedValue(value, field.rowPath, maskedFields);
    }
    return sample;
  });
}

function maxDepthOf(value: unknown, depth = 0, maxDepth = defaultLimits.maxDepth): number {
  if (depth >= maxDepth) return depth;
  if (Array.isArray(value)) {
    return value.slice(0, 5).reduce<number>((max, item) => Math.max(max, maxDepthOf(item, depth + 1, maxDepth)), depth);
  }
  const record = asRecord(value);
  if (!record) return depth;
  return Object.values(record).reduce<number>((max, child) => Math.max(max, maxDepthOf(child, depth + 1, maxDepth)), depth);
}

export function preprocessUnknownApiResponse(input: PreprocessorInput): ObservedSource {
  const limits = { ...defaultLimits, ...(input.limits ?? {}) };
  const warnings = new Set<PreprocessorWarning>();
  const { candidates, selected } = selectedCandidateFor(input.rawData, limits, warnings);
  const rootRecord = asRecord(input.rawData);
  const preliminary: ObservedSource = {
    sourceId: input.sourceId ?? "unknown",
    sourceKind: input.sourceKind ?? "api_response",
    root: {
      type: rootType(input.rawData),
      topLevelKeys: rootRecord ? Object.keys(rootRecord).sort() : [],
      maxDepth: maxDepthOf(input.rawData, 0, limits.maxDepth),
      byteLength: byteLength(input.rawData),
    },
    datasetCandidates: candidates,
    selectedDataset: selected,
    fields: [],
    sampleRows: [],
    maskedFields: [],
    warnings: [],
    truncated: byteLength(input.rawData) > limits.maxByteLength,
  };
  const rows = rowsFromObservedSource(input.rawData, preliminary);
  const observedFields = selected ? buildObservedFields(rows, selected, limits, warnings) : { fields: [], maskedFields: new Set<string>(), truncated: false };
  const sampleRows = buildSampleRows(rows, observedFields.fields, limits, observedFields.maskedFields);

  return {
    ...preliminary,
    fields: observedFields.fields,
    sampleRows,
    maskedFields: Array.from(observedFields.maskedFields).sort(),
    warnings: Array.from(warnings).sort(),
    truncated: preliminary.truncated || observedFields.truncated || rows.length > limits.maxRowsToProfile,
  };
}

export function observedSourceFieldPaths(observedSource: ObservedSource) {
  return observedSource.fields.map((field) => field.sourcePath);
}

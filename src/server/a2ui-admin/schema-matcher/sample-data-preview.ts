import type { DerivedSchemaShape } from "./derived-schema-types";
import { preprocessUnknownApiResponse, rowsFromObservedSource } from "./unknown-api-response-preprocessor";

export type SampleDataPreview = {
  sourceId: string;
  sourceKind: "api_response" | "tool_result" | "sample" | "combined";
  shape: DerivedSchemaShape;
  primaryArrayPath?: string;
  rowCount: number;
  sampleSize: number;
  truncated: boolean;
  byteLength: number;
  maskedFields: string[];
  data: unknown;
};

const sensitiveKeyPattern = /(secret|token|password|authorization|cookie|phone|email)/i;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function setPath(value: unknown, path: string, nextValue: unknown): unknown {
  const record = asRecord(value);
  if (!record) return value;
  const parts = path.split(".");
  const clone: Record<string, unknown> = { ...record };
  let cursor = clone;
  for (const part of parts.slice(0, -1)) {
    const child = asRecord(cursor[part]) ?? {};
    const childClone = { ...child };
    cursor[part] = childClone;
    cursor = childClone;
  }
  cursor[parts[parts.length - 1]] = nextValue;
  return clone;
}

function rowsFromData(data: unknown): {
  rows: unknown[];
  shape: DerivedSchemaShape;
  primaryArrayPath?: string;
  rowCount: number;
} {
  const observedSource = preprocessUnknownApiResponse({ rawData: data });
  const selected = observedSource.selectedDataset;
  if (selected) {
    const rawRows = selected.kind === "single_object" ? rowsFromObservedSource(data, observedSource) : (selected.rawPath === "$" ? data : selected.rawPath.split(".").reduce<unknown>((current, key) => {
      const record = asRecord(current);
      return record ? record[key] : undefined;
    }, data));
    const rows = Array.isArray(rawRows) ? rawRows : rowsFromObservedSource(data, observedSource);
    return {
      rows,
      shape: selected.kind === "single_object" ? "object" : selected.itemType === "object" ? "array<object>" : "array<primitive>",
      primaryArrayPath: selected.kind === "nested_array" ? selected.plannerPath : undefined,
      rowCount: selected.rowCount,
    };
  }

  return {
    rows: [],
    shape: "unknown",
    rowCount: 0,
  };
}

function maskValue(value: unknown, path: string, maskedFields: Set<string>): unknown {
  const key = path.split(".").pop() ?? path;
  if (sensitiveKeyPattern.test(key)) {
    maskedFields.add(path);
    return "[masked]";
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => maskValue(item, `${path}.${index}`, maskedFields));
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      next[childKey] = maskValue(childValue, path ? `${path}.${childKey}` : childKey, maskedFields);
    }
    return next;
  }

  return value;
}

function withRows(data: unknown, rows: unknown[], primaryArrayPath?: string) {
  if (primaryArrayPath && data && typeof data === "object" && !Array.isArray(data)) return setPath(data, primaryArrayPath, rows);
  if (Array.isArray(data)) return rows;
  return rows[0] ?? null;
}

function byteLength(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function buildSampleDataPreview(
  data: unknown,
  options: {
    sourceId?: string;
    sourceKind?: SampleDataPreview["sourceKind"];
    rowLimit?: number;
    byteLimit?: number;
  } = {},
): SampleDataPreview {
  const rowLimit = options.rowLimit ?? 10;
  const byteLimit = options.byteLimit ?? 20_000;
  const { rows, shape, primaryArrayPath, rowCount } = rowsFromData(data);
  const maskedFields = new Set<string>();
  let sampleRows = rows.slice(0, rowLimit).map((row, index) => maskValue(row, primaryArrayPath ? `${primaryArrayPath}.${index}` : String(index), maskedFields));
  let previewData = withRows(maskValue(data, "", maskedFields), sampleRows, primaryArrayPath);

  while (sampleRows.length > 1 && byteLength(previewData) > byteLimit) {
    sampleRows = sampleRows.slice(0, -1);
    previewData = withRows(maskValue(data, "", maskedFields), sampleRows, primaryArrayPath);
  }

  const finalByteLength = byteLength(previewData);
  return {
    sourceId: options.sourceId ?? "unknown",
    sourceKind: options.sourceKind ?? "api_response",
    shape,
    primaryArrayPath,
    rowCount,
    sampleSize: sampleRows.length,
    truncated: rows.length > sampleRows.length || finalByteLength > byteLimit,
    byteLength: finalByteLength,
    maskedFields: Array.from(maskedFields).sort(),
    data: previewData,
  };
}

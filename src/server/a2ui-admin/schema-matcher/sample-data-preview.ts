import type { DerivedSchemaShape } from "./derived-schema-types";

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

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
  if (Array.isArray(data)) {
    const objectRows = data.filter((item) => Boolean(item && typeof item === "object" && !Array.isArray(item)));
    return {
      rows: data,
      shape: objectRows.length === data.length ? "array<object>" : "array<primitive>",
      rowCount: data.length,
    };
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const candidates: Array<{ path: string; parent: Record<string, unknown>; key: string }> = [
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
      if (!Array.isArray(candidate.parent[candidate.key])) continue;
      const rows = candidate.parent[candidate.key] as unknown[];
      return {
        rows,
        shape: "array<object>",
        primaryArrayPath: candidate.path,
        rowCount:
          numberFrom(candidate.parent.total) ??
          numberFrom(candidate.parent.totalCount) ??
          numberFrom(record.total) ??
          numberFrom(record.totalCount) ??
          rows.length,
      };
    }

    return {
      rows: [record],
      shape: "object",
      rowCount: 1,
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

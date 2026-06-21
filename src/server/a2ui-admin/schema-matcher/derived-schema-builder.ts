import type { A2UIDataProfile, A2UIRole, FieldProfile } from "@/features/a2ui-template-poc/template-types";
import { buildA2UIDataProfile } from "@/features/a2ui-template-poc/schema-profiler";
import type { DerivedSchema, DerivedSchemaCapabilities, DerivedSchemaField, DerivedSchemaShape } from "./derived-schema-types";
import type { SampleDataPreview } from "./sample-data-preview";
import { buildSampleDataPreview } from "./sample-data-preview";
import { canonicalPath } from "./path-utils";

function firstPresent(values: unknown[]) {
  return values.find((value) => value !== null && value !== undefined);
}

function fieldType(key: string, examples: unknown[]): DerivedSchemaField["type"] {
  const first = firstPresent(examples);
  if (typeof first === "boolean") return "boolean";
  if (typeof first === "number") return "number";
  if (Array.isArray(first)) return "array";
  if (first && typeof first === "object") return "object";
  if (typeof first === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(first)) return "datetime";
    if (/^\d{4}-\d{2}-\d{2}/.test(first)) return "date";
    return "string";
  }
  return "unknown";
}

function fieldFormat(key: string, examples: unknown[]) {
  const first = firstPresent(examples);
  if (typeof first !== "string") return undefined;
  if (/image|photo|thumbnail/i.test(key) || /\.(png|jpe?g|webp|gif|svg)$/i.test(first) || first.startsWith("/images/")) {
    return "image-url";
  }
  if (/url|uri/i.test(key) || /^https?:\/\//i.test(first) || first.startsWith("/")) return "uri";
  if (/^\d{4}-\d{2}-\d{2}T/.test(first)) return "datetime";
  if (/^\d{4}-\d{2}-\d{2}/.test(first)) return "date";
  return undefined;
}

function inferRoles(key: string, type: DerivedSchemaField["type"], format?: string): A2UIRole[] {
  const roles: A2UIRole[] = [];
  if (/^id$|Id$/.test(key)) roles.push("id");
  if (/name|title|equipmentName/i.test(key)) roles.push("title", "label");
  if (/description|content|summary/i.test(key)) roles.push("content", "description");
  if (format === "image-url" || /image|photo|thumbnail/i.test(key)) roles.push("image", "uri");
  else if (format === "uri" || /url|uri/i.test(key)) roles.push("uri");
  if (type === "boolean") roles.push("booleanFlag", "status");
  if (/status|state|phase/i.test(key)) roles.push("status");
  if (/category|type/i.test(key)) roles.push("category");
  if (/location|zone|site/i.test(key)) roles.push("location");
  if (/updatedAt|date|time/i.test(key) || type === "date" || type === "datetime") roles.push("updatedAt", "time");
  if (type === "number" && /count|total|rate|score|metric|amount|size/i.test(key)) roles.push("metric");
  if (/version/i.test(key)) roles.push("version");
  if (/environment|env/i.test(key)) roles.push("environment");
  if (/artifact|build|release/i.test(key)) roles.push("artifact");
  if (/action|href|link/i.test(key)) roles.push("action");
  return Array.from(new Set(roles));
}

function rowsFromData(data: unknown, primaryArrayPath?: string): Record<string, unknown>[] {
  if (primaryArrayPath && data && typeof data === "object" && !Array.isArray(data)) {
    const rows = primaryArrayPath
      .split(".")
      .reduce<unknown>((current, key) => (current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined), data);
    return Array.isArray(rows)
      ? rows.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      : [];
  }
  if (Array.isArray(data)) {
    return data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }
  if (data && typeof data === "object") return [data as Record<string, unknown>];
  return [];
}

function fieldsFromRows(rows: Record<string, unknown>[], primaryArrayPath?: string): DerivedSchemaField[] {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return keys.map((key) => {
    const examples = rows.slice(0, 5).map((row) => row[key]).filter((value) => value !== undefined);
    const type = fieldType(key, examples);
    const format = fieldFormat(key, examples);
    const roles = inferRoles(key, type, format);
    const values = examples.map((value) => JSON.stringify(value));
    const uniqueValues = new Set(values);
    const path = primaryArrayPath ? `${primaryArrayPath}.${key}` : key;
    return {
      path,
      key,
      type,
      role: roles[0],
      roles,
      format,
      examples,
      cardinality: uniqueValues.size,
      uniqueRatio: examples.length ? uniqueValues.size / examples.length : undefined,
      enumValues: uniqueValues.size > 0 && uniqueValues.size <= 8 ? Array.from(uniqueValues).map((value) => JSON.parse(value) as string) : undefined,
    };
  });
}

function capabilities(fields: DerivedSchemaField[]): DerivedSchemaCapabilities {
  return {
    hasImages: fields.some((field) => field.roles.includes("image")),
    hasBooleans: fields.some((field) => field.type === "boolean" || field.roles.includes("booleanFlag")),
    hasStatus: fields.some((field) => field.roles.includes("status")),
    hasTimeField: fields.some((field) => field.roles.includes("time") || field.type === "date" || field.type === "datetime"),
    hasNumericMetrics: fields.some((field) => field.roles.includes("metric") || field.type === "number"),
    hasCategories: fields.some((field) => field.roles.includes("category")),
    hasNestedObjects: fields.some((field) => field.type === "object" || field.type === "array"),
    hasActions: fields.some((field) => field.roles.includes("action")),
  };
}

function profileTypeToDerived(field: FieldProfile): DerivedSchemaField["type"] {
  if (field.type === "image-url") return "string";
  return field.type;
}

export function derivedSchemaFromDataProfile(
  profile: A2UIDataProfile,
  options: { sourceId?: string; sourceKind?: DerivedSchema["sourceKind"] } = {},
): DerivedSchema {
  const fields = profile.fields.map((field) => {
    const type = profileTypeToDerived(field);
    const roles = field.roleCandidates;
    return {
      path: canonicalPath(field.path),
      key: field.key,
      type,
      role: roles[0],
      roles,
      format: field.type === "image-url" ? "image-url" : field.type === "date" ? "date" : undefined,
      examples: field.examples,
    };
  });
  return {
    sourceId: options.sourceId ?? "data-profile",
    sourceKind: options.sourceKind ?? "sample",
    shape: profile.shape as DerivedSchemaShape,
    primaryArrayPath: profile.listPath,
    rowCount: profile.rowCount,
    sampleSize: profile.rowCount,
    fields,
    capabilities: capabilities(fields),
  };
}

export function buildDerivedSchema(
  data: unknown,
  options: {
    sourceId?: string;
    sourceKind?: DerivedSchema["sourceKind"];
    sampleDataPreview?: SampleDataPreview;
  } = {},
): DerivedSchema {
  const preview = options.sampleDataPreview ?? buildSampleDataPreview(data, { sourceId: options.sourceId, sourceKind: "sample" });
  const previewData = preview.data ?? data;
  const rows = rowsFromData(previewData, preview.primaryArrayPath);
  const fields = fieldsFromRows(rows, preview.primaryArrayPath);
  return {
    sourceId: options.sourceId ?? preview.sourceId,
    sourceKind: options.sourceKind ?? "api_response",
    shape: preview.shape,
    primaryArrayPath: preview.primaryArrayPath,
    rowCount: preview.rowCount,
    sampleSize: preview.sampleSize,
    fields,
    capabilities: capabilities(fields),
  };
}

export function buildProfileAndDerivedSchema(
  data: unknown,
  options: { sourceId?: string; sampleDataPreview?: SampleDataPreview } = {},
) {
  const profile = buildA2UIDataProfile(data);
  const derivedSchema = buildDerivedSchema(data, {
    sourceId: options.sourceId,
    sampleDataPreview: options.sampleDataPreview,
  });
  return { profile, derivedSchema };
}

import type { A2UIDataProfile, FieldProfile } from "@/features/a2ui-template-poc/template-types";
import { buildA2UIDataProfile } from "@/features/a2ui-template-poc/schema-profiler";
import type { DerivedSchema, DerivedSchemaCapabilities, DerivedSchemaField, DerivedSchemaShape } from "./derived-schema-types";
import type { SampleDataPreview } from "./sample-data-preview";
import { buildSampleDataPreview } from "./sample-data-preview";
import { canonicalPath } from "./path-utils";
import { preprocessUnknownApiResponse } from "./unknown-api-response-preprocessor";

function capabilities(fields: DerivedSchemaField[]): DerivedSchemaCapabilities {
  return {
    hasImages: fields.some((field) => field.roles.includes("image")),
    hasBooleans: fields.some((field) => field.type === "boolean" || field.roles.includes("booleanFlag")),
    hasStatus: fields.some((field) => field.roles.includes("status")),
    hasTimeField: fields.some((field) => field.roles.includes("time") || field.type === "date" || field.type === "datetime"),
    hasNumericMetrics: fields.some((field) => field.roles.includes("metric") || field.type === "number"),
    hasCategories: fields.some((field) => field.roles.includes("category")),
    hasNestedObjects: fields.some((field) => field.type === "object" || field.type === "array"),
    hasProgress: fields.some((field) => field.roles.includes("progress")),
    hasPriority: fields.some((field) => field.roles.includes("priority")),
    hasAssignee: fields.some((field) => field.roles.includes("assignee")),
    hasDueDate: fields.some((field) => field.roles.includes("dueAt")),
    hasTree: fields.some((field) => field.roles.includes("children") || field.roles.includes("parentId")),
    hasDelta: fields.some((field) => field.roles.includes("delta")),
    hasUnits: fields.some((field) => field.roles.includes("unit")),
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
  const observedSource = preprocessUnknownApiResponse({
    rawData: previewData,
    sourceId: options.sourceId ?? preview.sourceId,
    sourceKind: "api_response",
  });
  const fields = observedSource.fields.map((field) => {
    const type = field.type === "mixed" ? "unknown" : field.type;
    const values = field.examples.map((value) => JSON.stringify(value));
    const uniqueValues = new Set(values);
    return {
      path: field.derivedSchemaPath,
      key: field.key,
      type,
      role: field.roleCandidates[0],
      roles: field.roleCandidates,
      format: field.format,
      examples: field.examples,
      cardinality: uniqueValues.size,
      uniqueRatio: field.uniqueRatio,
      enumValues: uniqueValues.size > 0 && uniqueValues.size <= 8 ? Array.from(uniqueValues).map((value) => JSON.parse(value) as string) : undefined,
    };
  });
  return {
    sourceId: options.sourceId ?? preview.sourceId,
    sourceKind: options.sourceKind ?? "api_response",
    shape: preview.shape,
    primaryArrayPath: preview.primaryArrayPath ?? observedSource.selectedDataset?.plannerPath,
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

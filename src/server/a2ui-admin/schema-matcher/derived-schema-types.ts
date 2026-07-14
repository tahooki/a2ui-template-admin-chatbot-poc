import type { A2UIDerivedFieldType, A2UIRole } from "@/features/a2ui-core/template-types";

export type DerivedSchemaShape = "object" | "array<object>" | "array<primitive>" | "unknown";

export type DerivedSchemaCapabilities = {
  hasImages: boolean;
  hasBooleans: boolean;
  hasStatus: boolean;
  hasTimeField: boolean;
  hasNumericMetrics: boolean;
  hasCategories: boolean;
  hasNestedObjects: boolean;
  hasProgress: boolean;
  hasPriority: boolean;
  hasAssignee: boolean;
  hasDueDate: boolean;
  hasTimeRange: boolean;
  hasTree: boolean;
  hasDelta: boolean;
  hasUnits: boolean;
  hasActions: boolean;
};

export type DerivedSchemaField = {
  path: string;
  key: string;
  type: A2UIDerivedFieldType;
  role?: A2UIRole;
  roles: A2UIRole[];
  title?: string;
  description?: string;
  format?: string;
  examples: unknown[];
  cardinality?: number;
  uniqueRatio?: number;
  enumValues?: string[];
};

export type DerivedSchema = {
  sourceId: string;
  sourceKind: "tool_result" | "api_response" | "sample" | "facts" | "combined";
  shape: DerivedSchemaShape;
  primaryArrayPath?: string;
  rowCount?: number;
  sampleSize?: number;
  fields: DerivedSchemaField[];
  capabilities: DerivedSchemaCapabilities;
};

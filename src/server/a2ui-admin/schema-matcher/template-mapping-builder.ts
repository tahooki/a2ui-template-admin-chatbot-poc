import type {
  A2UIRenderPlan,
  A2UIRole,
  A2UITemplateInputSchema,
  A2UITemplateRegistration,
  A2UITemplateSlot,
  A2UIMappingDecision,
  FieldMapping,
} from "@/features/a2ui-template-poc/template-types";
import type { DerivedSchema, DerivedSchemaField } from "./derived-schema-types";
import { canonicalPath, normalizeText, rendererPath } from "./path-utils";

function fieldMatchesSlot(field: DerivedSchemaField, slot: A2UITemplateSlot) {
  const typeMatch = slot.acceptsTypes.includes(field.type);
  const roleMatch = slot.acceptsRoles.some((role) => field.roles.includes(role));
  const formatMatch = !slot.acceptsFormats?.length || (field.format ? slot.acceptsFormats.includes(field.format) : false);
  return typeMatch && roleMatch && formatMatch;
}

function hintScore(field: DerivedSchemaField, hints: string[] = [], query = "") {
  const key = normalizeText(field.key);
  const hintHit = hints.some((hint) => key === normalizeText(hint) || key.includes(normalizeText(hint))) ? 4 : 0;
  const queryHit = query && normalizeText(query).includes(key) ? 1 : 0;
  return hintHit + queryHit;
}

function fieldsForSlot({
  slot,
  derivedSchema,
  hints,
  query,
}: {
  slot: A2UITemplateSlot;
  derivedSchema: DerivedSchema;
  hints?: string[];
  query?: string;
}) {
  return derivedSchema.fields
    .filter((field) => fieldMatchesSlot(field, slot))
    .sort((a, b) => hintScore(b, hints, query) - hintScore(a, hints, query) || a.path.localeCompare(b.path));
}

function roleHints(template: A2UITemplateRegistration, role: string) {
  return template.schemaSpec.fieldHints?.[role] ?? [];
}

function firstFieldByRoles(derivedSchema: DerivedSchema, roles: string[], hints: string[] = [], query = "") {
  return derivedSchema.fields
    .filter((field) => roles.some((role) => field.roles.includes(role as A2UIRole)))
    .sort((a, b) => hintScore(b, hints, query) - hintScore(a, hints, query) || a.path.localeCompare(b.path))[0];
}

export function buildTemplateMappingDecision({
  template,
  inputSchema,
  derivedSchema,
  query,
}: {
  template: A2UITemplateRegistration;
  inputSchema: A2UITemplateInputSchema;
  derivedSchema: DerivedSchema;
  query: string;
}): A2UIMappingDecision {
  const missingSlots: string[] = [];
  const mappings: A2UIMappingDecision["mappings"] = [];

  for (const slot of [...inputSchema.requiredSlots, ...(inputSchema.optionalSlots ?? [])]) {
    const sources = fieldsForSlot({
      slot,
      derivedSchema,
      hints: roleHints(template, slot.acceptsRoles[0]),
      query,
    });
    const minCount = slot.minCount ?? 1;
    if (sources.length < minCount) {
      if (slot.required) missingSlots.push(slot.slot);
      continue;
    }
    const selectedSources = sources.slice(0, Math.max(minCount, 1));
    for (const source of selectedSources) {
      mappings.push({
        slot: slot.slot,
        sourcePath: rendererPath(source.path),
        transform: "none",
      });
    }
  }

  return {
    templateId: template.componentId,
    confidence: missingSlots.length ? 0.45 : 0.9,
    reason: missingSlots.length ? "required slot mapping is incomplete" : "deterministic role/type mapping completed",
    mappings,
    missingSlots,
  };
}

function sourceForSlot(mapping: A2UIMappingDecision | undefined, slotMatcher: (slot: string) => boolean) {
  return mapping?.mappings.find((item) => slotMatcher(item.slot))?.sourcePath;
}

function sourcesForSlot(mapping: A2UIMappingDecision | undefined, slotMatcher: (slot: string) => boolean) {
  return mapping?.mappings.filter((item) => slotMatcher(item.slot)).map((item) => item.sourcePath) ?? [];
}

export function fieldMappingFromDecision({
  template,
  derivedSchema,
  mapping,
  query,
}: {
  template: A2UITemplateRegistration;
  derivedSchema: DerivedSchema;
  mapping?: A2UIMappingDecision;
  query: string;
}): FieldMapping {
  const title =
    sourceForSlot(mapping, (slot) => /title/i.test(slot)) ||
    template.surfaceConfig.titleBinding ||
    rendererPath(firstFieldByRoles(derivedSchema, ["title", "label"], roleHints(template, "title"), query)?.path ?? "");
  const content =
    sourceForSlot(mapping, (slot) => /description|content/i.test(slot)) ||
    template.surfaceConfig.contentBinding ||
    template.surfaceConfig.descriptionBinding ||
    rendererPath(firstFieldByRoles(derivedSchema, ["content", "description"], roleHints(template, "content"), query)?.path ?? "");
  const image =
    sourceForSlot(mapping, (slot) => /image/i.test(slot)) ||
    template.surfaceConfig.imageBinding ||
    rendererPath(firstFieldByRoles(derivedSchema, ["image"], roleHints(template, "image"), query)?.path ?? "");
  const mappedBooleanFlags = sourcesForSlot(mapping, (slot) => /status|boolean|flag/i.test(slot));
  const mappedMetrics = sourcesForSlot(mapping, (slot) => /metric/i.test(slot));
  let booleanFlags = mappedBooleanFlags;
  if (booleanFlags.length === 0 && template.surfaceConfig.viewType === "statusBooleanList" && template.surfaceConfig.statusBindings?.length) {
    booleanFlags = template.surfaceConfig.statusBindings;
  }
  if (booleanFlags.length === 0) {
    booleanFlags = derivedSchema.fields
      .filter((field) => field.type === "boolean" || field.roles.includes("booleanFlag"))
      .map((field) => rendererPath(field.path));
  }
  let metrics = mappedMetrics;
  if (metrics.length === 0 && template.surfaceConfig.viewType === "telemetryStatusTable" && template.surfaceConfig.metricBindings?.length) {
    metrics = template.surfaceConfig.metricBindings;
  }
  if (metrics.length === 0) {
    metrics = derivedSchema.fields
      .filter((field) => field.type === "number" || field.roles.includes("metric"))
      .map((field) => rendererPath(field.path));
  }

  return {
    title: title || undefined,
    content: content || undefined,
    image: image || undefined,
    booleanFlags,
    metrics,
  };
}

export function renderPlanFromMapping({
  template,
  registryVersion,
  score,
  reason,
  derivedSchema,
  mapping,
  query,
  candidates,
  strategy = "derived_schema",
}: {
  template: A2UITemplateRegistration;
  registryVersion: number;
  score: number;
  reason: string;
  derivedSchema: DerivedSchema;
  mapping?: A2UIMappingDecision;
  query: string;
  candidates?: A2UIRenderPlan["candidates"];
  strategy?: NonNullable<A2UIRenderPlan["strategy"]>;
}): A2UIRenderPlan {
  return {
    selectedComponentId: template.componentId,
    viewType: template.surfaceConfig.viewType,
    score,
    reason,
    fieldMapping: fieldMappingFromDecision({ template, derivedSchema, mapping, query }),
    isFallback: false,
    registryVersion,
    maxItems: template.surfaceConfig.maxItems,
    strategy,
    candidates,
    mapping,
  };
}

export function hasMappedPath(derivedSchema: DerivedSchema, sourcePath: string) {
  const source = canonicalPath(sourcePath);
  return derivedSchema.fields.some((field) => canonicalPath(field.path) === source);
}

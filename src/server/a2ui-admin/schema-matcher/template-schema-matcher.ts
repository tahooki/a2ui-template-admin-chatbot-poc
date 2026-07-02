import type {
  A2UICandidateTrace,
  A2UITemplateInputSchema,
  A2UITemplateRegistration,
  A2UITemplateSlot,
} from "@/features/a2ui-template-poc/template-types";
import type { DerivedSchema, DerivedSchemaField } from "./derived-schema-types";
import { normalizeTemplateInputSchema } from "./template-input-schema-adapter";
import { buildTemplateMappingDecision, renderPlanFromMapping } from "./template-mapping-builder";
import { validateTemplateMapping } from "./template-mapping-validator";
import { textMatches } from "./path-utils";

export const MATCHER_RENDER_THRESHOLD = 0.72;

type SlotStats = {
  requiredCoverage: number;
  optionalCoverage: number;
  typeCompatibility: number;
  roleCompatibility: number;
  missingRequiredSlots: string[];
};

function fieldMatchesType(field: DerivedSchemaField, slot: A2UITemplateSlot) {
  return slot.acceptsTypes.includes(field.type);
}

function isBroadScalarSlot(slot: A2UITemplateSlot) {
  return /columns|fields/i.test(slot.slot);
}

function fieldMatchesRole(field: DerivedSchemaField, slot: A2UITemplateSlot) {
  if (isBroadScalarSlot(slot)) return true;
  return slot.acceptsRoles.some((role) => field.roles.includes(role));
}

function fieldMatchesFormat(field: DerivedSchemaField, slot: A2UITemplateSlot) {
  return !slot.acceptsFormats?.length || Boolean(field.format && slot.acceptsFormats.includes(field.format));
}

function fieldsForSlot(fields: DerivedSchemaField[], slot: A2UITemplateSlot) {
  return fields.filter((field) => fieldMatchesType(field, slot) && fieldMatchesRole(field, slot) && fieldMatchesFormat(field, slot));
}

function coverage(slots: A2UITemplateSlot[], fields: DerivedSchemaField[]) {
  if (!slots.length) return 1;
  const matched = slots.filter((slot) => fieldsForSlot(fields, slot).length >= (slot.minCount ?? 1)).length;
  return matched / slots.length;
}

function compatibility(slots: A2UITemplateSlot[], fields: DerivedSchemaField[], predicate: (field: DerivedSchemaField, slot: A2UITemplateSlot) => boolean) {
  if (!slots.length) return 1;
  const matched = slots.filter((slot) => fields.some((field) => predicate(field, slot))).length;
  return matched / slots.length;
}

function slotStats(inputSchema: A2UITemplateInputSchema, derivedSchema: DerivedSchema): SlotStats {
  const requiredSlots = inputSchema.requiredSlots;
  const optionalSlots = inputSchema.optionalSlots ?? [];
  return {
    requiredCoverage: coverage(requiredSlots, derivedSchema.fields),
    optionalCoverage: coverage(optionalSlots, derivedSchema.fields),
    typeCompatibility: compatibility(requiredSlots, derivedSchema.fields, fieldMatchesType),
    roleCompatibility: compatibility(requiredSlots, derivedSchema.fields, fieldMatchesRole),
    missingRequiredSlots: requiredSlots
      .filter((slot) => fieldsForSlot(derivedSchema.fields, slot).length < (slot.minCount ?? 1))
      .map((slot) => slot.slot),
  };
}

function capabilityScore(inputSchema: A2UITemplateInputSchema, derivedSchema: DerivedSchema) {
  const capabilities = inputSchema.accepts.capabilities ?? {};
  const entries = Object.entries(capabilities).filter(([, required]) => required === true);
  if (!entries.length) return { score: 1, missing: [] as string[] };
  const missing = entries
    .filter(([key]) => !derivedSchema.capabilities[key as keyof DerivedSchema["capabilities"]])
    .map(([key]) => key);
  return {
    score: (entries.length - missing.length) / entries.length,
    missing,
  };
}

function rowCountScore(inputSchema: A2UITemplateInputSchema, derivedSchema: DerivedSchema) {
  const rowCount = derivedSchema.rowCount ?? 0;
  if (inputSchema.accepts.minRows !== undefined && rowCount < inputSchema.accepts.minRows) return 0;
  if (inputSchema.accepts.maxRows !== undefined && rowCount > inputSchema.accepts.maxRows) return 0;
  return 1;
}

function queryHintScore(template: A2UITemplateRegistration, inputSchema: A2UITemplateInputSchema, query: string) {
  const hintTerms = [
    ...(template.schemaSpec.intentKeywords ?? []),
    ...(inputSchema.selectionHints?.queryKeywords ?? []),
    ...(inputSchema.selectionHints?.bestFor ?? []),
    template.selectionGuide,
    template.title,
  ];
  const hits = textMatches(query, hintTerms);
  return Math.min(1, hits / 2);
}

function scoreCandidate(template: A2UITemplateRegistration, inputSchema: A2UITemplateInputSchema, derivedSchema: DerivedSchema, query: string) {
  const shapeScore = inputSchema.accepts.shape.includes(derivedSchema.shape) ? 1 : 0;
  const capabilities = capabilityScore(inputSchema, derivedSchema);
  const slots = slotStats(inputSchema, derivedSchema);
  const rowScore = rowCountScore(inputSchema, derivedSchema);
  const hintScore = queryHintScore(template, inputSchema, query);
  const priorityScore = Math.max(0, Math.min(1, (inputSchema.selectionHints?.priority ?? 1) / 10));
  const breakdown = {
    shapeScore,
    capabilityScore: capabilities.score,
    requiredSlotCoverage: slots.requiredCoverage,
    optionalSlotCoverage: slots.optionalCoverage,
    typeCompatibility: slots.typeCompatibility,
    roleCompatibility: slots.roleCompatibility,
    rowCountSuitability: rowScore,
    intentAndQueryHint: hintScore,
    priorityScore,
  };
  const score =
    breakdown.shapeScore * 0.15 +
    breakdown.capabilityScore * 0.15 +
    breakdown.requiredSlotCoverage * 0.3 +
    breakdown.optionalSlotCoverage * 0.1 +
    breakdown.typeCompatibility * 0.1 +
    breakdown.roleCompatibility * 0.1 +
    breakdown.rowCountSuitability * 0.05 +
    breakdown.intentAndQueryHint * 0.03 +
    breakdown.priorityScore * 0.02;

  const rejectionReasons: string[] = [];
  if (template.status !== "registered") rejectionReasons.push("Template is not registered");
  if (!shapeScore) rejectionReasons.push(`Shape ${derivedSchema.shape} is not accepted`);
  if (capabilities.missing.length) rejectionReasons.push(`Missing capability: ${capabilities.missing.join(", ")}`);
  if (!rowScore) rejectionReasons.push("Row count is outside accepted range");
  if (slots.missingRequiredSlots.length) rejectionReasons.push(`Missing required slots: ${slots.missingRequiredSlots.join(", ")}`);

  return {
    score,
    breakdown,
    rejectionReasons,
    slots,
  };
}

function uniqueReasons(reasons: string[]) {
  return Array.from(new Set(reasons.filter(Boolean)));
}

export function matchA2UITemplate({
  query,
  derivedSchema,
  templates,
  registryVersion,
}: {
  query: string;
  derivedSchema: DerivedSchema;
  templates: A2UITemplateRegistration[];
  registryVersion: number;
}) {
  const evaluated = templates
    .filter((template) => template.componentId !== "simpleTextList")
    .map((template) => {
      const normalized = normalizeTemplateInputSchema(template);
      const inputSchema = normalized.inputSchema as A2UITemplateInputSchema;
      const scored = scoreCandidate(normalized, inputSchema, derivedSchema, query);
      const mapping = buildTemplateMappingDecision({
        template: normalized,
        inputSchema,
        derivedSchema,
        query,
      });
      const mappingValidation = validateTemplateMapping(mapping, derivedSchema);
      const rejected =
        scored.rejectionReasons.length > 0 ||
        scored.score < MATCHER_RENDER_THRESHOLD ||
        scored.slots.requiredCoverage < 1 ||
        !mappingValidation.ok;
      const rejectionReasons = uniqueReasons([
        ...scored.rejectionReasons,
        ...(scored.score < MATCHER_RENDER_THRESHOLD ? [`Score below threshold: ${scored.score.toFixed(2)}`] : []),
        ...mappingValidation.errors,
      ]);
      const rejectionReason = rejectionReasons.join("; ");
      const trace: A2UICandidateTrace = {
        templateId: normalized.componentId,
        score: Number(scored.score.toFixed(4)),
        reason: rejected ? rejectionReason : "Template inputSchema matched derived schema",
        rejected,
        rejectionReason: rejected ? rejectionReason : undefined,
        breakdown: scored.breakdown,
      };
      return {
        template: normalized,
        inputSchema,
        mapping,
        trace,
      };
    })
    .sort((a, b) => b.trace.score - a.trace.score);

  const selected = evaluated.find((candidate) => !candidate.trace.rejected);
  if (!selected) {
    return {
      mode: "text_fallback" as const,
      reason: "No registered A2UI template matched the derived schema.",
      candidates: evaluated.map((candidate) => candidate.trace),
    };
  }

  const renderPlan = renderPlanFromMapping({
    template: selected.template,
    registryVersion,
    score: selected.trace.score,
    reason: selected.trace.reason,
    derivedSchema,
    mapping: selected.mapping,
    query,
    candidates: evaluated.map((candidate) => candidate.trace),
    strategy: "derived_schema",
  });

  return {
    mode: "render_surface" as const,
    template: selected.template,
    templateId: selected.template.componentId,
    reason: selected.trace.reason,
    score: selected.trace.score,
    mapping: selected.mapping,
    renderPlan,
    candidates: evaluated.map((candidate) => candidate.trace),
  };
}

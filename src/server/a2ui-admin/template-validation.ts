import type { A2UITemplateRegistration } from "@/features/a2ui-core/template-types";

export function templateFromRequestBody(body: unknown): A2UITemplateRegistration | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const candidate = record.template ?? record;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return candidate as A2UITemplateRegistration;
}

export function validateTemplateRegistration(template: A2UITemplateRegistration | null) {
  if (!template) return "Template body is required.";
  if (!template.componentId?.trim()) return "Component ID is required.";
  if (!template.title?.trim()) return "Title is required.";
  if (!template.description?.trim()) return "Description is required.";
  if (!template.selectionGuide?.trim()) return "Selection guide is required.";
  if (!template.schemaSpec || typeof template.schemaSpec !== "object") return "Schema spec is required.";
  if (!template.surfaceConfig || typeof template.surfaceConfig !== "object") return "Surface config is required.";
  if (!Array.isArray(template.schemaSpec.requiredRoles)) return "Schema spec requiredRoles must be an array.";
  if (!template.surfaceConfig.viewType) return "Surface config viewType is required.";
  if (!template.surfaceConfig.titleBinding?.trim()) return "Surface config titleBinding is required.";
  if (template.inputSchema) {
    if (template.inputSchema.schemaVersion !== "2026-06-11") return "Input schema version must be 2026-06-11.";
    if (!template.inputSchema.accepts || typeof template.inputSchema.accepts !== "object") return "Input schema accepts is required.";
    if (!Array.isArray(template.inputSchema.accepts.shape) || !template.inputSchema.accepts.shape.length) {
      return "Input schema accepts.shape must be a non-empty array.";
    }
    const { minRows, maxRows } = template.inputSchema.accepts;
    if (minRows !== undefined && (!Number.isFinite(minRows) || minRows < 0)) return "Input schema minRows must be a non-negative number.";
    if (maxRows !== undefined && (!Number.isFinite(maxRows) || maxRows < 0)) return "Input schema maxRows must be a non-negative number.";
    if (minRows !== undefined && maxRows !== undefined && minRows > maxRows) return "Input schema minRows cannot be greater than maxRows.";
    if (!Array.isArray(template.inputSchema.requiredSlots)) return "Input schema requiredSlots must be an array.";
    for (const slot of [...template.inputSchema.requiredSlots, ...(template.inputSchema.optionalSlots ?? [])]) {
      if (!slot.slot?.trim()) return "Input schema slot name is required.";
      if (!Array.isArray(slot.acceptsTypes) || !slot.acceptsTypes.length) return `Input schema slot ${slot.slot} acceptsTypes must be a non-empty array.`;
      if (!Array.isArray(slot.acceptsRoles) || !slot.acceptsRoles.length) return `Input schema slot ${slot.slot} acceptsRoles must be a non-empty array.`;
      if (slot.minCount !== undefined && (!Number.isFinite(slot.minCount) || slot.minCount < 0)) return `Input schema slot ${slot.slot} minCount must be a non-negative number.`;
      if (slot.maxCount !== undefined && (!Number.isFinite(slot.maxCount) || slot.maxCount < 0)) return `Input schema slot ${slot.slot} maxCount must be a non-negative number.`;
      if (slot.minCount !== undefined && slot.maxCount !== undefined && slot.minCount > slot.maxCount) return `Input schema slot ${slot.slot} minCount cannot be greater than maxCount.`;
    }
  }
  return null;
}

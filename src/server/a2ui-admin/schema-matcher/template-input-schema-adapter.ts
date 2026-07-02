import type {
  A2UIComponentSchemaSpec,
  A2UIComponentSurfaceConfig,
  A2UIRole,
  A2UITemplateInputSchema,
  A2UITemplateRegistration,
  A2UITemplateSlot,
} from "@/features/a2ui-template-poc/template-types";

const schemaVersion = "2026-06-11" as const;

function slotForRole(role: A2UIRole, surfaceConfig: A2UIComponentSurfaceConfig): A2UITemplateSlot {
  if (role === "booleanFlag") {
    return {
      slot: "items[].statusFlags",
      acceptsTypes: ["boolean"],
      acceptsRoles: ["booleanFlag", "status"],
      minCount: surfaceConfig.statusBindings?.length ?? 1,
      required: true,
    };
  }

  if (role === "image") {
    return {
      slot: "cards[].imageUrl",
      acceptsTypes: ["string"],
      acceptsRoles: ["image", "uri"],
      acceptsFormats: ["image-url", "uri"],
      required: true,
    };
  }

  if (role === "metric") {
    return {
      slot: "items[].metrics",
      acceptsTypes: ["number"],
      acceptsRoles: ["metric"],
      minCount: surfaceConfig.metricBindings?.length || 1,
      required: true,
    };
  }

  if (role === "progress") {
    return {
      slot: "items[].progress",
      acceptsTypes: ["number"],
      acceptsRoles: ["progress", "metric"],
      required: true,
    };
  }

  if (role === "priority") {
    return {
      slot: "items[].priority",
      acceptsTypes: ["string", "number"],
      acceptsRoles: ["priority", "status"],
      required: true,
    };
  }

  if (role === "assignee") {
    return {
      slot: "items[].assignee",
      acceptsTypes: ["string"],
      acceptsRoles: ["assignee", "actor", "label"],
      required: true,
    };
  }

  if (role === "dueAt") {
    return {
      slot: "items[].dueAt",
      acceptsTypes: ["date", "datetime", "string"],
      acceptsRoles: ["dueAt", "time", "updatedAt"],
      required: true,
    };
  }

  if (role === "children") {
    return {
      slot: "nodes[].children",
      acceptsTypes: ["array"],
      acceptsRoles: ["children"],
      required: true,
    };
  }

  if (role === "parentId") {
    return {
      slot: "nodes[].parentId",
      acceptsTypes: ["string", "number"],
      acceptsRoles: ["parentId"],
      required: true,
    };
  }

  if (role === "content" || role === "description") {
    return {
      slot: "cards[].description",
      acceptsTypes: ["string"],
      acceptsRoles: ["content", "description"],
      required: true,
    };
  }

  return {
    slot: "items[].title",
    acceptsTypes: ["string"],
    acceptsRoles: role === "title" ? ["title", "label"] : [role],
    required: true,
  };
}

function capabilityHints(schemaSpec: A2UIComponentSchemaSpec) {
  return {
    hasImages: schemaSpec.requiredRoles.includes("image") || Boolean(schemaSpec.fieldHints?.image?.length),
    hasBooleans: schemaSpec.requiredRoles.includes("booleanFlag") || Boolean(schemaSpec.minBooleanFields),
    hasStatus: schemaSpec.requiredRoles.includes("status") || schemaSpec.requiredRoles.includes("booleanFlag"),
    hasCategories: schemaSpec.requiredRoles.includes("category"),
    hasProgress: schemaSpec.requiredRoles.includes("progress"),
    hasPriority: schemaSpec.requiredRoles.includes("priority"),
    hasAssignee: schemaSpec.requiredRoles.includes("assignee"),
    hasDueDate: schemaSpec.requiredRoles.includes("dueAt"),
    hasTree: schemaSpec.requiredRoles.includes("children") || schemaSpec.requiredRoles.includes("parentId"),
    hasDelta: schemaSpec.requiredRoles.includes("delta"),
    hasUnits: schemaSpec.requiredRoles.includes("unit"),
  };
}

export function inputSchemaFromTemplate(template: A2UITemplateRegistration): A2UITemplateInputSchema {
  const requiredSlots = template.schemaSpec.requiredRoles.map((role) => slotForRole(role, template.surfaceConfig));
  const optionalSlots: A2UITemplateSlot[] = [];

  for (const role of template.schemaSpec.optionalRoles ?? []) {
    optionalSlots.push({ ...slotForRole(role, template.surfaceConfig), required: false });
  }

  return {
    schemaVersion,
    accepts: {
      shape: [template.schemaSpec.dataShape],
      minRows: template.schemaSpec.minRows ?? 1,
      maxRows: template.schemaSpec.maxRows,
      capabilities: capabilityHints(template.schemaSpec),
    },
    requiredSlots,
    optionalSlots,
    selectionHints: {
      queryKeywords: template.schemaSpec.intentKeywords,
      bestFor: [template.selectionGuide],
      priority: template.schemaSpec.requiredRoles.length,
    },
  };
}

export function normalizeTemplateInputSchema(template: A2UITemplateRegistration): A2UITemplateRegistration {
  return {
    ...template,
    inputSchema: template.inputSchema ?? inputSchemaFromTemplate(template),
  };
}

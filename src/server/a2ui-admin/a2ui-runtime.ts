import { buildA2UIDataProfile } from "@/features/a2ui-template-poc/schema-profiler";
import { selectA2UIComponent } from "@/features/a2ui-template-poc/component-selector";
import type {
  A2UIDataProfile,
  A2UICandidateTrace,
  A2UIMappingDecision,
  A2UIRenderPlan,
  A2UISurfaceEnvelope,
  A2UITemplateRegistration,
  EquipmentApiResponse,
} from "@/features/a2ui-template-poc/template-types";
import { getTemplate, readTemplateCatalog, templateSummary } from "./catalog-store";
import type { DerivedSchema } from "./schema-matcher/derived-schema-types";
import { buildDerivedSchema, derivedSchemaFromDataProfile } from "./schema-matcher/derived-schema-builder";
import { buildSampleDataPreview, type SampleDataPreview } from "./schema-matcher/sample-data-preview";
import { matchA2UITemplate } from "./schema-matcher/template-schema-matcher";

export type EquipmentApiId = "equipment-catalog" | "equipment-status";

export type A2UIRecommendation =
  | {
      mode: "render_surface";
      templateId: string;
      apiId: EquipmentApiId;
      apiTitle: string;
      profile: A2UIDataProfile;
      renderPlan: A2UIRenderPlan;
      reason: string;
      registryVersion: number;
      strategy: NonNullable<A2UIRenderPlan["strategy"]>;
      score?: number;
      mapping?: A2UIMappingDecision;
      candidates?: A2UICandidateTrace[];
      derivedSchema?: DerivedSchema;
    }
  | {
      mode: "text_fallback";
      templateId: null;
      apiId: EquipmentApiId;
      apiTitle: string;
      profile: A2UIDataProfile;
      renderPlan: A2UIRenderPlan;
      reason: string;
      registryVersion: number;
      strategy: NonNullable<A2UIRenderPlan["strategy"]>;
      score?: number;
      mapping?: A2UIMappingDecision;
      candidates?: A2UICandidateTrace[];
      derivedSchema?: DerivedSchema;
    };

export type McpToolCallResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function normalizeMatchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "");
}

export function chooseEquipmentApiForPrompt(prompt: string): EquipmentApiId {
  const normalized = normalizeMatchText(prompt);
  if (
    normalized.includes("장비목록") ||
    normalized.includes("장비리스트") ||
    normalized.includes("장비보여") ||
    normalized.includes("설비") ||
    normalized.includes("카탈로그") ||
    normalized.includes("이미지") ||
    normalized.includes("사진")
  ) {
    return "equipment-catalog";
  }
  return "equipment-status";
}

export function equipmentApiTitle(apiId: EquipmentApiId) {
  return apiId === "equipment-catalog" ? "장비 카탈로그 API" : "장비 상태 API";
}

function templateRenderPlan({
  query,
  data,
  templates,
  registryVersion,
}: {
  query: string;
  data: EquipmentApiResponse<unknown>;
  templates: A2UITemplateRegistration[];
  registryVersion: number;
}) {
  const profile = buildA2UIDataProfile(data);
  const renderPlan = selectA2UIComponent({
    query,
    profile,
    templates,
    registryVersion,
  });
  return { profile, renderPlan };
}

function fallbackRenderPlan({
  registryVersion,
  reason,
  candidates,
  strategy,
}: {
  registryVersion: number;
  reason: string;
  candidates?: A2UICandidateTrace[];
  strategy: NonNullable<A2UIRenderPlan["strategy"]>;
}): A2UIRenderPlan {
  return {
    selectedComponentId: "agent.markdownList",
    viewType: "simpleTextList",
    score: 12,
    reason,
    fieldMapping: {
      title: "items[].name",
      content: "items[].description",
    },
    isFallback: true,
    registryVersion,
    maxItems: 6,
    strategy,
    candidates,
  };
}

function profileFieldTypeFromDerived(field: DerivedSchema["fields"][number]): A2UIDataProfile["fields"][number]["type"] {
  if (field.format === "image-url") return "image-url";
  if (field.type === "datetime") return "date";
  if (field.type === "string" || field.type === "number" || field.type === "boolean" || field.type === "date") {
    return field.type;
  }
  return "unknown";
}

function profileFromDerivedSchema(derivedSchema: DerivedSchema): A2UIDataProfile {
  const fields = derivedSchema.fields.map((field) => ({
    path: derivedSchema.primaryArrayPath && field.path.startsWith(`${derivedSchema.primaryArrayPath}.`)
      ? field.path.replace(`${derivedSchema.primaryArrayPath}.`, `${derivedSchema.primaryArrayPath}[].`)
      : field.path,
    key: field.key,
    type: profileFieldTypeFromDerived(field),
    roleCandidates: field.roles,
    examples: field.examples,
  }));

  return {
    shape: derivedSchema.shape === "array<primitive>" ? "unknown" : derivedSchema.shape,
    rowCount: derivedSchema.rowCount ?? derivedSchema.sampleSize ?? 0,
    listPath: derivedSchema.primaryArrayPath,
    fields,
    booleanFieldCount: fields.filter((field) => field.type === "boolean").length,
    hasImageField: derivedSchema.capabilities.hasImages,
    hasContentField: fields.some((field) => field.roleCandidates.includes("content")),
    hasDescriptionField: fields.some((field) => field.roleCandidates.includes("description")),
  };
}

function sampleDataFromPreview(preview?: SampleDataPreview) {
  if (!preview || preview.shape === "unknown") return undefined;
  return preview.data as EquipmentApiResponse<unknown>;
}

function canonicalDerivedSchema({
  data,
  providedDerivedSchema,
  sampleDataPreview,
  sourceId,
}: {
  data?: EquipmentApiResponse<unknown>;
  providedDerivedSchema?: DerivedSchema;
  sampleDataPreview?: SampleDataPreview;
  sourceId: string;
}) {
  if (sampleDataPreview) {
    return buildDerivedSchema(sampleDataPreview.data, {
      sourceId,
      sourceKind: "api_response",
      sampleDataPreview,
    });
  }
  if (data) {
    const preview = buildSampleDataPreview(data, { sourceId, sourceKind: "api_response" });
    return buildDerivedSchema(data, { sourceId, sourceKind: "api_response", sampleDataPreview: preview });
  }
  return providedDerivedSchema;
}

export async function recommendTemplate({
  query,
  apiId,
  data,
  derivedSchema,
  sampleDataPreview,
  options,
}: {
  query: string;
  apiId?: EquipmentApiId;
  data?: EquipmentApiResponse<unknown>;
  derivedSchema?: DerivedSchema;
  sampleDataPreview?: SampleDataPreview;
  options?: {
    allowIntentFallback?: boolean;
    includeTrace?: boolean;
  };
}): Promise<A2UIRecommendation> {
  const selectedApiId = apiId ?? chooseEquipmentApiForPrompt(query);
  const catalog = await readTemplateCatalog();
  const apiTitle = equipmentApiTitle(selectedApiId);
  const canonicalSchema = canonicalDerivedSchema({
    data,
    providedDerivedSchema: derivedSchema,
    sampleDataPreview,
    sourceId: selectedApiId,
  });
  const profile = data
    ? buildA2UIDataProfile(data)
    : canonicalSchema
      ? profileFromDerivedSchema(canonicalSchema)
      : buildA2UIDataProfile(sampleDataFromPreview(sampleDataPreview));
  const allowIntentFallback = options?.allowIntentFallback ?? true;
  let schemaCandidates: A2UICandidateTrace[] | undefined;

  if (canonicalSchema) {
    const schemaDecision = matchA2UITemplate({
      query,
      derivedSchema: canonicalSchema,
      templates: catalog.templates,
      registryVersion: catalog.version,
    });

    if (schemaDecision.mode === "render_surface") {
      return {
        mode: "render_surface",
        templateId: schemaDecision.templateId,
        apiId: selectedApiId,
        apiTitle,
        profile,
        renderPlan: schemaDecision.renderPlan,
        reason: schemaDecision.reason,
        registryVersion: catalog.version,
        strategy: "derived_schema",
        score: schemaDecision.score,
        mapping: schemaDecision.mapping,
        candidates: schemaDecision.candidates,
        derivedSchema: canonicalSchema,
      };
    }

    schemaCandidates = schemaDecision.candidates;

    if (!allowIntentFallback || !data) {
      const renderPlan = fallbackRenderPlan({
        registryVersion: catalog.version,
        reason: schemaDecision.reason,
        candidates: schemaDecision.candidates,
        strategy: "derived_schema",
      });
      return {
        mode: "text_fallback",
        templateId: null,
        apiId: selectedApiId,
        apiTitle,
        profile,
        renderPlan,
        reason: schemaDecision.reason,
        registryVersion: catalog.version,
        strategy: "derived_schema",
        candidates: schemaDecision.candidates,
        derivedSchema: canonicalSchema,
      };
    }
  }

  if (!data) {
    const reason = "A2UI recommendation requires data, sampleDataPreview, or derivedSchema.";
    const renderPlan = fallbackRenderPlan({
      registryVersion: catalog.version,
      reason,
      strategy: "fallback",
    });
    return {
      mode: "text_fallback",
      templateId: null,
      apiId: selectedApiId,
      apiTitle,
      profile,
      renderPlan,
      reason,
      registryVersion: catalog.version,
      strategy: "fallback",
      derivedSchema: canonicalSchema,
    };
  }

  const { renderPlan } = templateRenderPlan({
    query,
    data,
    templates: catalog.templates,
    registryVersion: catalog.version,
  });
  const templateSchemaRenderPlan = {
    ...renderPlan,
    strategy: renderPlan.isFallback ? "fallback" : "template_schema_spec",
    candidates: schemaCandidates,
  } satisfies A2UIRenderPlan;

  if (templateSchemaRenderPlan.isFallback) {
    return {
      mode: "text_fallback",
      templateId: null,
      apiId: selectedApiId,
      apiTitle,
      profile,
      renderPlan: templateSchemaRenderPlan,
      reason: templateSchemaRenderPlan.reason,
      registryVersion: catalog.version,
      strategy: templateSchemaRenderPlan.strategy ?? "fallback",
      candidates: schemaCandidates,
      derivedSchema: canonicalSchema ?? derivedSchemaFromDataProfile(profile, { sourceId: selectedApiId }),
    };
  }

  return {
    mode: "render_surface",
    templateId: templateSchemaRenderPlan.selectedComponentId,
    apiId: selectedApiId,
    apiTitle,
    profile,
    renderPlan: templateSchemaRenderPlan,
    reason: templateSchemaRenderPlan.reason,
    registryVersion: catalog.version,
    strategy: "template_schema_spec",
    candidates: schemaCandidates,
    derivedSchema: canonicalSchema ?? derivedSchemaFromDataProfile(profile, { sourceId: selectedApiId }),
  };
}

export async function resolveTemplateData({
  templateId,
  query,
  apiId,
  data,
  derivedSchema,
  sampleDataPreview,
  mapping,
}: {
  templateId: string;
  query: string;
  apiId?: EquipmentApiId;
  data?: EquipmentApiResponse<unknown>;
  derivedSchema?: DerivedSchema;
  sampleDataPreview?: SampleDataPreview;
  mapping?: A2UIMappingDecision;
}): Promise<A2UISurfaceEnvelope> {
  const template = await getTemplate(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const selectedApiId = apiId ?? chooseEquipmentApiForPrompt(query);
  if (!data) {
    throw new Error("A2UI surface resolution requires agent-provided equipment data.");
  }
  const catalog = await readTemplateCatalog();
  const profile = buildA2UIDataProfile(data);
  const canonicalSchema = canonicalDerivedSchema({
    data,
    providedDerivedSchema: derivedSchema,
    sampleDataPreview,
    sourceId: selectedApiId,
  });
  const schemaDecision = canonicalSchema
    ? matchA2UITemplate({
        query,
        derivedSchema: canonicalSchema,
        templates: [{ ...template, inputSchema: template.inputSchema }],
        registryVersion: catalog.version,
      })
    : null;
  const templatePlan = templateRenderPlan({
    query,
    data,
    templates: [template],
    registryVersion: catalog.version,
  });
  const schemaRenderPlan =
    schemaDecision?.mode === "render_surface" && schemaDecision.templateId === templateId
      ? {
          ...schemaDecision.renderPlan,
          mapping: mapping ?? schemaDecision.mapping,
        }
      : null;
  const renderPlan = schemaRenderPlan ?? {
    ...templatePlan.renderPlan,
    strategy: templatePlan.renderPlan.isFallback ? "fallback" : "template_schema_spec",
  };

  if (renderPlan.isFallback || renderPlan.selectedComponentId !== templateId) {
    throw new Error(`Template ${templateId} does not match the current data profile`);
  }

  return {
    templateId,
    version: "1.0.0",
    payload: {
      apiTitle: equipmentApiTitle(selectedApiId),
      apiId: selectedApiId,
      data,
      profile,
      renderPlan,
    },
    surfaceConfig: template.surfaceConfig,
    sourceIntent: selectedApiId === "equipment-catalog" ? "equipment.catalog.lookup" : "equipment.status.lookup",
    updatedAt: new Date().toISOString(),
    meta: {
      registryVersion: catalog.version,
      decisionReason: renderPlan.reason,
      trace: [
        "profile:data-shape",
        `matcher:${renderPlan.strategy ?? "template_schema_spec"}`,
        `matcher:score:${renderPlan.score}`,
        ...(renderPlan.candidates?.filter((candidate) => candidate.rejected).map((candidate) => `candidate-rejected:${candidate.templateId}:${candidate.rejectionReason}`) ?? []),
        "resolver:equipment-api",
        "binding:renderer-payload",
      ],
      strategy: renderPlan.strategy,
      score: renderPlan.score,
      candidates: renderPlan.candidates,
      mapping: renderPlan.mapping,
    },
  };
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readApiId(value: unknown): EquipmentApiId | undefined {
  return value === "equipment-catalog" || value === "equipment-status" ? value : undefined;
}

function readData(value: unknown): EquipmentApiResponse<unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<EquipmentApiResponse<unknown>>;
  if (!Array.isArray(record.items)) return undefined;
  return {
    items: record.items,
    total: typeof record.total === "number" ? record.total : record.items.length,
    page: typeof record.page === "number" ? record.page : 1,
    pageSize: typeof record.pageSize === "number" ? record.pageSize : record.items.length,
  };
}

function readSampleDataPreview(value: unknown): SampleDataPreview | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<SampleDataPreview>;
  if (!record.data || typeof record.rowCount !== "number") return undefined;
  return {
    ...record,
    primaryArrayPath: typeof record.primaryArrayPath === "string" ? record.primaryArrayPath : undefined,
    sourceId: typeof record.sourceId === "string" ? record.sourceId : "unknown",
    sourceKind: record.sourceKind ?? "api_response",
    shape: record.shape ?? "unknown",
    rowCount: record.rowCount,
    sampleSize: typeof record.sampleSize === "number" ? record.sampleSize : 0,
    truncated: Boolean(record.truncated),
    byteLength: typeof record.byteLength === "number" ? record.byteLength : 0,
    maskedFields: Array.isArray(record.maskedFields) ? record.maskedFields : [],
    data: record.data,
  };
}

function readDerivedSchema(value: unknown): DerivedSchema | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<DerivedSchema>;
  if (!record.shape || !Array.isArray(record.fields) || !record.capabilities) return undefined;
  return {
    ...record,
    sourceId: typeof record.sourceId === "string" ? record.sourceId : "derived-schema",
    sourceKind: record.sourceKind ?? "api_response",
    shape: record.shape,
    primaryArrayPath: typeof record.primaryArrayPath === "string" ? record.primaryArrayPath : undefined,
    rowCount: record.rowCount,
    sampleSize: record.sampleSize,
    fields: record.fields,
    capabilities: record.capabilities,
  };
}

function readMapping(value: unknown): A2UIMappingDecision | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<A2UIMappingDecision>;
  if (!record.templateId || !Array.isArray(record.mappings)) return undefined;
  return record as A2UIMappingDecision;
}

function readOptions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    allowIntentFallback:
      typeof record.allowIntentFallback === "boolean" ? record.allowIntentFallback : undefined,
    includeTrace: typeof record.includeTrace === "boolean" ? record.includeTrace : undefined,
  };
}

export async function executeA2UITool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  if (name === "a2ui.listTemplates") {
    return templateSummary();
  }

  if (name === "a2ui.recommendTemplate") {
    const facts = args.facts && typeof args.facts === "object" && !Array.isArray(args.facts)
      ? (args.facts as Record<string, unknown>)
      : {};
    const query = readString(args.query, readString(args.input, readString(facts.query, readString(args.intentKey, ""))));
    return recommendTemplate({
      query,
      apiId: readApiId(args.apiId) ?? readApiId(facts.apiId),
      data: readData(args.data) ?? readData(facts.data),
      derivedSchema: readDerivedSchema(args.derivedSchema) ?? readDerivedSchema(facts.derivedSchema),
      sampleDataPreview: readSampleDataPreview(args.sampleDataPreview) ?? readSampleDataPreview(facts.sampleDataPreview),
      options: readOptions(args.options),
    });
  }

  if (name === "a2ui.resolveTemplateData") {
    const context = args.context && typeof args.context === "object" && !Array.isArray(args.context)
      ? (args.context as Record<string, unknown>)
      : {};
    return resolveTemplateData({
      templateId: readString(args.templateId),
      query: readString(args.query, readString(context.query, readString(context.intentKey, ""))),
      apiId: readApiId(args.apiId) ?? readApiId(context.apiId),
      data: readData(args.data) ?? readData(context.data),
      derivedSchema: readDerivedSchema(args.derivedSchema) ?? readDerivedSchema(context.derivedSchema),
      sampleDataPreview: readSampleDataPreview(args.sampleDataPreview) ?? readSampleDataPreview(context.sampleDataPreview),
      mapping: readMapping(args.mapping) ?? readMapping(context.mapping),
    });
  }

  if (name === "a2ui.getTemplateContract") {
    const template = await getTemplate(readString(args.templateId));
    return template
      ? {
          templateId: template.componentId,
          schemaSpec: template.schemaSpec,
          inputSchema: template.inputSchema,
          surfaceConfig: template.surfaceConfig,
          selectionGuide: template.selectionGuide,
        }
      : { error: "Template not found" };
  }

  throw new Error(`Unknown A2UI tool: ${name}`);
}

export async function toolResult(name: string, args: Record<string, unknown> = {}): Promise<McpToolCallResult> {
  try {
    const result = await executeA2UITool(name, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
      isError: true,
    };
  }
}

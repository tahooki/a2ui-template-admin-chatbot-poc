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
import { getTemplate, readTemplateCatalog } from "./catalog-store";
import type { DerivedSchema } from "./schema-matcher/derived-schema-types";
import { buildDerivedSchema, derivedSchemaFromDataProfile } from "./schema-matcher/derived-schema-builder";
import { buildSampleDataPreview, type SampleDataPreview } from "./schema-matcher/sample-data-preview";
import { matchA2UITemplate } from "./schema-matcher/template-schema-matcher";

export const equipmentApiIds = [
  "equipment-catalog",
  "equipment-status",
  "equipment-status-wide-columns",
  "equipment-status-large-rows",
] as const;

export type EquipmentApiId = (typeof equipmentApiIds)[number];

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

function normalizeMatchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "");
}

export function isEquipmentApiId(value: unknown): value is EquipmentApiId {
  return typeof value === "string" && (equipmentApiIds as readonly string[]).includes(value);
}

export function isStatusEquipmentApi(apiId: EquipmentApiId) {
  return apiId !== "equipment-catalog";
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
  if (apiId === "equipment-catalog") return "장비 카탈로그 API";
  if (apiId === "equipment-status-wide-columns") return "컬럼 많은 장비 상태 API";
  if (apiId === "equipment-status-large-rows") return "데이터 많은 장비 상태 API";
  return "장비 상태 API";
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
    sourceIntent: isStatusEquipmentApi(selectedApiId) ? "equipment.status.lookup" : "equipment.catalog.lookup",
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

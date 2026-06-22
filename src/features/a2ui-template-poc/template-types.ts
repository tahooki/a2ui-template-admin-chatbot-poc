export type A2UIRole =
  | "id"
  | "label"
  | "title"
  | "content"
  | "description"
  | "image"
  | "uri"
  | "status"
  | "booleanFlag"
  | "category"
  | "location"
  | "updatedAt"
  | "time"
  | "metric"
  | "version"
  | "environment"
  | "artifact"
  | "action";

export type A2UIDerivedFieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "object"
  | "array"
  | "unknown";

export type A2UITemplateSlot = {
  slot: string;
  acceptsTypes: A2UIDerivedFieldType[];
  acceptsRoles: A2UIRole[];
  acceptsFormats?: string[];
  minCount?: number;
  maxCount?: number;
  required: boolean;
  description?: string;
};

export type A2UITemplateInputSchema = {
  schemaVersion: "2026-06-11";
  accepts: {
    shape: Array<"object" | "array<object>" | "array<primitive>" | "unknown">;
    minRows?: number;
    maxRows?: number;
    capabilities?: Partial<{
      hasImages: boolean;
      hasBooleans: boolean;
      hasStatus: boolean;
      hasTimeField: boolean;
      hasNumericMetrics: boolean;
      hasCategories: boolean;
      hasNestedObjects: boolean;
      hasActions: boolean;
    }>;
  };
  requiredSlots: A2UITemplateSlot[];
  optionalSlots?: A2UITemplateSlot[];
  selectionHints?: {
    intentKeys?: string[];
    queryKeywords?: string[];
    bestFor?: string[];
    badFor?: string[];
    priority?: number;
  };
};

export type A2UIViewType = "statusBooleanList" | "simpleTextList" | "imageCardList" | "telemetryStatusTable";

export type A2UIComponentSchemaSpec = {
  dataShape: "object" | "array<object>";
  listPath?: string;
  requiredRoles: A2UIRole[];
  optionalRoles?: A2UIRole[];
  minRows?: number;
  maxRows?: number;
  minBooleanFields?: number;
  fieldHints?: Record<string, string[]>;
  intentKeywords?: string[];
};

export type A2UIComponentSurfaceConfig = {
  viewType: A2UIViewType;
  titleBinding: string;
  contentBinding?: string;
  descriptionBinding?: string;
  imageBinding?: string;
  statusBindings?: string[];
  metricBindings?: string[];
  maxItems?: number;
};

export type A2UITemplateRegistration = {
  componentId: string;
  title: string;
  description: string;
  selectionGuide: string;
  schemaSpec: A2UIComponentSchemaSpec;
  inputSchema?: A2UITemplateInputSchema;
  surfaceConfig: A2UIComponentSurfaceConfig;
  status: "registered" | "draft" | "invalid";
  updatedAt: string;
};

export type FieldProfile = {
  path: string;
  key: string;
  type: "string" | "number" | "boolean" | "image-url" | "date" | "unknown";
  roleCandidates: A2UIRole[];
  examples: unknown[];
};

export type A2UIDataProfile = {
  shape: "object" | "array<object>" | "unknown";
  rowCount: number;
  listPath?: string;
  fields: FieldProfile[];
  booleanFieldCount: number;
  hasImageField: boolean;
  hasContentField: boolean;
  hasDescriptionField: boolean;
};

export type FieldMapping = {
  title?: string;
  content?: string;
  image?: string;
  booleanFlags?: string[];
  metrics?: string[];
};

export type A2UICandidateTrace = {
  templateId: string;
  score: number;
  decision?: "select" | "reject";
  reason: string;
  rejected?: boolean;
  rejectionReason?: string;
  breakdown?: Record<string, number>;
  ai?: {
    schemaFit: number;
    queryFit: number;
    semanticFit: number;
    renderFit: number;
    risks: string[];
    missingRequiredSlots: string[];
  };
};

export type A2UIMappingDecision = {
  templateId: string;
  confidence: number;
  reason: string;
  mappings: Array<{
    slot: string;
    sourcePath: string;
    targetField?: string;
    transform?: "none" | "first" | "join" | "booleanLabel" | "statusTone" | "copy" | "boolean_code" | "number_to_boolean" | "default_false";
  }>;
  missingSlots: string[];
};

export type A2UIRenderPlan = {
  selectedComponentId: string;
  viewType: A2UIViewType;
  score: number;
  reason: string;
  fieldMapping: FieldMapping;
  isFallback: boolean;
  registryVersion: number;
  maxItems?: number;
  strategy?: "ai_surface_planner" | "derived_schema" | "template_schema_spec" | "fallback";
  candidates?: A2UICandidateTrace[];
  mapping?: A2UIMappingDecision;
  aiSurfacePlanTrace?: {
    promptVersion: string;
    model?: string;
    confidence?: number;
    reason?: string;
    primaryArrayPath?: string;
    selectedTemplateId?: string;
    fieldMappings?: Array<{
      targetField?: string;
      sourcePath?: string;
      transform?: "copy" | "boolean_code" | "number_to_boolean" | "default_false";
      trueValues?: unknown[];
      falseValues?: unknown[];
      defaultValue?: unknown;
      reason?: string;
    }>;
    slotMappings?: Array<{
      templateId?: string;
      slot?: string;
      sourcePath?: string;
      targetField?: string;
      transform?: "copy" | "boolean_code" | "number_to_boolean" | "default_false";
      reason?: string;
    }>;
    candidateEvaluations?: unknown[];
    validation?: {
      ok: boolean;
      errors: string[];
    };
    sourceShape?: string;
    sourceArrayPath?: string;
    sourceFieldPaths?: string[];
    sourceSampleRows?: unknown[];
    sourceRowCount?: number;
    renderRowCount?: number;
    sourceDataHash?: string;
    renderDataHash?: string;
    renderDataByteLength?: number;
    plannerAttempts?: Array<{
      requestKind?: "initial" | "correction";
      attempt?: number;
      responseFormat?: "json_schema" | "json_object" | "none";
      maxTokens?: number;
      durationMs?: number;
      outcome?: string;
      status?: number;
      finishReason?: string;
      rawResponseLength?: number;
      rawResponsePreview?: string;
      contentLength?: number;
      contentPreview?: string;
      error?: string;
    }>;
    beforeRows?: Record<string, unknown>[];
    afterRows?: Record<string, unknown>[];
  };
};

export type EquipmentCatalogItem = {
  id: string;
  name: string;
  imageUrl: string;
  description: string;
  category: string;
  location: string;
};

export type EquipmentStatusItem = {
  id: string;
  name: string;
  isOnline: boolean;
  isRunning: boolean;
  hasAlarm: boolean;
  needsInspection: boolean;
  isReserved: boolean;
};

export type EquipmentApiResponse<TItem> = {
  items: TItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type A2UISurfaceEnvelopePayload = {
  apiTitle: string;
  apiId: string;
  data: EquipmentApiResponse<unknown>;
  profile: A2UIDataProfile;
  renderPlan: A2UIRenderPlan;
};

export type A2UISurfaceEnvelope = {
  templateId: string;
  version: string;
  payload: A2UISurfaceEnvelopePayload;
  surfaceConfig: A2UIComponentSurfaceConfig;
  sourceIntent: string;
  updatedAt: string;
  meta: {
    registryVersion: number;
    decisionReason: string;
    trace: string[];
    strategy?: "ai_surface_planner" | "derived_schema" | "template_schema_spec" | "fallback";
    score?: number;
    candidates?: A2UICandidateTrace[];
    mapping?: A2UIMappingDecision;
  };
};

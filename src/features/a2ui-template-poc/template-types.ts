export type A2UIRole =
  | "id"
  | "title"
  | "content"
  | "description"
  | "image"
  | "status"
  | "booleanFlag"
  | "category"
  | "location"
  | "updatedAt";

export type A2UIViewType = "statusBooleanList" | "simpleTextList" | "imageCardList";

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
  maxItems?: number;
};

export type A2UITemplateRegistration = {
  componentId: string;
  title: string;
  description: string;
  selectionGuide: string;
  schemaSpec: A2UIComponentSchemaSpec;
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

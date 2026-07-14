/**
 * Browser-facing A2UI contracts.
 *
 * This file intentionally has no application aliases or server imports so the
 * whole a2ui-chat-kit directory can be copied into another React chatbot.
 */

export type A2UIFieldMapping = {
  title?: string;
  content?: string;
  image?: string;
  booleanFlags?: string[];
  metrics?: string[];
  fields?: string[];
  status?: string;
  category?: string;
  updatedAt?: string;
  time?: string;
  startAt?: string;
  endAt?: string;
  duration?: string;
  lane?: string;
  progress?: string;
  priority?: string;
  assignee?: string;
  dueAt?: string;
  parentId?: string;
  children?: string;
  delta?: string;
  unit?: string;
  value?: string;
};

export type A2UIDataProfile = {
  rowCount: number;
};

export type A2UIRenderPlan = {
  viewType: string;
  fieldMapping: A2UIFieldMapping;
  maxItems?: number;
  selectedComponentId?: string;
  score?: number;
  reason?: string;
  isFallback?: boolean;
  registryVersion?: number;
  strategy?: string;
};

export type A2UISurfacePayload = {
  apiTitle?: string;
  apiId?: string;
  data: unknown;
  profile: A2UIDataProfile;
  renderPlan: A2UIRenderPlan;
};

export type A2UISurfaceEnvelope = {
  templateId?: string;
  version?: string;
  payload: A2UISurfacePayload;
};

export type A2UIChatSurface = {
  apiTitle: string;
  apiId: string;
  templateId?: string;
  data: unknown;
  profile: A2UIDataProfile;
  renderPlan: A2UIRenderPlan;
};

export type A2UIDisplayOption = {
  templateId: string;
  label: string;
  score?: number;
  recommended?: boolean;
};

export type A2UIDisplaySelectionState = {
  selectionId: string;
  message: string;
  options: A2UIDisplayOption[];
  status: "idle" | "loading" | "completed" | "error";
  selectedTemplateId?: string;
  error?: string;
};

export type A2UISseEvent = {
  event: string;
  data: Record<string, unknown>;
};

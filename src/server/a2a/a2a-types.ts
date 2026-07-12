import type {
  A2UICandidateTrace,
  A2UIMappingDecision,
  A2UISurfaceEnvelope,
} from "@/features/a2ui-template-poc/template-types";
import type { EquipmentApiId } from "@/server/a2ui-admin/a2ui-runtime";
import type { A2UISurfacePlanTrace } from "@/server/a2ui-admin/a2ui-ai-surface-planner";
import type { DerivedSchema } from "@/server/a2ui-admin/schema-matcher/derived-schema-types";
import type { SampleDataPreview } from "@/server/a2ui-admin/schema-matcher/sample-data-preview";

export const A2A_VERSION = "1.0";
export const A2A_JSON = "application/a2a+json";
export const A2A_RENDER_REQUEST = "application/vnd.a2ui.render-request+json";
export const A2A_SURFACE = "application/vnd.a2ui.surface+json";
export const A2A_ACTION = "application/vnd.a2ui.action+json";
export const A2A_TRACE = "application/json";

export type A2ATaskState =
  | "TASK_STATE_WORKING"
  | "TASK_STATE_COMPLETED"
  | "TASK_STATE_FAILED"
  | "TASK_STATE_INPUT_REQUIRED";

export type A2ARole = "ROLE_USER" | "ROLE_AGENT";

export type A2APart = {
  text?: string;
  data?: unknown;
  mediaType?: string;
};

export type A2AMessage = {
  messageId?: string;
  contextId?: string;
  taskId?: string;
  role?: A2ARole | string;
  parts?: A2APart[];
};

export type A2AArtifact = {
  artifactId: string;
  name?: string;
  description?: string;
  parts: A2APart[];
};

export type A2ATaskStatus = {
  state: A2ATaskState;
  message?: A2AMessage;
};

export type A2ATask = {
  id: string;
  contextId?: string;
  status: A2ATaskStatus;
  artifacts?: A2AArtifact[];
  metadata?: Record<string, unknown>;
};

export type A2ASendMessageRequest = {
  configuration?: {
    acceptedOutputModes?: string[];
    returnImmediately?: boolean;
  };
  message?: A2AMessage;
};

export type A2ARenderRequestData = {
  kind?: "a2ui.render.request" | string;
  query?: string;
  intentKey?: string;
  apiId?: EquipmentApiId | string;
  facts?: Record<string, unknown>;
  data?: unknown;
  displayData?: unknown;
  toolMetadata?: Record<string, unknown>;
  sampleDataPreview?: SampleDataPreview;
  derivedSchema?: DerivedSchema;
  fallbackText?: string;
  a2uiOptions?: {
    includeTrace?: boolean;
    allowIntentFallback?: boolean;
    mode?: "recommend" | "render_selected";
    selectedTemplateId?: string;
    maxCandidates?: number;
  };
};

export type A2AActionRequestData = {
  kind?: "a2ui.action.request" | string;
  templateId?: string;
  actionId?: string;
  params?: Record<string, unknown>;
  surfaceMeta?: Record<string, unknown>;
};

export type A2UIDecisionArtifactData = {
  schemaVersion: "2026-06-11";
  kind: "a2ui.surface.response";
  surface: A2UISurfaceEnvelope;
  decision: {
    mode: "render_surface";
    reason?: string;
    strategy?: string;
    score?: number;
    templateId: string;
    candidates?: A2UICandidateTrace[];
    mapping?: A2UIMappingDecision;
    aiSurfacePlanTrace?: A2UISurfacePlanTrace;
    diagnostic?: A2UISurfacePlanTrace["diagnostic"];
    sourceTool?: Record<string, unknown>;
    dataIntegrity?: Record<string, unknown>;
  };
};

export type A2ATraceArtifactData = {
  kind: "a2ui.matcher.trace" | "a2ui.ai_surface_plan.trace";
  strategy?: string;
  score?: number;
  candidateCount: number;
  candidates?: A2UICandidateTrace[];
  mapping?: A2UIMappingDecision;
  aiSurfacePlanTrace?: A2UISurfacePlanTrace;
  diagnostic?: A2UISurfacePlanTrace["diagnostic"];
  sourceTool?: Record<string, unknown>;
  dataIntegrity?: Record<string, unknown>;
};

export function a2aHeaders(init?: HeadersInit): HeadersInit {
  return {
    "Content-Type": `${A2A_JSON}; charset=utf-8`,
    ...init,
  };
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function textFromMessage(message?: A2AMessage) {
  return message?.parts?.find((part) => typeof part.text === "string")?.text ?? "";
}

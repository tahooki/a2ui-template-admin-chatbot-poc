export type AgentFlowActor =
  | "chat"
  | "next"
  | "main_agent"
  | "a2ui"
  | "llm"
  | "business_db"
  | "a2ui_render_tool"
  | "registry";

export type AgentFlowPhase =
  | "idle"
  | "request"
  | "bridge"
  | "planning"
  | "intent"
  | "general_chat"
  | "data_loaded"
  | "profile"
  | "registry_loaded"
  | "matcher"
  | "surface"
  | "no_template"
  | "text_fallback"
  | "error"
  | "done";

export type AgentFlowBranch = "general" | "data" | "matched" | "no_template" | "error";

export type AgentFlowSeverity = "info" | "success" | "warning" | "error";

export type AgentFlowEmitter = "chat" | "next" | "main-agent" | "a2ui-agent";

export type AgentFlowEvidenceKind = "observed" | "inferred_transport" | "trace_derived";

export type AgentFlowEvent = {
  id: string;
  turnId: string;
  at: string;
  event: string;
  phase: AgentFlowPhase;
  from?: AgentFlowActor;
  to?: AgentFlowActor;
  label: string;
  detail?: string;
  branch?: AgentFlowBranch;
  severity?: AgentFlowSeverity;
  physicalEmitter?: AgentFlowEmitter;
  evidenceKind?: AgentFlowEvidenceKind;
  data?: Record<string, unknown>;
};

export type ChatFlowSourceEvent = {
  kind: "local" | "sse";
  event: string;
  data: Record<string, unknown>;
  turnId: string;
  query: string;
  registryVersion: number;
  at: string;
};

export type ChatFlowDisplayTiming = {
  surfaceDelayMs?: number;
  textDelayMs?: number;
};

export type AgentFlowAdapterState = {
  hasDataTask: boolean;
  hasMatcher: boolean;
  hasSurface: boolean;
  branch?: AgentFlowBranch;
};

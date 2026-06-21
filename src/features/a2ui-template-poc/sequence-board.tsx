"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, UIEvent as ReactUIEvent } from "react";
import styles from "./styles.module.css";
import type { AgentFlowActor, AgentFlowBranch, AgentFlowEvent, AgentFlowEvidenceKind, AgentFlowPhase } from "./agent-flow-types";
import type { DataBoundaryScenarioTrace } from "./data-boundary-lab";

type ActorLane = {
  id: AgentFlowActor;
  label: string;
};

type SequenceStep = {
  id: string;
  phase: AgentFlowPhase;
  events?: string[];
  from: AgentFlowActor;
  to: AgentFlowActor;
  label: string;
  branch?: AgentFlowBranch;
  a2uiSubstep?: boolean;
  rowTop: number;
  rowBottom: number;
  y: number;
};

type SequenceStepGap = "row" | "section" | "selfLoop";

type SequenceStepSpec = Omit<SequenceStep, "rowTop" | "rowBottom" | "y"> & {
  gapBefore?: SequenceStepGap;
};

type BranchBlock = {
  id: AgentFlowBranch;
  label: string;
  left: number;
  width: number;
  top: number;
  height: number;
};

type BranchBlockSpec = {
  id: AgentFlowBranch;
  label: string;
  firstStepId: string;
  lastStepId: string;
};

type FocusRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
  zoom?: number;
  target: string;
};

type CameraState = {
  x: number;
  y: number;
  zoom: number;
  target: string;
  mode: "auto" | "user";
};

type SequenceBoardProps = {
  events: AgentFlowEvent[];
  actorLabels?: Partial<Record<AgentFlowActor, string>>;
  showA2UISubsteps?: boolean;
  dataBoundaryTrace?: DataBoundaryScenarioTrace;
};

const lanes: ActorLane[] = [
  { id: "chat", label: "Chat UI" },
  { id: "next", label: "Next /api/chat" },
  { id: "main_agent", label: "Main Agent" },
  { id: "llm", label: "LLM" },
  { id: "business_db", label: "Business DB/API" },
  { id: "a2ui_render_tool", label: "Python render boundary" },
  { id: "a2ui", label: "A2UI Agent" },
  { id: "registry", label: "A2UI Registry" },
];

const actorNodeWidth = 144;
const laneWidth = 156;
const laneGutter = 38;
const canvasLeftInset = 110;
const canvasRightInset = 130;
const canvasWidth = canvasLeftInset + canvasRightInset + lanes.length * laneWidth + (lanes.length - 1) * laneGutter;
const overviewZoom = 0.86;
const focusZoom = 1;
const minZoom = 0.65;
const maxZoom = 1.25;
const zoomStep = 0.1;
const manualAutoFollowPauseMs = 1600;
const sequenceLayout = {
  firstRowTop: 80,
  labelHeight: 30,
  labelLineGap: 18,
  lineStrokeWidth: 2,
  selfLoopHeight: 44,
  branchBorderWidth: 1,
  branchLabelInsetX: 8,
  branchLabelInsetTop: 6,
  branchLabelHeight: 20,
  branchPaddingBottom: 34,
  branchBetweenGap: 18,
  canvasBottomPadding: 80,
} as const;
const branchHeaderHeight = sequenceLayout.branchBorderWidth + sequenceLayout.branchLabelInsetTop + sequenceLayout.branchLabelHeight + sequenceLayout.labelLineGap;
const sequenceStepGaps: Record<SequenceStepGap, number> = {
  row: 34,
  section: branchHeaderHeight + sequenceLayout.branchPaddingBottom + sequenceLayout.branchBetweenGap,
  selfLoop: 34,
};
const clickableStepIds = new Set([
  "business-tool-result",
  "a2ui-tool-call",
  "a2a-send",
  "a2ui-source-preview",
  "registry-loaded",
  "matcher",
  "plan-validation",
  "mapping-applied",
  "a2a-result",
  "a2ui-tool-result",
  "surface",
]);

function laneX(actor: AgentFlowActor) {
  const index = lanes.findIndex((lane) => lane.id === actor);
  return canvasLeftInset + index * (laneWidth + laneGutter) + laneWidth / 2;
}

const diagramLeft = laneX("chat") - actorNodeWidth / 2 - 36;
const diagramRight = laneX("registry") + actorNodeWidth / 2 + 36;
const diagramWidth = diagramRight - diagramLeft;

function buildSequenceSteps(specs: SequenceStepSpec[]) {
  let currentRowTop: number = sequenceLayout.firstRowTop;
  return specs.map((spec, index) => {
    const gapBefore = spec.gapBefore;
    if (index > 0) currentRowTop += sequenceStepGaps[gapBefore ?? "row"];
    const step = { ...spec };
    delete step.gapBefore;
    const y = currentRowTop + sequenceLayout.labelHeight + sequenceLayout.labelLineGap;
    const rowBottom = y + (laneX(step.from) === laneX(step.to) ? sequenceLayout.selfLoopHeight : 0);
    const sequenceStep = { ...step, rowTop: currentRowTop, rowBottom, y } as SequenceStep;
    currentRowTop = rowBottom;
    return sequenceStep;
  });
}

const steps: SequenceStep[] = buildSequenceSteps([
  { id: "request", phase: "request", events: ["request_start"], from: "chat", to: "next", label: "POST /api/chat" },
  { id: "bridge", phase: "bridge", events: ["response_open"], from: "next", to: "main_agent", label: "Open /chat/stream" },
  { id: "planning", phase: "planning", events: ["state:planning"], from: "main_agent", to: "main_agent", label: "Plan turn" },
  { id: "intent", phase: "intent", events: ["state:intent"], from: "main_agent", to: "llm", label: "Intent classify", gapBefore: "selfLoop" },
  { id: "general-llm", phase: "general_chat", events: ["llm:answer"], from: "llm", to: "main_agent", label: "Text answer", branch: "general", gapBefore: "section" },
  { id: "general-stream", phase: "general_chat", events: ["text", "delta"], from: "main_agent", to: "chat", label: "Stream to chat", branch: "general" },
  {
    id: "business-tool-selected",
    phase: "intent",
    events: ["state:business_tool_selected"],
    from: "main_agent",
    to: "main_agent",
    label: "Select business API",
    branch: "data",
    gapBefore: "section",
  },
  {
    id: "business-tool-call",
    phase: "data_loaded",
    events: ["state:business_tool_call", "state:tool"],
    from: "main_agent",
    to: "business_db",
    label: "Call get_equipment_*",
    branch: "data",
    gapBefore: "selfLoop",
  },
  {
    id: "business-tool-result",
    phase: "data_loaded",
    events: ["state:business_tool_result", "state:data_loaded"],
    from: "business_db",
    to: "main_agent",
    label: "Source data for compare",
    branch: "data",
  },
  {
    id: "a2ui-tool-selected",
    phase: "registry_loaded",
    events: ["state:a2ui_tool_selected"],
    from: "main_agent",
    to: "main_agent",
    label: "Select a2ui_render",
    branch: "data",
  },
  {
    id: "a2ui-tool-call",
    phase: "registry_loaded",
    events: ["state:a2ui_tool_call"],
    from: "main_agent",
    to: "a2ui_render_tool",
    label: "Invoke a2ui_render boundary",
    branch: "data",
    gapBefore: "selfLoop",
  },
  {
    id: "a2a-send",
    phase: "registry_loaded",
    events: ["transport:a2a_send"],
    from: "a2ui_render_tool",
    to: "a2ui",
    label: "POST /api/a2a/message:send",
    branch: "data",
    a2uiSubstep: true,
  },
  {
    id: "a2ui-source-preview",
    phase: "profile",
    events: ["state:source_preview", "state:profile"],
    from: "a2ui",
    to: "a2ui",
    label: "Build A2UI source preview",
    branch: "data",
    a2uiSubstep: true,
  },
  {
    id: "registry-request",
    phase: "registry_loaded",
    events: ["state:template_contracts", "state:a2a"],
    from: "a2ui",
    to: "registry",
    label: "Load template contracts",
    branch: "data",
  },
  {
    id: "registry-loaded",
    phase: "registry_loaded",
    events: ["state:registry_loaded"],
    from: "registry",
    to: "a2ui",
    label: "Template contracts loaded",
    branch: "data",
  },
  { id: "matcher", phase: "matcher", events: ["state:ai_surface_plan", "state:matcher"], from: "a2ui", to: "a2ui", label: "AI Surface Planner", branch: "data", a2uiSubstep: true },
  { id: "plan-validation", phase: "matcher", events: ["state:plan_validation"], from: "a2ui", to: "a2ui", label: "Validate AI plan", branch: "data", a2uiSubstep: true },
  { id: "mapping-applied", phase: "matcher", events: ["state:mapping_applied"], from: "a2ui", to: "a2ui", label: "Apply field/slot mapping", branch: "data", a2uiSubstep: true },
  {
    id: "a2a-result",
    phase: "matcher",
    events: ["transport:a2a_result"],
    from: "a2ui",
    to: "a2ui_render_tool",
    label: "Return trace + surface artifact",
    branch: "data",
    a2uiSubstep: true,
  },
  {
    id: "a2ui-tool-result",
    phase: "matcher",
    events: ["state:a2ui_tool_result"],
    from: "a2ui_render_tool",
    to: "main_agent",
    label: "Return A2UIRenderToolResult",
    branch: "data",
    a2uiSubstep: true,
    gapBefore: "selfLoop",
  },
  {
    id: "matched-summary",
    phase: "surface",
    events: ["text", "delta"],
    from: "main_agent",
    to: "chat",
    label: "Text summary",
    branch: "matched",
    gapBefore: "section",
  },
  {
    id: "surface",
    phase: "surface",
    events: ["surface"],
    from: "main_agent",
    to: "chat",
    label: "Return SurfaceEnvelope",
    branch: "matched",
  },
  {
    id: "no-template",
    phase: "no_template",
    events: ["matcher:no_template"],
    from: "a2ui",
    to: "a2ui",
    label: "No compatible template",
    branch: "no_template",
    gapBefore: "section",
  },
  {
    id: "fallback",
    phase: "text_fallback",
    events: ["text", "delta"],
    from: "main_agent",
    to: "chat",
    label: "Emit fallback text",
    branch: "no_template",
    gapBefore: "selfLoop",
  },
  { id: "error", phase: "error", events: ["error", "request_error", "response_error"], from: "main_agent", to: "chat", label: "Runtime error", branch: "error", gapBefore: "section" },
]);

const stepById = new Map(steps.map((step) => [step.id, step]));

function stepLabelTop(step: SequenceStep) {
  return step.rowTop;
}

function stepLineBottom(step: SequenceStep) {
  return step.rowBottom;
}

function branchBlockFromSpec(spec: BranchBlockSpec): BranchBlock {
  const firstStep = stepById.get(spec.firstStepId);
  const lastStep = stepById.get(spec.lastStepId);
  if (!firstStep || !lastStep) {
    throw new Error(`Missing sequence step for branch ${spec.id}`);
  }
  const top = stepLabelTop(firstStep) - branchHeaderHeight;
  const bottom = stepLineBottom(lastStep) + sequenceLayout.branchPaddingBottom;
  return {
    id: spec.id,
    label: spec.label,
    left: diagramLeft,
    width: diagramWidth,
    top,
    height: bottom - top,
  };
}

const branchBlockSpecs: BranchBlockSpec[] = [
  { id: "general", label: "alt general chat", firstStepId: "general-llm", lastStepId: "general-stream" },
  { id: "data", label: "else data task", firstStepId: "business-tool-selected", lastStepId: "a2ui-tool-result" },
  { id: "matched", label: "then matched: SurfaceEnvelope", firstStepId: "matched-summary", lastStepId: "surface" },
  { id: "no_template", label: "else no template: fallback text", firstStepId: "no-template", lastStepId: "fallback" },
  { id: "error", label: "else error", firstStepId: "error", lastStepId: "error" },
];

const branchBlocks: BranchBlock[] = branchBlockSpecs.map(branchBlockFromSpec);

const canvasHeight = Math.ceil(Math.max(...branchBlocks.map((block) => block.top + block.height)) + sequenceLayout.canvasBottomPadding);

function isDataOutcomeBranch(branch?: AgentFlowBranch) {
  return branch === "matched" || branch === "no_template" || branch === "error";
}

function eventMatchesStep(step: SequenceStep, event?: AgentFlowEvent) {
  if (!event) return false;
  const matchesEvent = step.events ? step.events.includes(event.event) : event.phase === step.phase;
  if (!matchesEvent) return false;
  if (!step.branch) return true;
  if (!event.branch) return false;
  if (step.branch === "data") return event.branch === "data";
  return step.branch === event.branch;
}

function stepEvidenceKind(step: SequenceStep, events: AgentFlowEvent[], active?: AgentFlowEvent): AgentFlowEvidenceKind | undefined {
  if (eventMatchesStep(step, active)) return active?.evidenceKind;
  return events.findLast((event) => eventMatchesStep(step, event))?.evidenceKind;
}

function evidenceLabel(kind?: AgentFlowEvidenceKind) {
  if (kind === "inferred_transport") return "transport";
  if (kind === "trace_derived") return "trace";
  if (kind === "observed") return "event";
  return undefined;
}

function branchSet(events: AgentFlowEvent[]) {
  return new Set(events.map((event) => event.branch).filter(Boolean) as AgentFlowBranch[]);
}

function completedStepSet(events: AgentFlowEvent[], visibleSteps: SequenceStep[]) {
  return new Set(visibleSteps.filter((step) => events.some((event) => eventMatchesStep(step, event))).map((step) => step.id));
}

function isMatchedSurfaceStep(step: SequenceStep) {
  return step.branch === "matched" && step.phase === "surface" && (step.id === "matched-summary" || step.id === "surface");
}

function isMatchedSurfaceEvent(event?: AgentFlowEvent) {
  return Boolean(event && event.branch === "matched" && event.phase === "surface" && ["delta", "surface", "text"].includes(event.event));
}

function isActiveStep(step: SequenceStep, active: AgentFlowEvent | undefined, completed: Set<string>) {
  if (eventMatchesStep(step, active)) return true;
  return Boolean(active?.event === "surface" && isMatchedSurfaceEvent(active) && isMatchedSurfaceStep(step) && completed.has("matched-summary"));
}

function stepClass(step: SequenceStep, completed: Set<string>, active?: AgentFlowEvent, evidenceKind?: AgentFlowEvidenceKind) {
  const classes = [styles.sequenceStep];
  if (step.branch) classes.push(styles[`sequenceStep_${step.branch}`]);
  if (evidenceKind) classes.push(styles[`sequenceStepEvidence_${evidenceKind}`]);
  if (completed.has(step.id)) classes.push(styles.sequenceStepComplete);
  if (isActiveStep(step, active, completed)) classes.push(styles.sequenceStepActive);
  if (!completed.has(step.id) && !isActiveStep(step, active, completed)) classes.push(styles.sequenceStepPreview);
  if (step.branch && active?.branch && step.branch !== active.branch && !(step.branch === "data" && isDataOutcomeBranch(active.branch))) {
    classes.push(styles.sequenceStepMuted);
  }
  return classes.filter(Boolean).join(" ");
}

function messageLineClass(step: SequenceStep, completed: Set<string>, active?: AgentFlowEvent, evidenceKind?: AgentFlowEvidenceKind) {
  const { x1, x2, loopX } = stepEndpoints(step);
  const classes = [styles.sequenceMessageLine];
  if (step.branch) classes.push(styles[`sequenceMessageLine_${step.branch}`]);
  if (evidenceKind) classes.push(styles[`sequenceMessageLineEvidence_${evidenceKind}`]);
  if (completed.has(step.id)) classes.push(styles.sequenceMessageLineComplete);
  if (isActiveStep(step, active, completed)) classes.push(styles.sequenceMessageLineActive);
  if (!completed.has(step.id) && !isActiveStep(step, active, completed)) classes.push(styles.sequenceMessageLinePreview);
  if (loopX) classes.push(styles.sequenceMessageLineSelf);
  if (!loopX && x1 > x2) classes.push(styles.sequenceMessageLineReverse);
  if (step.branch && active?.branch && step.branch !== active.branch && !(step.branch === "data" && isDataOutcomeBranch(active.branch))) {
    classes.push(styles.sequenceMessageLineMuted);
  }
  return classes.filter(Boolean).join(" ");
}

function branchClass(block: BranchBlock, branches: Set<AgentFlowBranch>, active?: AgentFlowEvent) {
  const classes = [styles.branchBlock, styles[`branchBlock_${block.id}`]];
  if (branches.has(block.id) || active?.branch === block.id || (block.id === "data" && isDataOutcomeBranch(active?.branch))) {
    classes.push(styles.branchBlockActive);
  } else if (active?.branch) {
    classes.push(styles.branchBlockMuted);
  }
  return classes.filter(Boolean).join(" ");
}

function stepEndpoints(step: SequenceStep) {
  const fromX = laneX(step.from);
  const toX = laneX(step.to);
  if (fromX === toX) {
    return { x1: fromX, x2: fromX, y1: step.y, y2: step.y + sequenceLayout.selfLoopHeight, loopX: fromX + 118 };
  }
  return { x1: fromX, x2: toX, y1: step.y, y2: step.y };
}

function labelPosition(step: SequenceStep) {
  const { x1, x2, loopX } = stepEndpoints(step);
  if (loopX) return { left: x1 + (loopX - x1) / 2, top: step.rowTop };
  return { left: Math.min(x1, x2) + Math.abs(x2 - x1) / 2, top: step.rowTop };
}

function messageLineStyle(step: SequenceStep) {
  const { x1, x2, y1, y2, loopX } = stepEndpoints(step);
  if (loopX) return { left: x1, top: y1, width: loopX - x1, height: y2 - y1 };
  return { left: Math.min(x1, x2), top: y1, width: Math.abs(x2 - x1) };
}

function packetRailClass(step: SequenceStep) {
  const { x1, x2, loopX } = stepEndpoints(step);
  return [
    styles.sequencePacketRail,
    step.branch ? styles[`sequencePacketRail_${step.branch}`] : "",
    loopX ? styles.sequencePacketRailSelf : "",
    !loopX && x1 > x2 ? styles.sequencePacketRailReverse : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function packetRailStyle(step: SequenceStep) {
  const { x1, x2, y1, y2, loopX } = stepEndpoints(step);
  if (loopX) return { left: x1, top: y1, width: loopX - x1, height: y2 - y1 };
  return { left: Math.min(x1, x2), top: y1, width: Math.abs(x2 - x1) };
}

function actorChipStyle(actor: AgentFlowActor, zoom: number, scrollLeft: number) {
  return {
    left: laneX(actor) * zoom - scrollLeft,
    width: actorNodeWidth * zoom,
  };
}

function clampZoom(value: number) {
  return Math.min(maxZoom, Math.max(minZoom, Number(value.toFixed(2))));
}

function paddedRegion(block: BranchBlock, padding = 34): FocusRegion {
  return {
    left: Math.max(0, block.left - padding),
    top: Math.max(0, block.top - padding),
    width: block.width + padding * 2,
    height: block.height + padding * 2,
    zoom: focusZoom,
    target: block.id,
  };
}

function branchRegion(branch: AgentFlowBranch) {
  const block = branchBlocks.find((candidate) => candidate.id === branch);
  return block ? paddedRegion(block) : undefined;
}

function actorEdgeRegion(from: AgentFlowActor, to: AgentFlowActor, y: number, target: string, zoom = focusZoom): FocusRegion {
  const x1 = laneX(from);
  const x2 = laneX(to);
  const left = Math.min(x1, x2) - actorNodeWidth / 2 - 52;
  const width = Math.abs(x2 - x1) + actorNodeWidth + 104;
  return {
    left: Math.max(0, left),
    top: Math.max(0, y - 122),
    width,
    height: 226,
    zoom,
    target,
  };
}

function selfRegion(actor: AgentFlowActor, y: number, target: string): FocusRegion {
  const x = laneX(actor);
  return {
    left: Math.max(0, x - actorNodeWidth / 2 - 52),
    top: Math.max(0, y - 122),
    width: actorNodeWidth + 240,
    height: 226,
    zoom: focusZoom,
    target,
  };
}

function focusRegionForStep(step: SequenceStep): FocusRegion {
  if (step.branch === "matched") return actorEdgeRegion(step.from, step.to, step.y, "matched", 0.86);
  if (step.id === "fallback") return actorEdgeRegion(step.from, step.to, step.y, "no_template", 0.78);
  if (step.branch === "no_template") return selfRegion("a2ui", step.y, "no_template");
  if (step.branch === "error") return actorEdgeRegion(step.from, step.to, step.y, "error", 0.86);
  if (step.branch === "general") return branchRegion("general") ?? actorEdgeRegion(step.from, step.to, step.y, step.phase);
  if (step.from === step.to) return selfRegion(step.from, step.y, step.phase);
  if (step.branch === "data") return branchRegion("data") ?? actorEdgeRegion(step.from, step.to, step.y, step.phase);
  return actorEdgeRegion(step.from, step.to, step.y, step.phase);
}

function scrollTargetForRegion(region: FocusRegion, viewport: HTMLDivElement, zoom: number) {
  const centerX = (region.left + region.width / 2) * zoom;
  const centerY = (region.top + region.height / 2) * zoom;
  const maxLeft = Math.max(0, canvasWidth * zoom - viewport.clientWidth);
  const maxTop = Math.max(0, canvasHeight * zoom - viewport.clientHeight);
  return {
    left: Math.min(maxLeft, Math.max(0, centerX - viewport.clientWidth / 2)),
    top: Math.min(maxTop, Math.max(0, centerY - viewport.clientHeight / 2)),
  };
}

function stepForDoneEvent(active: AgentFlowEvent | undefined, visibleSteps: SequenceStep[]) {
  if (active?.phase !== "done") return undefined;
  if (active.branch === "matched") return visibleSteps.find((step) => step.id === "surface");
  if (active.branch === "no_template") return visibleSteps.find((step) => step.id === "fallback");
  if (active.branch === "error") return visibleSteps.find((step) => step.id === "error");
  if (active.branch === "general") return visibleSteps.find((step) => step.id === "general-stream");
  return undefined;
}

function cameraStateForScroll(target: string, left: number, top: number, zoom: number, mode: CameraState["mode"]): CameraState {
  return {
    x: Math.round(left / zoom),
    y: Math.round(top / zoom),
    zoom,
    target,
    mode,
  };
}

type DetailMetric = {
  label: string;
  value: string;
  tone?: "success" | "warning";
};

type DetailFlowItem = {
  title: string;
  body: string;
};

type DetailMappingRow = {
  source: string;
  target: string;
  decision: string;
};

type DetailComparisonSide = {
  title: string;
  items: DetailMetric[];
};

type DetailViewModel = {
  eyebrow: string;
  title: string;
  purpose: string;
  metrics?: DetailMetric[];
  comparison?: {
    left: DetailComparisonSide;
    right: DetailComparisonSide;
  };
  flow?: DetailFlowItem[];
  mappings?: DetailMappingRow[];
  outcome?: string;
};

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function formatStrategy(value?: string) {
  return value ? value.replaceAll("_", " ") : "-";
}

function compactPath(value: string) {
  return value.replace(/^items\./, "items[].");
}

function compactList(values: string[] | undefined, fallback = "-", limit = 3) {
  if (!values?.length) return fallback;
  const visible = values.slice(0, limit);
  const suffix = values.length > visible.length ? ` +${values.length - visible.length}` : "";
  return `${visible.join(", ")}${suffix}`;
}

function requiredSlotSummary(trace: DataBoundaryScenarioTrace) {
  return compactList(trace.templateContract.inputSchema?.requiredSlots.map((slot) => slot.slot), "none");
}

function capabilitySummary(trace: DataBoundaryScenarioTrace) {
  const capabilities = trace.derivedSchema.capabilities;
  return [
    capabilities.hasBooleans ? "boolean status" : undefined,
    capabilities.hasImages ? "images" : undefined,
    capabilities.hasNumericMetrics ? "metrics" : undefined,
    capabilities.hasTimeField ? "time" : undefined,
  ]
    .filter(Boolean)
    .join(", ") || "basic fields";
}

function templateCapabilitySummary(trace: DataBoundaryScenarioTrace) {
  const capabilities = trace.templateContract.inputSchema?.accepts.capabilities;
  if (!capabilities) return "not required";
  return Object.entries(capabilities)
    .filter(([, value]) => value)
    .map(([key]) => key.replace(/^has/, ""))
    .join(", ") || "not required";
}

function missingSlotSummary(trace: DataBoundaryScenarioTrace) {
  return compactList(trace.renderPlan.mapping?.missingSlots, "none");
}

function selectedMappingCount(trace: DataBoundaryScenarioTrace) {
  return trace.renderPlan.mapping?.mappings.length ?? trace.mappingComparison.length;
}

function renderTraceRecord(trace: DataBoundaryScenarioTrace) {
  const renderTrace = trace.renderPlan.aiSurfacePlanTrace;
  return renderTrace && typeof renderTrace === "object" && !Array.isArray(renderTrace)
    ? (renderTrace as Record<string, unknown>)
    : {};
}

function renderTraceArray(trace: DataBoundaryScenarioTrace, key: string) {
  const value = renderTraceRecord(trace)[key];
  return Array.isArray(value) ? value : undefined;
}

function mappedRowCount(trace: DataBoundaryScenarioTrace) {
  const renderRowCount = renderTraceRecord(trace).renderRowCount;
  return typeof renderRowCount === "number" ? renderRowCount : trace.aiSurfacePlanTrace.displayRowCount;
}

function fieldMappingCount(trace: DataBoundaryScenarioTrace) {
  return renderTraceArray(trace, "fieldMappings")?.length ?? trace.aiSurfacePlanTrace.rules.length;
}

function comparisonInput(trace: DataBoundaryScenarioTrace): DetailViewModel["comparison"] {
  return {
    left: {
      title: "AI input: source preview",
      items: [
        { label: "Shape", value: trace.derivedSchema.shape },
        { label: "Rows", value: formatCount(trace.derivedSchema.rowCount) },
        { label: "Field paths", value: formatCount(trace.aiSurfacePlanTrace.sourceFieldPaths.length) },
        { label: "Capabilities", value: capabilitySummary(trace) },
      ],
    },
    right: {
      title: "AI input: template contract",
      items: [
        { label: "Template", value: trace.templateContract.componentId },
        { label: "View type", value: trace.templateContract.surfaceConfig.viewType },
        { label: "Required slots", value: requiredSlotSummary(trace) },
        { label: "Required capabilities", value: templateCapabilitySummary(trace) },
      ],
    },
  };
}

function judgmentMetrics(trace: DataBoundaryScenarioTrace): DetailMetric[] {
  return [
    { label: "Selected template", value: trace.renderPlan.selectedComponentId, tone: "success" },
    { label: "Decision score", value: trace.renderPlan.score.toFixed(2), tone: trace.renderPlan.score >= 0.8 ? "success" : "warning" },
    { label: "Strategy", value: formatStrategy(trace.renderPlan.strategy) },
    { label: "Missing slots", value: missingSlotSummary(trace), tone: trace.renderPlan.mapping?.missingSlots.length ? "warning" : "success" },
  ];
}

function decisionReason(trace: DataBoundaryScenarioTrace) {
  return trace.renderPlan.mapping?.reason ?? trace.renderPlan.reason;
}

function plannerRuleSummary(trace: DataBoundaryScenarioTrace): DetailFlowItem[] {
  const fieldMappings = renderTraceArray(trace, "fieldMappings") as Array<Record<string, unknown>> | undefined;
  if (fieldMappings?.length) {
    return fieldMappings.slice(0, 4).map((mapping) => ({
      title: `${String(mapping.sourcePath ?? "-")} -> ${String(mapping.targetField ?? "-")}`,
      body: formatStrategy(typeof mapping.transform === "string" ? mapping.transform : undefined),
    }));
  }

  const rules = trace.aiSurfacePlanTrace.rules.slice(0, 4);
  if (rules.length === 0) {
    return [
      {
        title: "Keep field binding",
        body: "The AI plan can use the source field path directly for this screen slot.",
      },
    ];
  }

  return rules.map((rule) => ({
    title: `${rule.sourceField} -> ${rule.targetField}`,
    body: formatStrategy(rule.transform),
  }));
}

function sourceToolResultId(trace: DataBoundaryScenarioTrace) {
  return `demo-tool-result-${trace.id}`;
}

function DetailMetrics({ items }: { items: DetailMetric[] }) {
  return (
    <div className={styles.sequenceDetailCards}>
      {items.map((item) => (
        <div className={`${styles.sequenceDetailCard} ${item.tone ? styles[`sequenceDetailCard_${item.tone}`] : ""}`} key={`${item.label}-${item.value}`}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function DetailFlow({ items }: { items: DetailFlowItem[] }) {
  return (
    <div className={styles.sequenceDetailFlow}>
      {items.map((item, index) => (
        <div className={styles.sequenceDetailFlowItem} key={`${item.title}-${index}`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailComparison({ left, right }: { left: DetailComparisonSide; right: DetailComparisonSide }) {
  return (
    <div className={styles.sequenceComparisonGrid}>
      {[left, right].map((side) => (
        <div className={styles.sequenceComparisonPanel} key={side.title}>
          <strong>{side.title}</strong>
          <div>
            {side.items.map((item) => (
              <span key={`${side.title}-${item.label}`}>
                <small>{item.label}</small>
                <b>{item.value}</b>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailMapping({ rows }: { rows: DetailMappingRow[] }) {
  return (
    <div className={styles.sequenceMappingTable}>
      {rows.map((row) => (
        <div key={`${row.source}-${row.target}-${row.decision}`}>
          <span>{row.source}</span>
          <span>{row.target}</span>
          <strong>{row.decision}</strong>
        </div>
      ))}
    </div>
  );
}

function DetailView({ view }: { view: DetailViewModel }) {
  return (
    <aside className={styles.sequenceTraceDetail} aria-label="Sequence trace detail">
      <div className={styles.sequenceDetailHeader}>
        <span>{view.eyebrow}</span>
        <strong>{view.title}</strong>
      </div>
      <p className={styles.sequenceDetailPurpose}>{view.purpose}</p>
      {view.metrics?.length ? <DetailMetrics items={view.metrics} /> : null}
      {view.comparison ? <DetailComparison left={view.comparison.left} right={view.comparison.right} /> : null}
      {view.flow?.length ? <DetailFlow items={view.flow} /> : null}
      {view.mappings?.length ? <DetailMapping rows={view.mappings} /> : null}
      {view.outcome ? <p className={styles.sequenceDetailOutcome}>{view.outcome}</p> : null}
    </aside>
  );
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rowsFromUnknown(data: unknown) {
  const root = recordValue(data);
  const result = recordValue(root.result);
  const rows = Array.isArray(root.items)
    ? root.items
    : Array.isArray(root.rows)
      ? root.rows
      : Array.isArray(result.rows)
        ? result.rows
        : [];
  return rows.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function rawColumnCount(trace: DataBoundaryScenarioTrace) {
  const firstRow = rowsFromUnknown(trace.sourceData)[0];
  return firstRow ? Object.keys(firstRow).length : 0;
}

function stepEvent(step: SequenceStep, events: AgentFlowEvent[]) {
  const stepEvents = step.events ?? [];
  return events.findLast((event) => stepEvents.includes(event.event));
}

function stepToolName(step: SequenceStep, trace: DataBoundaryScenarioTrace | undefined, events: AgentFlowEvent[]) {
  if (trace) return trace.businessToolName;
  const event = stepEvent(step, events);
  const eventData = recordValue(event?.data);
  const sourceToolName = eventData.sourceToolName;
  const label = eventData.label;
  return typeof sourceToolName === "string" ? sourceToolName : typeof label === "string" ? label : undefined;
}

function stepDisplayLabel(step: SequenceStep, trace: DataBoundaryScenarioTrace | undefined, events: AgentFlowEvent[]) {
  const toolName = stepToolName(step, trace, events);
  if (step.id === "business-tool-call" && toolName) return `Call ${toolName}`;
  if (step.id === "business-tool-selected" && toolName) return `Select ${toolName}`;
  return step.label;
}

function eventForStep(step: SequenceStep, events: AgentFlowEvent[]) {
  return events.findLast((event) => eventMatchesStep(step, event));
}

function liveDetailView(selectedEvent: AgentFlowEvent): DetailViewModel {
  const fromTo = [selectedEvent.from, selectedEvent.to].filter(Boolean).join(" -> ") || "-";
  const mapping = recordValue(selectedEvent.data?.mapping);
  const mappings = Array.isArray(mapping.mappings) ? mapping.mappings : undefined;
  const candidates = Array.isArray(selectedEvent.data?.candidates) ? selectedEvent.data.candidates : undefined;
  const evidence = evidenceLabel(selectedEvent.evidenceKind) ?? "event";
  const traceStep = typeof selectedEvent.data?.traceStep === "string" ? selectedEvent.data.traceStep : undefined;
  return {
    eyebrow: selectedEvent.evidenceKind === "trace_derived" ? "Trace-derived evidence" : selectedEvent.evidenceKind === "inferred_transport" ? "Inferred transport" : "Live event",
    title: selectedEvent.label,
    purpose: selectedEvent.detail || "This event shows the current payload boundary in the running chat turn.",
    metrics: [
      { label: "Arrow", value: fromTo },
      { label: "Phase", value: selectedEvent.phase },
      { label: "Branch", value: selectedEvent.branch ?? "main" },
      { label: "Evidence", value: evidence },
      { label: "Emitter", value: selectedEvent.physicalEmitter ?? "-" },
      ...(traceStep ? [{ label: "Trace step", value: traceStep }] : []),
      ...(mappings ? [{ label: "Mappings", value: formatCount(mappings.length) }] : []),
      ...(candidates ? [{ label: "Candidates", value: formatCount(candidates.length) }] : []),
    ],
    flow: [
      {
        title: selectedEvent.evidenceKind === "trace_derived" ? "Returned trace read" : "Event received",
        body: selectedEvent.event,
      },
      {
        title: "Displayed as sequence step",
        body: selectedEvent.label,
      },
      ...(selectedEvent.evidenceKind === "trace_derived"
        ? [
            {
              title: "Not a live A2UI progress event",
              body: "This step is reconstructed from the A2UI result metadata after the render boundary returns.",
            },
          ]
        : []),
    ],
  };
}

function traceDetailView(selectedStep: string, trace: DataBoundaryScenarioTrace): DetailViewModel {
  const renderToolMetadata = recordValue(trace.a2uiRenderPayload.toolMetadata);
  const renderToolName = typeof renderToolMetadata.renderToolName === "string" ? renderToolMetadata.renderToolName : "a2ui_render";
  const sourceToolName = typeof renderToolMetadata.sourceToolName === "string" ? renderToolMetadata.sourceToolName : trace.businessToolName;
  const mappingRows = trace.mappingComparison.map((row) => ({
    source: compactPath(row.derivedField),
    target: row.templateSlot,
    decision: `${row.decision}${row.aliasOrNormalization !== "direct" ? ` via ${formatStrategy(row.aliasOrNormalization)}` : ""}`,
  }));

  if (selectedStep === "business-tool-selected") {
    return {
      eyebrow: "Tool choice",
      title: trace.businessToolName,
      purpose: "The Main Agent chooses which business API should answer the user's request. This is not UI template selection yet.",
      metrics: [
        { label: "User asks", value: trace.query },
        { label: "Selected API", value: trace.apiId },
        { label: "Tool", value: trace.businessToolName },
        { label: "Next arrow", value: "call business API" },
      ],
      flow: [
        { title: "Read intent", body: "The request is treated as a data task." },
        { title: "Pick data source", body: `${trace.businessToolName} is selected for ${trace.apiRoute}.` },
        { title: "Keep rendering separate", body: "A2UI field/template planning starts only after raw data comes back." },
      ],
    };
  }

  if (selectedStep === "business-tool-call") {
    return {
      eyebrow: "Business API call",
      title: trace.apiRoute,
      purpose: "This arrow sends the chosen data request to the business API. It carries the question and API identity, not an A2UI schema.",
      metrics: [
        { label: "Arrow carries", value: "API request" },
        { label: "Tool", value: trace.businessToolName },
        { label: "Route", value: trace.apiRoute },
        { label: "Query", value: trace.query },
      ],
      flow: [
        { title: "Call source system", body: "Main Agent asks the business data boundary for equipment data." },
        { title: "Wait for raw result", body: "The next step receives rows exactly from the API response." },
      ],
    };
  }

  if (selectedStep === "business-tool-result") {
    return {
      eyebrow: "Raw API result",
      title: "Source data captured",
      purpose: "This is the raw business API result. A2UI has not converted field names or selected a template yet.",
      metrics: [
        { label: "Source API", value: trace.businessToolName },
        { label: "Rows", value: formatCount(trace.sourceFingerprint.rowCount) },
        { label: "Columns", value: formatCount(rawColumnCount(trace)) },
        { label: "Next planner input", value: "bounded source preview" },
      ],
      flow: [
        { title: "Raw API result", body: `${formatCount(trace.sourceFingerprint.rowCount)} rows from ${trace.apiRoute}.` },
        { title: "A2UI-owned planning", body: "A2UI builds field paths and sample rows from this raw payload." },
        { title: "Expected decision path", body: "raw data -> source preview -> AI field/template plan -> validator -> surface." },
      ],
    };
  }

  if (selectedStep === "a2ui-tool-selected") {
    return {
      eyebrow: "Render boundary",
      title: renderToolName,
      purpose: "The Main Agent selects a2ui_render because business data exists and now needs a render decision. The template is still not chosen here.",
      metrics: [
        { label: "Input condition", value: "business data ready" },
        { label: "Selected tool", value: renderToolName },
        { label: "Source result", value: sourceToolResultId(trace) },
        { label: "Template choice", value: "later in AI planner" },
      ],
      flow: [
        { title: "Choose render tool", body: "The flow crosses from chat orchestration into A2UI rendering logic." },
        { title: "Defer UI selection", body: "The actual component is selected after the AI planner compares source fields with registry contracts." },
      ],
    };
  }

  if (selectedStep === "a2ui-tool-call") {
    return {
      eyebrow: "Planner payload",
      title: "Invoke Python render boundary",
      purpose: "The Main Agent invokes the local a2ui_render boundary with the raw business API result. This is still not the A2UI server-side template decision.",
      metrics: [
        { label: "Source", value: sourceToolName },
        { label: "Rows", value: formatCount(trace.aiSurfacePlanTrace.sourceRowCount) },
        { label: "Boundary", value: "Python a2ui_render" },
        { label: "Next arrow", value: "A2A message:send" },
      ],
      flow: [
        { title: "Call boundary", body: "The Python wrapper receives already-fetched raw business data." },
        { title: "Keep data raw", body: "No Python-side displayData or alias conversion should decide the final A2UI schema." },
        { title: "Judgment comes later", body: "The A2UI Agent chooses the template after receiving the A2A render request." },
      ],
    };
  }

  if (selectedStep === "a2a-send") {
    return {
      eyebrow: "A2A transport",
      title: "POST /api/a2a/message:send",
      purpose: "The Python render boundary sends the raw business result to the Next-hosted A2UI Agent as an A2A render request.",
      metrics: [
        { label: "Source", value: sourceToolName },
        { label: "Payload", value: "raw business result" },
        { label: "Endpoint", value: "/api/a2a/message:send" },
        { label: "Decision owner", value: "A2UI Agent" },
      ],
      flow: [
        { title: "Send render request", body: "The request carries raw data, query, API id, fallback text, and source metadata." },
        { title: "A2UI receives it", body: "Template comparison and field mapping happen after this boundary." },
      ],
    };
  }

  if (selectedStep === "a2ui-source-preview" || selectedStep === "profile") {
    return {
      eyebrow: "AI planner input",
      title: "Source preview built",
      purpose: "This is the bounded input A2UI gives the AI planner: field paths, sample rows, row count, and source shape.",
      metrics: [
        { label: "Shape", value: trace.aiSurfacePlanTrace.sourceShape },
        { label: "Field paths", value: formatCount(trace.aiSurfacePlanTrace.sourceFieldPaths.length) },
        { label: "Capabilities", value: capabilitySummary(trace) },
        { label: "Rows sampled", value: `${formatCount(trace.sampleDataPreview.sampleSize)} / ${formatCount(trace.sampleDataPreview.rowCount)}` },
      ],
      comparison: comparisonInput(trace),
      flow: [
        { title: "AI will read", body: "source field paths, examples, row shape, and template contracts." },
        { title: "Template will require", body: `${requiredSlotSummary(trace)} plus ${templateCapabilitySummary(trace)}.` },
        ...plannerRuleSummary(trace),
      ],
      outcome: "This step does not select the template yet. It prepares the AI planner input.",
    };
  }

  if (selectedStep === "registry-request" || selectedStep === "registry-loaded") {
    return {
      eyebrow: "AI planner input",
      title: trace.templateContract.componentId,
      purpose: "These are the registered A2UI template contracts the AI planner compares against the source preview.",
      metrics: [
        { label: "View type", value: trace.templateContract.surfaceConfig.viewType },
        { label: "Required slots", value: requiredSlotSummary(trace) },
        { label: "Required capabilities", value: templateCapabilitySummary(trace) },
        { label: "Candidate", value: trace.templateContract.componentId },
      ],
      comparison: comparisonInput(trace),
      flow: [
        { title: "Contract requirement", body: `${trace.templateContract.componentId} accepts ${trace.templateContract.surfaceConfig.viewType}.` },
        { title: "Comparison target", body: `AI checks whether source fields can fill ${requiredSlotSummary(trace)}.` },
      ],
    };
  }

  if (selectedStep === "matcher") {
    return {
      eyebrow: "AI judgment",
      title: `${trace.derivedSchema.sourceId} -> ${trace.renderPlan.selectedComponentId}`,
      purpose: "The AI surface planner compared the source preview with all registered template contracts and returned field mappings, slot mappings, and candidate reasons.",
      metrics: judgmentMetrics(trace),
      comparison: comparisonInput(trace),
      mappings: mappingRows,
      outcome: `${decisionReason(trace)}. The selected template is ${trace.renderPlan.selectedComponentId}.`,
    };
  }

  if (selectedStep === "plan-validation") {
    return {
      eyebrow: "Validator",
      title: "AI plan validation",
      purpose: "A2UI code checks the AI plan before rendering: source paths must exist, transforms must be allowed, required slots must be filled, and candidate comparison must be complete.",
      metrics: [
        { label: "Validation", value: trace.aiSurfacePlanTrace.validation.ok ? "passed" : "failed", tone: trace.aiSurfacePlanTrace.validation.ok ? "success" : "warning" },
        { label: "Selected template", value: trace.aiSurfacePlanTrace.selectedTemplateId ?? "-" },
        { label: "Candidates", value: formatCount(trace.aiSurfacePlanTrace.candidateEvaluations.length) },
        { label: "Errors", value: trace.aiSurfacePlanTrace.validation.errors.length ? trace.aiSurfacePlanTrace.validation.errors.join(", ") : "none" },
      ],
      flow: [
        { title: "Check source paths", body: "Every sourcePath must be present in the extracted field paths." },
        { title: "Check required slots", body: `${requiredSlotSummary(trace)} must be satisfied.` },
        { title: "Check candidate comparison", body: "Every registered template must have a select/reject decision." },
      ],
    };
  }

  if (selectedStep === "mapping-applied") {
    return {
      eyebrow: "Binding",
      title: "Field and slot mapping applied",
      purpose: "A2UI applies the validated AI plan to create renderer-facing items[] data and bindings.",
      metrics: [
        { label: "Mapped rows", value: formatCount(mappedRowCount(trace)) },
        { label: "Field mappings", value: formatCount(fieldMappingCount(trace)) },
        { label: "Before rows", value: formatCount(trace.aiSurfacePlanTrace.beforeRows.length) },
        { label: "After rows", value: formatCount(trace.aiSurfacePlanTrace.afterRows?.length ?? 0) },
      ],
      mappings: mappingRows,
      flow: plannerRuleSummary(trace),
    };
  }

  if (selectedStep === "a2ui-tool-result") {
    return {
      eyebrow: "Validated result",
      title: trace.renderPlan.selectedComponentId,
      purpose: "This is the validated AI surface plan returned from A2UI, including the selected template, score, and field bindings.",
      metrics: judgmentMetrics(trace),
      comparison: comparisonInput(trace),
      mappings: mappingRows,
      flow: [
        { title: "Judgment", body: decisionReason(trace) },
        { title: "Bindings selected", body: `${formatCount(selectedMappingCount(trace))} slot mappings selected.` },
      ],
    };
  }

  if (selectedStep === "a2a-result") {
    return {
      eyebrow: "A2A artifact",
      title: "Trace + surface artifact returned",
      purpose: "The A2UI Agent returns an A2A task containing the AI decision trace and, when matched, the SurfaceEnvelope artifact.",
      metrics: judgmentMetrics(trace),
      comparison: comparisonInput(trace),
      mappings: mappingRows,
      flow: [
        { title: "A2UI decision complete", body: decisionReason(trace) },
        { title: "Boundary unwraps artifact", body: "Python extracts the surface result and metadata before returning A2UIRenderToolResult to Main Agent." },
      ],
    };
  }

  if (selectedStep === "matched-summary") {
    return {
      eyebrow: "Matched output",
      title: "Text summary",
      purpose: "The Main Agent sends a short human-readable summary beside the SurfaceEnvelope. It explains the rendered result but does not decide the UI template.",
      metrics: [
        { label: "Arrow carries", value: "summary text" },
        { label: "Paired with", value: "SurfaceEnvelope" },
        { label: "Template", value: trace.surfaceEnvelope.templateId },
        { label: "Rows summarized", value: formatCount(trace.surfaceEnvelope.payload.data.items.length) },
      ],
      flow: [
        { title: "Use render decision", body: `The selected template is already ${trace.surfaceEnvelope.templateId}.` },
        { title: "Send readable text", body: "The chat bubble gets concise context for the surface that appears with it." },
        { title: "Move with envelope", body: "Summary and SurfaceEnvelope are treated as the same matched output moment in the diagram." },
      ],
    };
  }

  if (selectedStep === "surface") {
    return {
      eyebrow: "Selected template output",
      title: trace.surfaceEnvelope.templateId,
      purpose: "This is the UI payload produced because the AI planner selected this template and the validator accepted the plan.",
      metrics: judgmentMetrics(trace),
      comparison: comparisonInput(trace),
      mappings: mappingRows,
      flow: [
        { title: "SurfaceEnvelope uses", body: `${trace.surfaceEnvelope.templateId} with ${trace.renderPlan.viewType}.` },
        { title: "Renderer receives", body: `${formatCount(trace.surfaceEnvelope.payload.data.items.length)} rows plus selected field bindings.` },
      ],
    };
  }

  return {
    eyebrow: "Trace detail",
    title: "Select a data step",
    purpose: "Click a data-flow label to see what crosses that boundary, what changes, and why the next step can continue.",
  };
}

function SequenceTraceDetail({
  selectedStep,
  selectedEvent,
  trace,
}: {
  selectedStep: string;
  selectedEvent?: AgentFlowEvent;
  trace?: DataBoundaryScenarioTrace;
}) {
  if (!trace) {
    if (selectedEvent) {
      return <DetailView view={liveDetailView(selectedEvent)} />;
    }

    return (
      <DetailView
        view={{
          eyebrow: "Trace detail",
          title: "Run a data flow",
          purpose: "Click a data-flow label to see what crosses that boundary, what changes, and why the next step can continue.",
        }}
      />
    );
  }

  return <DetailView view={traceDetailView(selectedStep, trace)} />;
}

export function SequenceBoard({ events, actorLabels, showA2UISubsteps = true, dataBoundaryTrace }: SequenceBoardProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const autoFollowPausedRef = useRef(false);
  const autoFollowPauseTimerRef = useRef<number | null>(null);
  const lastTurnIdRef = useRef<string | undefined>(undefined);
  const lastEventCountRef = useRef(events.length);
  const didPlaceInitialViewRef = useRef(false);
  const modalOpenedAtRef = useRef(0);
  const [isPanning, setIsPanning] = useState(false);
  const [zoom, setZoom] = useState(overviewZoom);
  const [traceModalStep, setTraceModalStep] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: overviewZoom, target: "overview", mode: "auto" });
  const [viewportScroll, setViewportScroll] = useState({ left: 0, top: 0 });
  const active = events.at(-1);
  const branches = useMemo(() => branchSet(events), [events]);
  const visibleSteps = useMemo(() => steps.filter((step) => showA2UISubsteps || !step.a2uiSubstep), [showA2UISubsteps]);
  const completed = useMemo(() => completedStepSet(events, visibleSteps), [events, visibleSteps]);
  const activeStep = visibleSteps.find((step) => eventMatchesStep(step, active));
  const activeSteps = visibleSteps.filter((step) => isActiveStep(step, active, completed));
  const focusStep = activeStep ?? stepForDoneEvent(active, visibleSteps);
  const modalStep = visibleSteps.find((step) => step.id === traceModalStep);
  const modalStepEvent = modalStep ? eventForStep(modalStep, events) : undefined;
  const modalStepLabel = modalStep ? stepDisplayLabel(modalStep, dataBoundaryTrace, events) : "Trace detail";
  const sequenceBoardStyle = {
    "--sequence-label-height": `${sequenceLayout.labelHeight}px`,
    "--sequence-label-line-gap": `${sequenceLayout.labelLineGap}px`,
    "--sequence-branch-label-height": `${sequenceLayout.branchLabelHeight}px`,
    "--sequence-branch-label-inset-x": `${sequenceLayout.branchLabelInsetX}px`,
    "--sequence-branch-label-inset-top": `${sequenceLayout.branchLabelInsetTop}px`,
  } as CSSProperties;

  function clearAutoFollowPauseTimer() {
    if (!autoFollowPauseTimerRef.current) return;
    window.clearTimeout(autoFollowPauseTimerRef.current);
    autoFollowPauseTimerRef.current = null;
  }

  function pauseAutoFollow() {
    autoFollowPausedRef.current = true;
    clearAutoFollowPauseTimer();
    autoFollowPauseTimerRef.current = window.setTimeout(() => {
      autoFollowPausedRef.current = false;
      autoFollowPauseTimerRef.current = null;
    }, manualAutoFollowPauseMs);
  }

  function focusCamera(region: FocusRegion, nextZoom: number, behavior: ScrollBehavior = "smooth") {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const target = scrollTargetForRegion(region, viewport, nextZoom);
    viewport.scrollTo({ ...target, behavior });
    setViewportScroll({ left: target.left, top: target.top });
    setCamera(cameraStateForScroll(region.target, target.left, target.top, nextZoom, "auto"));
  }

  function applyManualZoom(nextZoomValue: number, target: string) {
    const viewport = viewportRef.current;
    const nextZoom = clampZoom(nextZoomValue);
    pauseAutoFollow();

    if (!viewport) {
      setZoom(nextZoom);
      setCamera(cameraStateForScroll(target, 0, 0, nextZoom, "user"));
      return;
    }

    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / zoom;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / zoom;
    const nextLeft = Math.min(Math.max(0, canvasWidth * nextZoom - viewport.clientWidth), Math.max(0, centerX * nextZoom - viewport.clientWidth / 2));
    const nextTop = Math.min(Math.max(0, canvasHeight * nextZoom - viewport.clientHeight), Math.max(0, centerY * nextZoom - viewport.clientHeight / 2));

    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      viewport.scrollTo({ left: nextLeft, top: nextTop, behavior: "auto" });
      setViewportScroll({ left: nextLeft, top: nextTop });
      setCamera(cameraStateForScroll(target, nextLeft, nextTop, nextZoom, "user"));
    });
  }

  useEffect(() => () => {
    if (autoFollowPauseTimerRef.current) {
      window.clearTimeout(autoFollowPauseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const movedFromRunToIdle = lastEventCountRef.current > 0 && events.length === 0;
    const shouldPlaceInitialView = !didPlaceInitialViewRef.current || movedFromRunToIdle;
    lastEventCountRef.current = events.length;
    if (!shouldPlaceInitialView || events.length > 0) return;

    didPlaceInitialViewRef.current = true;
    const initialFrame = window.requestAnimationFrame(() => {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
      setViewportScroll({ left: 0, top: 0 });
      setCamera(cameraStateForScroll("overview", 0, 0, zoom, "auto"));
    });
    return () => window.cancelAnimationFrame(initialFrame);
  }, [events.length, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !focusStep) return;

    const startedNewTurn = Boolean(active?.turnId && active.turnId !== lastTurnIdRef.current);
    if (startedNewTurn) {
      lastTurnIdRef.current = active?.turnId;
      if (autoFollowPauseTimerRef.current) {
        window.clearTimeout(autoFollowPauseTimerRef.current);
        autoFollowPauseTimerRef.current = null;
      }
      autoFollowPausedRef.current = false;
    }

    if (autoFollowPausedRef.current && !startedNewTurn && active?.phase !== "request") return;

    const region = focusRegionForStep(focusStep);
    const nextZoom = clampZoom(region.zoom ?? focusZoom);
    if (Math.abs(nextZoom - zoom) > 0.01) {
      const zoomFrame = window.requestAnimationFrame(() => {
        setZoom(nextZoom);
        window.requestAnimationFrame(() => focusCamera(region, nextZoom));
      });
      return () => window.cancelAnimationFrame(zoomFrame);
    }
    const focusFrame = window.requestAnimationFrame(() => {
      focusCamera(region, zoom);
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  }, [active?.branch, active?.event, active?.phase, active?.turnId, focusStep, zoom]);

  useEffect(() => {
    if (!traceModalStep) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setTraceModalStep(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [traceModalStep]);

  function handleViewportScroll(event: ReactUIEvent<HTMLDivElement>) {
    setViewportScroll({ left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop });
  }

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    pauseAutoFollow();
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport) return;
    event.preventDefault();
    viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    viewport.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
    pauseAutoFollow();
    setViewportScroll({ left: viewport.scrollLeft, top: viewport.scrollTop });
    setCamera(cameraStateForScroll("user pan", viewport.scrollLeft, viewport.scrollTop, zoom, "user"));
  }

  function stopPan(event: ReactPointerEvent<HTMLDivElement>) {
    panRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function openTraceDetail(stepId: string, openedAt: number) {
    modalOpenedAtRef.current = openedAt;
    setTraceModalStep(stepId);
  }

  function closeTraceDetailFromBackdrop(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.timeStamp - modalOpenedAtRef.current < 320) return;
    setTraceModalStep(null);
  }

  return (
    <div className={styles.sequenceBoardShell} style={sequenceBoardStyle}>
      <div
        className={`${styles.sequenceViewport} ${isPanning ? styles.sequenceViewportPanning : ""}`}
        onPointerCancel={stopPan}
        onPointerDown={startPan}
        onPointerLeave={stopPan}
        onPointerMove={movePan}
        onPointerUp={stopPan}
        onScroll={handleViewportScroll}
        ref={viewportRef}
        data-camera-mode={camera.mode}
        data-camera-target={camera.target}
        data-camera-x={camera.x}
        data-camera-y={camera.y}
        data-camera-zoom={camera.zoom}
      >
        <div className={styles.sequenceActorOverlay} aria-hidden="true">
          {lanes.map((lane) => (
            <span
              className={`${styles.sequenceActorChip} ${active?.from === lane.id || active?.to === lane.id ? styles.sequenceActorChipActive : ""}`}
              key={lane.id}
              style={actorChipStyle(lane.id, zoom, viewportScroll.left)}
            >
              {actorLabels?.[lane.id] ?? lane.label}
            </span>
          ))}
        </div>
        <div className={styles.sequenceCanvasStage} style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
          <div
            className={styles.sequenceCanvas}
            style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})` }}
          >
            <div className={styles.sequenceLanes} aria-hidden="true">
              {lanes.map((lane) => (
                <div
                  className={`${styles.sequenceLane} ${active?.from === lane.id || active?.to === lane.id ? styles.sequenceLaneActive : ""}`}
                  key={lane.id}
                  style={{ left: laneX(lane.id) - laneWidth / 2, width: laneWidth }}
                >
                  <span>{actorLabels?.[lane.id] ?? lane.label}</span>
                </div>
              ))}
            </div>

            {branchBlocks.map((block) => (
              <div
                className={branchClass(block, branches, active)}
                data-sequence-branch={block.id}
                key={block.id}
                style={{ top: block.top, height: block.height, left: block.left, width: block.width }}
              >
                <span>{block.label}</span>
              </div>
            ))}

            <div className={styles.sequenceMessageLayer} aria-label="A2UI agent sequence diagram" role="img">
              {visibleSteps.map((step) => {
                const evidenceKind = stepEvidenceKind(step, events, active);
                return (
                  <span
                    className={messageLineClass(step, completed, active, evidenceKind)}
                    data-sequence-line={step.id}
                    key={`${step.id}-line`}
                    style={messageLineStyle(step)}
                  />
                );
              })}
            </div>

            {visibleSteps.map((step) => {
              const position = labelPosition(step);
              const liveEvent = eventForStep(step, events);
              const clickable = clickableStepIds.has(step.id) && (Boolean(liveEvent) || Boolean(dataBoundaryTrace));
              const displayLabel = stepDisplayLabel(step, dataBoundaryTrace, events);
              const evidenceKind = stepEvidenceKind(step, events, active);
              const evidence = evidenceLabel(evidenceKind);
              return (
                <div
                  className={`${stepClass(step, completed, active, evidenceKind)} ${clickable ? styles.sequenceStepClickable : ""} ${traceModalStep === step.id ? styles.sequenceStepSelected : ""}`}
                  data-sequence-branch={step.branch ?? "main"}
                  data-sequence-evidence={evidenceKind ?? "none"}
                  data-sequence-step={step.id}
                  key={`${step.id}-label`}
                  onDoubleClick={clickable ? (event) => {
                    event.stopPropagation();
                    openTraceDetail(step.id, event.timeStamp);
                  } : undefined}
                  style={{ left: position.left, top: position.top }}
                >
                  {clickable ? (
                    <button
                      aria-pressed={traceModalStep === step.id}
                      onClick={(event) => openTraceDetail(step.id, event.timeStamp)}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        openTraceDetail(step.id, event.timeStamp);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      title={displayLabel}
                      type="button"
                    >
                      <span className={styles.sequenceStepText}>{displayLabel}</span>
                      {evidence ? <span className={styles.sequenceStepEvidence}>{evidence}</span> : null}
                    </button>
                  ) : (
                    <span title={displayLabel}>
                      <span className={styles.sequenceStepText}>{displayLabel}</span>
                      {evidence ? <span className={styles.sequenceStepEvidence}>{evidence}</span> : null}
                    </span>
                  )}
                </div>
              );
            })}

            {activeSteps.map((step) => (
              <span className={packetRailClass(step)} key={`${step.id}-packet`} style={packetRailStyle(step)} />
            ))}
          </div>
        </div>
      </div>
      <div className={styles.sequenceZoomControls} aria-label="Sequence board zoom controls">
        <button
          aria-label="Zoom out"
          className={styles.sequenceZoomButton}
          disabled={zoom <= minZoom + 0.01}
          onClick={() => applyManualZoom(zoom - zoomStep, "zoom out")}
          type="button"
        >
          -
        </button>
        <button
          aria-label="Reset zoom to 100 percent"
          className={`${styles.sequenceZoomButton} ${styles.sequenceZoomValue}`}
          disabled={Math.abs(zoom - focusZoom) < 0.01}
          onClick={() => applyManualZoom(focusZoom, "zoom 100")}
          type="button"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          aria-label="Zoom in"
          className={styles.sequenceZoomButton}
          disabled={zoom >= maxZoom - 0.01}
          onClick={() => applyManualZoom(zoom + zoomStep, "zoom in")}
          type="button"
        >
          +
        </button>
        <button
          aria-label="Fit board"
          className={`${styles.sequenceZoomButton} ${styles.sequenceZoomFitButton}`}
          disabled={Math.abs(zoom - overviewZoom) < 0.01}
          onClick={() => applyManualZoom(overviewZoom, "zoom overview")}
          type="button"
        >
          Fit
        </button>
      </div>
      {traceModalStep && (dataBoundaryTrace || modalStepEvent) ? (
        <div className={styles.sequenceModalBackdrop} onClick={closeTraceDetailFromBackdrop} role="presentation">
          <div
            aria-label="Sequence trace detail"
            aria-modal="true"
            className={styles.sequenceModal}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className={styles.sequenceModalTop}>
              <div>
                <p className={styles.eyebrow}>Trace Detail</p>
                <h3>{modalStepLabel}</h3>
              </div>
              <button
                aria-label="Close trace detail"
                className={styles.sequenceModalClose}
                onClick={() => setTraceModalStep(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <SequenceTraceDetail selectedEvent={modalStepEvent} selectedStep={traceModalStep} trace={dataBoundaryTrace} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, UIEvent as ReactUIEvent } from "react";
import styles from "./styles.module.css";
import type { AgentFlowActor, AgentFlowBranch, AgentFlowEvent, AgentFlowPhase } from "./agent-flow-types";
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
  { id: "a2ui_render_tool", label: "a2ui_render Tool" },
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
  canvasBottomPadding: 80,
} as const;
const branchHeaderHeight = sequenceLayout.branchBorderWidth + sequenceLayout.branchLabelInsetTop + sequenceLayout.branchLabelHeight + sequenceLayout.labelLineGap;
const sequenceStepGaps: Record<SequenceStepGap, number> = {
  row: 34,
  section: branchHeaderHeight + sequenceLayout.labelLineGap + sequenceLayout.lineStrokeWidth,
  selfLoop: 34,
};
const clickableStepIds = new Set([
  "business-tool-result",
  "a2ui-tool-call",
  "profile",
  "registry-loaded",
  "matcher",
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
  { id: "general-stream", phase: "general_chat", events: ["text", "delta"], from: "main_agent", to: "chat", label: "Stream to chat" },
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
    label: "Send compare payload",
    branch: "data",
    a2uiSubstep: true,
    gapBefore: "selfLoop",
  },
  {
    id: "profile",
    phase: "profile",
    events: ["state:profile"],
    from: "a2ui_render_tool",
    to: "a2ui",
    label: "Derived schema input",
    branch: "data",
    a2uiSubstep: true,
  },
  {
    id: "registry-request",
    phase: "registry_loaded",
    events: ["state:a2a"],
    from: "a2ui",
    to: "registry",
    label: "Request template contracts",
    branch: "data",
  },
  {
    id: "registry-loaded",
    phase: "registry_loaded",
    events: ["state:registry_loaded"],
    from: "registry",
    to: "a2ui",
    label: "Template contract input",
    branch: "data",
  },
  { id: "matcher", phase: "matcher", events: ["state:matcher"], from: "a2ui", to: "a2ui", label: "Compare data vs template", branch: "data", a2uiSubstep: true },
  {
    id: "a2ui-tool-result",
    phase: "matcher",
    events: ["state:a2ui_tool_result"],
    from: "a2ui",
    to: "main_agent",
    label: "Decision: select template",
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
    label: "Return selected template",
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

function stepClass(step: SequenceStep, completed: Set<string>, active?: AgentFlowEvent) {
  const classes = [styles.sequenceStep];
  if (step.branch) classes.push(styles[`sequenceStep_${step.branch}`]);
  if (completed.has(step.id)) classes.push(styles.sequenceStepComplete);
  if (isActiveStep(step, active, completed)) classes.push(styles.sequenceStepActive);
  if (!completed.has(step.id) && !isActiveStep(step, active, completed)) classes.push(styles.sequenceStepPreview);
  if (step.branch && active?.branch && step.branch !== active.branch && !(step.branch === "data" && isDataOutcomeBranch(active.branch))) {
    classes.push(styles.sequenceStepMuted);
  }
  return classes.filter(Boolean).join(" ");
}

function messageLineClass(step: SequenceStep, completed: Set<string>, active?: AgentFlowEvent) {
  const { x1, x2, loopX } = stepEndpoints(step);
  const classes = [styles.sequenceMessageLine];
  if (step.branch) classes.push(styles[`sequenceMessageLine_${step.branch}`]);
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

function activationClass(step: SequenceStep, completed: Set<string>, active?: AgentFlowEvent) {
  const classes = [styles.sequenceActivation];
  if (step.branch) classes.push(styles[`sequenceActivation_${step.branch}`]);
  if (completed.has(step.id)) classes.push(styles.sequenceActivationComplete);
  if (isActiveStep(step, active, completed)) classes.push(styles.sequenceActivationActive);
  if (step.branch && active?.branch && step.branch !== active.branch && !(step.branch === "data" && isDataOutcomeBranch(active.branch))) {
    classes.push(styles.sequenceActivationMuted);
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

function activationStyle(step: SequenceStep) {
  const { y1, y2, loopX } = stepEndpoints(step);
  return {
    left: laneX(step.to) - 7,
    top: loopX ? y1 - 12 : y1 - 18,
    height: loopX ? y2 - y1 + 28 : 36,
  };
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

function comparisonInput(trace: DataBoundaryScenarioTrace): DetailViewModel["comparison"] {
  return {
    left: {
      title: "Compared data: derived schema",
      items: [
        { label: "Shape", value: trace.derivedSchema.shape },
        { label: "Rows", value: formatCount(trace.derivedSchema.rowCount) },
        { label: "Fields", value: formatCount(trace.derivedSchema.fields.length) },
        { label: "Capabilities", value: capabilitySummary(trace) },
      ],
    },
    right: {
      title: "Compared target: template contract",
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

function normalizedRuleSummary(trace: DataBoundaryScenarioTrace): DetailFlowItem[] {
  const rules = trace.normalization.rules.slice(0, 4);
  if (rules.length === 0) {
    return [
      {
        title: "Keep field names",
        body: "The API response already matches the display-facing shape closely enough.",
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

function rawColumnCount(trace: DataBoundaryScenarioTrace) {
  const firstRow = trace.sourceData.items.find((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
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
  return {
    eyebrow: "Live event",
    title: selectedEvent.label,
    purpose: selectedEvent.detail || "This event shows the current payload boundary in the running chat turn.",
    metrics: [
      { label: "Arrow", value: fromTo },
      { label: "Phase", value: selectedEvent.phase },
      { label: "Branch", value: selectedEvent.branch ?? "main" },
      { label: "Emitter", value: selectedEvent.physicalEmitter ?? "-" },
    ],
    flow: [
      {
        title: "Event received",
        body: selectedEvent.event,
      },
      {
        title: "Displayed as sequence step",
        body: selectedEvent.label,
      },
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
        { title: "Keep rendering separate", body: "A2UI template matching starts only after data comes back." },
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
      eyebrow: "Comparison input",
      title: "Source data captured",
      purpose: "This is the business API result that will become the left side of the matcher comparison after schema derivation.",
      metrics: [
        { label: "Source API", value: trace.businessToolName },
        { label: "Rows", value: formatCount(trace.sourceFingerprint.rowCount) },
        { label: "Columns", value: formatCount(rawColumnCount(trace)) },
        { label: "Next compare input", value: "derived schema" },
      ],
      flow: [
        { title: "Raw API result", body: `${formatCount(trace.sourceFingerprint.rowCount)} rows from ${trace.apiRoute}.` },
        { title: "Comparison role", body: "This data is not judged directly; A2UI first reduces it to field types, roles, and capabilities." },
        { title: "Expected decision path", body: "source data -> derived schema -> compare with template contract -> select template." },
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
        { label: "Template choice", value: "later in matcher" },
      ],
      flow: [
        { title: "Choose render tool", body: "The flow crosses from chat orchestration into A2UI rendering logic." },
        { title: "Defer UI selection", body: "The actual component is selected after schema and registry contracts are compared." },
      ],
    };
  }

  if (selectedStep === "a2ui-tool-call") {
    return {
      eyebrow: "Comparison payload",
      title: "Data prepared for matcher",
      purpose: "This payload carries the data that the main logic will compare after it is converted into a derived schema.",
      metrics: [
        { label: "Source", value: sourceToolName },
        { label: "Rows", value: formatCount(trace.normalization.displayRowCount) },
        { label: "Preview used", value: `${formatCount(trace.sampleDataPreview.sampleSize)} of ${formatCount(trace.sampleDataPreview.rowCount)}` },
        { label: "Compare target", value: trace.expectedTemplateId },
      ],
      flow: [
        { title: "Left side candidate", body: "displayData will be profiled into shape, fields, and capabilities." },
        { title: "Right side candidate", body: `registered contract ${trace.expectedTemplateId} will be loaded from the registry.` },
        { title: "Judgment comes later", body: "No template is selected until the matcher compares those two sides." },
      ],
    };
  }

  if (selectedStep === "profile") {
    return {
      eyebrow: "Comparison input",
      title: "Derived schema built",
      purpose: "This is the exact left-side data the matcher will compare against template contracts.",
      metrics: [
        { label: "Shape", value: trace.derivedSchema.shape },
        { label: "Fields", value: formatCount(trace.derivedSchema.fields.length) },
        { label: "Capabilities", value: capabilitySummary(trace) },
        { label: "Rows sampled", value: `${formatCount(trace.sampleDataPreview.sampleSize)} / ${formatCount(trace.sampleDataPreview.rowCount)}` },
      ],
      comparison: comparisonInput(trace),
      flow: [
        { title: "Matcher will read", body: "field type, role candidates, row shape, and capabilities." },
        { title: "Template will require", body: `${requiredSlotSummary(trace)} plus ${templateCapabilitySummary(trace)}.` },
        ...normalizedRuleSummary(trace),
      ],
      outcome: "This step does not select the template yet. It prepares the data side of the comparison.",
    };
  }

  if (selectedStep === "registry-request" || selectedStep === "registry-loaded") {
    return {
      eyebrow: "Comparison input",
      title: trace.templateContract.componentId,
      purpose: "This is the right-side contract the matcher compares against the derived schema.",
      metrics: [
        { label: "View type", value: trace.templateContract.surfaceConfig.viewType },
        { label: "Required slots", value: requiredSlotSummary(trace) },
        { label: "Required capabilities", value: templateCapabilitySummary(trace) },
        { label: "Candidate", value: trace.templateContract.componentId },
      ],
      comparison: comparisonInput(trace),
      flow: [
        { title: "Contract requirement", body: `${trace.templateContract.componentId} accepts ${trace.templateContract.surfaceConfig.viewType}.` },
        { title: "Comparison target", body: `Matcher checks whether derived schema can fill ${requiredSlotSummary(trace)}.` },
      ],
    };
  }

  if (selectedStep === "matcher") {
    return {
      eyebrow: "Comparison report",
      title: `${trace.derivedSchema.sourceId} -> ${trace.renderPlan.selectedComponentId}`,
      purpose: "The main logic compared the API-derived schema with a registered template contract. The score and slot mappings below explain why this template was selected.",
      metrics: judgmentMetrics(trace),
      comparison: comparisonInput(trace),
      mappings: mappingRows,
      outcome: `${decisionReason(trace)}. The selected template is ${trace.renderPlan.selectedComponentId}.`,
    };
  }

  if (selectedStep === "a2ui-tool-result") {
    return {
      eyebrow: "Decision result",
      title: trace.renderPlan.selectedComponentId,
      purpose: "This is the selected template decision returned from the comparison, including the score and field bindings that made the selection possible.",
      metrics: judgmentMetrics(trace),
      comparison: comparisonInput(trace),
      mappings: mappingRows,
      flow: [
        { title: "Judgment", body: decisionReason(trace) },
        { title: "Bindings selected", body: `${formatCount(selectedMappingCount(trace))} slot mappings selected.` },
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
      purpose: "This is the UI payload produced because the matcher selected this template from the comparison result.",
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

            <div className={styles.sequenceActivationLayer} aria-hidden="true">
              {visibleSteps
                .filter((step) => completed.has(step.id) || isActiveStep(step, active, completed))
                .map((step) => (
                  <span
                    className={activationClass(step, completed, active)}
                    key={`${step.id}-activation`}
                    style={activationStyle(step)}
                  />
                ))}
            </div>

            <div className={styles.sequenceMessageLayer} aria-label="A2UI agent sequence diagram" role="img">
              {visibleSteps.map((step) => (
                <span
                  className={messageLineClass(step, completed, active)}
                  data-sequence-line={step.id}
                  key={`${step.id}-line`}
                  style={messageLineStyle(step)}
                />
              ))}
            </div>

            {visibleSteps.map((step) => {
              const position = labelPosition(step);
              const liveEvent = eventForStep(step, events);
              const clickable = clickableStepIds.has(step.id) && (Boolean(liveEvent) || Boolean(dataBoundaryTrace));
              const displayLabel = stepDisplayLabel(step, dataBoundaryTrace, events);
              return (
                <div
                  className={`${stepClass(step, completed, active)} ${clickable ? styles.sequenceStepClickable : ""} ${traceModalStep === step.id ? styles.sequenceStepSelected : ""}`}
                  data-sequence-branch={step.branch ?? "main"}
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
                      {displayLabel}
                    </button>
                  ) : (
                    <span title={displayLabel}>{displayLabel}</span>
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

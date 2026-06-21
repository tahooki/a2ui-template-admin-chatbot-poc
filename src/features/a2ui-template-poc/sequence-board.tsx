"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

type EvidenceLabelId = "source-preview" | "template-comparison";

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
const packetReplayMs = 1100;
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
  { id: "chat-stream", phase: "request", events: ["request_start", "response_open"], from: "chat", to: "main_agent", label: "Open chat stream" },
  { id: "intent", phase: "intent", events: ["state:planning", "state:intent"], from: "main_agent", to: "llm", label: "Classify data request", gapBefore: "selfLoop" },
  {
    id: "business-tool-call",
    phase: "intent",
    events: ["state:business_tool_selected", "state:business_tool_call", "state:tool"],
    from: "main_agent",
    to: "business_db",
    label: "Select and call business API",
    branch: "data",
    gapBefore: "section",
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
    id: "a2ui-tool-call",
    phase: "registry_loaded",
    events: ["state:a2ui_tool_selected", "state:a2ui_tool_call"],
    from: "main_agent",
    to: "a2ui_render_tool",
    label: "Invoke a2ui_render boundary",
    branch: "data",
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
    id: "template-contracts",
    phase: "registry_loaded",
    events: ["state:template_contracts", "state:a2a"],
    from: "a2ui",
    to: "registry",
    label: "Load template contracts",
    branch: "data",
  },
  {
    id: "template-contracts-loaded",
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
    label: "Return trace + render decision",
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
    id: "fallback-text",
    phase: "text_fallback",
    events: ["text", "delta"],
    from: "main_agent",
    to: "chat",
    label: "Return fallback text",
    branch: "no_template",
    gapBefore: "section",
  },
  {
    id: "surface",
    phase: "surface",
    events: ["surface"],
    from: "main_agent",
    to: "chat",
    label: "Return selected A2UI surface",
    branch: "matched",
    gapBefore: "section",
  },
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
  { id: "data", label: "A2UI render path", firstStepId: "business-tool-call", lastStepId: "a2ui-tool-result" },
  { id: "no_template", label: "Text fallback output", firstStepId: "fallback-text", lastStepId: "fallback-text" },
  { id: "matched", label: "Selected A2UI output", firstStepId: "surface", lastStepId: "surface" },
];

const branchBlocks: BranchBlock[] = branchBlockSpecs.map(branchBlockFromSpec);

const canvasHeight = Math.ceil(Math.max(...branchBlocks.map((block) => block.top + block.height)) + sequenceLayout.canvasBottomPadding);

function isDataOutcomeBranch(branch?: AgentFlowBranch) {
  return branch === "matched" || branch === "no_template";
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
  return step.branch === "matched" && step.phase === "surface" && step.id === "surface";
}

function isMatchedSurfaceEvent(event?: AgentFlowEvent) {
  return Boolean(event && event.branch === "matched" && event.phase === "surface" && event.event === "surface");
}

function isActiveStep(step: SequenceStep, active: AgentFlowEvent | undefined, completed: Set<string>) {
  if (eventMatchesStep(step, active)) return true;
  if (active?.phase === "done" && active.branch === "matched" && step.id === "surface" && completed.has("surface")) return true;
  if (active?.phase === "done" && active.branch === "no_template" && step.id === "fallback-text" && completed.has("fallback-text")) return true;
  return Boolean(active?.event === "surface" && isMatchedSurfaceEvent(active) && isMatchedSurfaceStep(step) && completed.has("surface"));
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

function stepCameraZoom(step: SequenceStep) {
  if (step.branch === "matched" || step.branch === "error") return overviewZoom;
  return focusZoom;
}

function stepRegion(step: SequenceStep): FocusRegion {
  const position = labelPosition(step);
  const line = messageLineStyle(step);
  const lineWidth = typeof line.width === "number" ? line.width : 0;
  const lineHeight = "height" in line && typeof line.height === "number" ? line.height : sequenceLayout.lineStrokeWidth;
  const labelHalfWidth = 104;
  const labelTop = position.top;
  const labelBottom = labelTop + sequenceLayout.labelHeight;
  const lineTop = typeof line.top === "number" ? line.top : step.y;
  const lineBottom = lineTop + Math.max(lineHeight, sequenceLayout.lineStrokeWidth);
  const rawLeft = Math.min(position.left - labelHalfWidth, line.left);
  const rawRight = Math.max(position.left + labelHalfWidth, line.left + lineWidth);
  const rawTop = Math.min(labelTop, lineTop);
  const rawBottom = Math.max(labelBottom, lineBottom);
  const paddingX = 52;
  const paddingY = 72;

  return {
    left: Math.max(0, rawLeft - paddingX),
    top: Math.max(0, rawTop - paddingY),
    width: rawRight - rawLeft + paddingX * 2,
    height: rawBottom - rawTop + paddingY * 2,
    zoom: stepCameraZoom(step),
    target: step.id,
  };
}

function focusRegionForStep(step: SequenceStep): FocusRegion {
  return stepRegion(step);
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

function scrollTargetForStepElement(stepId: string, viewport: HTMLDivElement) {
  const elements = Array.from(viewport.querySelectorAll<HTMLElement>(`[data-sequence-step="${stepId}"], [data-sequence-line="${stepId}"]`));
  const rects = elements
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) return undefined;

  const viewportRect = viewport.getBoundingClientRect();
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const centerX = viewport.scrollLeft + (left + right) / 2 - viewportRect.left;
  const centerY = viewport.scrollTop + (top + bottom) / 2 - viewportRect.top;
  const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

  return {
    left: Math.min(maxLeft, Math.max(0, centerX - viewport.clientWidth / 2)),
    top: Math.min(maxTop, Math.max(0, centerY - viewport.clientHeight / 2)),
  };
}

function stepForDoneEvent(active: AgentFlowEvent | undefined, visibleSteps: SequenceStep[]) {
  if (active?.phase !== "done") return undefined;
  if (active.branch === "matched") return visibleSteps.find((step) => step.id === "surface");
  if (active.branch === "no_template") return visibleSteps.find((step) => step.id === "fallback-text");
  return undefined;
}

export function sequenceDisplayStepIdForEvent(event: AgentFlowEvent, showA2UISubsteps = true) {
  const visibleSteps = steps.filter((step) => showA2UISubsteps || !step.a2uiSubstep);
  return visibleSteps.find((step) => eventMatchesStep(step, event))?.id ?? stepForDoneEvent(event, visibleSteps)?.id;
}

function packetStepForActiveEvent(active: AgentFlowEvent | undefined, events: AgentFlowEvent[], visibleSteps: SequenceStep[]) {
  const directStep = visibleSteps.find((step) => eventMatchesStep(step, active));
  if (directStep) return directStep;
  const doneStep = stepForDoneEvent(active, visibleSteps);
  if (!active || !doneStep) return undefined;
  return events.findLast((event) => event.id !== active.id && event.turnId === active.turnId && eventMatchesStep(doneStep, event)) ? doneStep : undefined;
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

type DetailJsonPanel = {
  title: string;
  value: unknown;
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
  jsonPanels?: DetailJsonPanel[];
  flow?: DetailFlowItem[];
  mappings?: DetailMappingRow[];
  outcome?: string;
};

function formatCount(value: number) {
  return value.toLocaleString("en-US");
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

function DetailJsonPanels({ panels }: { panels: DetailJsonPanel[] }) {
  return (
    <div className={styles.sequenceJsonGrid}>
      {panels.map((panel) => (
        <div className={styles.sequenceJsonPanel} key={panel.title}>
          <strong>{panel.title}</strong>
          <pre>{JSON.stringify(panel.value, null, 2)}</pre>
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
      {view.jsonPanels?.length ? <DetailJsonPanels panels={view.jsonPanels} /> : null}
      {view.flow?.length ? <DetailFlow items={view.flow} /> : null}
      {view.mappings?.length ? <DetailMapping rows={view.mappings} /> : null}
      {view.outcome ? <p className={styles.sequenceDetailOutcome}>{view.outcome}</p> : null}
    </aside>
  );
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nonEmptyRecord(value: unknown) {
  const record = recordValue(value);
  return Object.keys(record).length ? record : undefined;
}

function stringValue(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function firstRecordArray(...values: unknown[]) {
  for (const value of values) {
    const records = recordArray(value);
    if (records.length) return records;
  }
  return [];
}

function cleanJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cleanJsonValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cleanJsonValue(item)]),
  );
}

function latestEvent(events: AgentFlowEvent[], eventNames: string[]) {
  return events.findLast((event) => eventNames.includes(event.event));
}

function eventPayload(event?: AgentFlowEvent) {
  if (!event) return undefined;
  return cleanJsonValue({
    event: event.event,
    phase: event.phase,
    from: event.from,
    to: event.to,
    label: event.label,
    detail: event.detail,
    branch: event.branch,
    physicalEmitter: event.physicalEmitter,
    evidenceKind: event.evidenceKind,
    data: event.data,
  });
}

function eventEvidenceText(event?: AgentFlowEvent, fallback = "sample") {
  return evidenceLabel(event?.evidenceKind) ?? (event ? "event" : fallback);
}

function traceRecordFromEvent(event?: AgentFlowEvent) {
  const data = recordValue(event?.data);
  return recordValue(data.aiSurfacePlanTrace);
}

function sourceToolFromEvent(event?: AgentFlowEvent) {
  const data = recordValue(event?.data);
  return nonEmptyRecord(data.sourceTool) ?? nonEmptyRecord(nonEmptyRecord(data.tool_metadata)?.sourceTool);
}

function toolMetadataFromEvent(event?: AgentFlowEvent) {
  return nonEmptyRecord(recordValue(event?.data).tool_metadata);
}

function aiSurfaceTraceFromEvent(event?: AgentFlowEvent) {
  const data = recordValue(event?.data);
  const sourceTool = sourceToolFromEvent(event);
  const toolMetadata = toolMetadataFromEvent(event);
  return nonEmptyRecord(data.aiSurfacePlanTrace)
    ?? nonEmptyRecord(sourceTool?.aiSurfacePlanTrace)
    ?? nonEmptyRecord(toolMetadata?.aiSurfacePlanTrace)
    ?? nonEmptyRecord(nonEmptyRecord(toolMetadata?.sourceTool)?.aiSurfacePlanTrace);
}

function aiSurfaceTraceFromEvents(...events: Array<AgentFlowEvent | undefined>) {
  for (const event of events) {
    const trace = aiSurfaceTraceFromEvent(event);
    if (trace) return trace;
  }
  return undefined;
}

function sourceFieldPathsFromEvent(event?: AgentFlowEvent) {
  const data = recordValue(event?.data);
  const trace = traceRecordFromEvent(event);
  return stringArray(data.sourceFieldPaths).length ? stringArray(data.sourceFieldPaths) : stringArray(trace.sourceFieldPaths);
}

function rawToolResultFromEvent(event?: AgentFlowEvent) {
  const data = recordValue(event?.data);
  const renderPayload = recordValue(data.a2uiRenderPayload);
  return data.rawToolResult ?? renderPayload.data;
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
  if (step.id === "business-tool-call" && toolName) return `Use ${toolName}`;
  return step.label;
}

function sourcePreviewEvidenceView(trace: DataBoundaryScenarioTrace | undefined, events: AgentFlowEvent[]): DetailViewModel {
  const businessEvent = latestEvent(events, ["state:business_tool_result", "state:data_loaded"]);
  const toolCallEvent = latestEvent(events, ["state:a2ui_tool_call", "transport:a2a_send"]);
  const event = latestEvent(events, ["state:source_preview", "state:profile"]);
  const toolResultEvent = latestEvent(events, ["state:a2ui_tool_result", "transport:a2a_result", "done"]);
  const aiSurfacePlanTrace = trace?.aiSurfacePlanTrace ?? aiSurfaceTraceFromEvents(event, toolResultEvent, businessEvent, toolCallEvent);
  const sourceTool = sourceToolFromEvent(toolResultEvent) ?? sourceToolFromEvent(businessEvent) ?? sourceToolFromEvent(toolCallEvent);
  const rawToolResult = rawToolResultFromEvent(businessEvent) ?? rawToolResultFromEvent(toolCallEvent);
  const inputJson = trace?.sourceData ?? cleanJsonValue({
    rawToolResult,
    businessToolResultEvent: eventPayload(businessEvent),
    a2uiRenderRequestEvent: eventPayload(toolCallEvent),
  });
  const outputJson = trace
    ? cleanJsonValue({
        sampleDataPreview: trace.sampleDataPreview,
        derivedSchema: trace.derivedSchema,
        aiSurfacePlanTrace: {
          promptVersion: trace.aiSurfacePlanTrace.promptVersion,
          model: trace.aiSurfacePlanTrace.model,
          sourceShape: trace.aiSurfacePlanTrace.sourceShape,
          sourceArrayPath: trace.aiSurfacePlanTrace.sourceArrayPath,
          sourceRowCount: trace.aiSurfacePlanTrace.sourceRowCount,
          sourceFieldPaths: trace.aiSurfacePlanTrace.sourceFieldPaths,
          sourceSampleRows: trace.aiSurfacePlanTrace.beforeRows.length ? trace.aiSurfacePlanTrace.beforeRows : undefined,
          beforeRows: trace.aiSurfacePlanTrace.beforeRows,
        },
        a2uiRenderPayload: trace.a2uiRenderPayload,
      })
    : cleanJsonValue({
        sourcePreviewEvent: eventPayload(event),
        sourceTool,
        aiSurfacePlanTrace,
        a2uiToolResultEvent: eventPayload(toolResultEvent),
      });

  return {
    eyebrow: `Evidence: ${eventEvidenceText(event, trace ? "sample" : "pending")}`,
    title: "비교용 데이터로 변환",
    purpose: "원본 API 데이터가 A2UI 비교 입력값으로 바뀐 input/output JSON입니다. 받은 값은 요약하지 않고 그대로 표시합니다.",
    jsonPanels: [
      { title: "Input JSON: API 데이터", value: inputJson },
      { title: "Output JSON: 비교용 데이터", value: outputJson },
    ],
  };
}

function templateComparisonEvidenceView(trace: DataBoundaryScenarioTrace | undefined, events: AgentFlowEvent[]): DetailViewModel {
  const profileEvent = latestEvent(events, ["state:source_preview", "state:profile"]);
  const matcherEvent = latestEvent(events, ["state:ai_surface_plan", "state:matcher"]);
  const validationEvent = latestEvent(events, ["state:plan_validation"]);
  const mappingEvent = latestEvent(events, ["state:mapping_applied"]);
  const toolResultEvent = latestEvent(events, ["state:a2ui_tool_result", "transport:a2a_result", "done"]);
  const surfaceEvent = latestEvent(events, ["surface"]);
  const matcherData = recordValue(matcherEvent?.data);
  const validationData = recordValue(validationEvent?.data);
  const mappingData = recordValue(mappingEvent?.data);
  const toolResultData = recordValue(toolResultEvent?.data);
  const surfaceData = recordValue(surfaceEvent?.data);
  const surface = recordValue(surfaceData.surface);
  const surfacePayload = recordValue(surface.payload);
  const surfaceRenderPlan = recordValue(surfacePayload.renderPlan);
  const eventTrace = aiSurfaceTraceFromEvents(matcherEvent, validationEvent, mappingEvent, toolResultEvent, profileEvent);
  const rawSelectedTemplate = trace?.renderPlan.selectedComponentId
    ?? matcherData.templateId
    ?? validationData.templateId
    ?? mappingData.templateId
    ?? toolResultData.templateId
    ?? surfaceRenderPlan.selectedComponentId;
  const resultMode = stringValue(matcherData.mode ?? validationData.mode ?? mappingData.mode ?? toolResultData.mode, "");
  const validation = recordValue(validationData.validation);
  const noTemplateResult = resultMode === "no_template" || (validation.ok === false && !surfaceEvent);
  const selectedTemplate = noTemplateResult ? null : stringValue(rawSelectedTemplate, "-");
  const score = trace?.renderPlan.score
    ?? numberValue(matcherData.score)
    ?? numberValue(validationData.score)
    ?? numberValue(mappingData.score)
    ?? numberValue(toolResultData.score)
    ?? numberValue(surfaceRenderPlan.score);
  const candidates = trace?.renderPlan.candidates ?? firstRecordArray(matcherData.candidates, validationData.candidates, toolResultData.candidates, eventTrace?.candidateEvaluations);
  const reason = stringValue(matcherData.reason ?? validationData.reason ?? mappingData.reason ?? toolResultData.reason ?? surfaceRenderPlan.reason, "");
  const sourceTool = sourceToolFromEvent(toolResultEvent);
  const inputJson = trace
    ? cleanJsonValue({
        sourceData: trace.sourceData,
        sourcePreview: trace.sampleDataPreview,
        derivedSchema: trace.derivedSchema,
        templateContract: trace.templateContract,
        templateCandidates: trace.renderPlan.candidates,
        aiSurfacePlanTraceInput: {
          promptVersion: trace.aiSurfacePlanTrace.promptVersion,
          model: trace.aiSurfacePlanTrace.model,
          sourceShape: trace.aiSurfacePlanTrace.sourceShape,
          sourceArrayPath: trace.aiSurfacePlanTrace.sourceArrayPath,
          sourceRowCount: trace.aiSurfacePlanTrace.sourceRowCount,
          sourceFieldPaths: trace.aiSurfacePlanTrace.sourceFieldPaths,
          beforeRows: trace.aiSurfacePlanTrace.beforeRows,
        },
      })
    : cleanJsonValue({
        sourcePreviewEvent: eventPayload(profileEvent),
        sourceTool,
        aiSurfacePlanTrace: eventTrace,
        matcherInputEvent: eventPayload(matcherEvent),
      });
  const outputJson = trace
    ? cleanJsonValue({
        result: noTemplateResult ? "no_template" : "selected",
        selectedTemplateId: selectedTemplate,
        score,
        reason: reason || undefined,
        renderPlan: trace.renderPlan,
        aiSurfacePlanTrace: trace.aiSurfacePlanTrace,
        mappingComparison: trace.mappingComparison,
        surfaceEnvelope: trace.surfaceEnvelope,
      })
    : cleanJsonValue({
        result: noTemplateResult ? "no_template" : "selected",
        selectedTemplateId: selectedTemplate,
        score,
        reason: reason || undefined,
        candidates,
        aiSurfacePlanTrace: eventTrace,
        validationEvent: eventPayload(validationEvent),
        mappingEvent: eventPayload(mappingEvent),
        a2uiToolResultEvent: eventPayload(toolResultEvent),
      });

  return {
    eyebrow: `Evidence: ${eventEvidenceText(mappingEvent ?? validationEvent ?? matcherEvent, trace ? "sample" : "pending")}`,
    title: "화면 조건 비교",
    purpose: "AI에게 들어간 input JSON과 A2UI 출력 결정 JSON입니다. 후보 선택/미선택 판단 값을 그대로 표시합니다.",
    jsonPanels: [
      { title: "Input JSON: AI 비교 입력값", value: inputJson },
      { title: "Output JSON: AI 선택 결과", value: outputJson },
    ],
  };
}

function sourcePreviewEvidenceSubtitle(trace: DataBoundaryScenarioTrace | undefined, event?: AgentFlowEvent) {
  if (trace) {
    return `행 ${formatCount(trace.sourceFingerprint.rowCount)}건 · 필드 ${formatCount(trace.aiSurfacePlanTrace.sourceFieldPaths.length)}개`;
  }

  const data = recordValue(event?.data);
  const fieldPaths = sourceFieldPathsFromEvent(event);
  const fieldCount = fieldPaths.length || numberValue(data.sourceFieldCount);
  const rowCount = numberValue(data.previewRowCount) ?? numberValue(data.rowCount) ?? numberValue(data.sourceRowCount);
  const rowText = rowCount !== undefined ? `행 ${formatCount(rowCount)}건` : "행 대기 중";
  const fieldText = fieldCount ? `필드 ${formatCount(fieldCount)}개` : "필드 대기 중";
  return `${rowText} · ${fieldText}`;
}

function templateComparisonEvidenceSubtitle(trace: DataBoundaryScenarioTrace | undefined, event?: AgentFlowEvent) {
  if (trace) {
    return `선택 ${trace.renderPlan.score.toFixed(2)} · 후보 ${formatCount(trace.renderPlan.candidates?.length ?? 1)}개`;
  }

  const data = recordValue(event?.data);
  const score = numberValue(data.score);
  const candidateCount = numberValue(data.candidateCount) ?? recordArray(data.candidates).length;
  const mode = stringValue(data.mode, "");
  const validation = recordValue(data.validation);
  const isNoTemplate = mode === "no_template" || (mode === "invalid" && data.templateId == null) || validation.ok === false;
  const scoreText = isNoTemplate ? "미선택" : score !== undefined ? `선택 ${score.toFixed(2)}` : "선택 대기 중";
  const candidateText = candidateCount ? `후보 ${formatCount(candidateCount)}개` : "후보 대기 중";
  return `${scoreText} · ${candidateText}`;
}

function evidenceLabels(trace: DataBoundaryScenarioTrace | undefined, events: AgentFlowEvent[]) {
  const sourceEvent = latestEvent(events, ["state:source_preview", "state:profile"]);
  const comparisonEvent = latestEvent(events, ["state:mapping_applied", "state:plan_validation", "state:ai_surface_plan", "state:matcher"]);
  const labels: Array<{
    id: EvidenceLabelId;
    title: string;
    subtitle: string;
    badge: string;
  }> = [];

  if (trace || sourceEvent) {
    labels.push({
      id: "source-preview",
      title: "비교용 데이터로 변환",
      subtitle: sourcePreviewEvidenceSubtitle(trace, sourceEvent),
      badge: eventEvidenceText(sourceEvent, trace ? "sample" : "event"),
    });
  }

  if (trace || comparisonEvent) {
    labels.push({
      id: "template-comparison",
      title: "화면 조건 비교",
      subtitle: templateComparisonEvidenceSubtitle(trace, comparisonEvent),
      badge: eventEvidenceText(comparisonEvent, trace ? "sample" : "event"),
    });
  }

  return labels;
}

function evidenceDetailView(id: EvidenceLabelId, trace: DataBoundaryScenarioTrace | undefined, events: AgentFlowEvent[]) {
  return id === "source-preview"
    ? sourcePreviewEvidenceView(trace, events)
    : templateComparisonEvidenceView(trace, events);
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
  const [evidenceModalId, setEvidenceModalId] = useState<EvidenceLabelId | null>(null);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: overviewZoom, target: "overview", mode: "auto" });
  const [packetReplay, setPacketReplay] = useState<{ eventId: string; stepId: string } | null>(null);
  const [viewportScroll, setViewportScroll] = useState({ left: 0, top: 0 });
  const active = events.at(-1);
  const branches = useMemo(() => branchSet(events), [events]);
  const visibleSteps = useMemo(() => steps.filter((step) => showA2UISubsteps || !step.a2uiSubstep), [showA2UISubsteps]);
  const completed = useMemo(() => completedStepSet(events, visibleSteps), [events, visibleSteps]);
  const activeStep = visibleSteps.find((step) => eventMatchesStep(step, active));
  const packetSteps = packetReplay ? visibleSteps.filter((step) => step.id === packetReplay.stepId) : [];
  const focusStep = activeStep ?? stepForDoneEvent(active, visibleSteps);
  const visibleEvidenceLabels = useMemo(() => evidenceLabels(dataBoundaryTrace, events), [dataBoundaryTrace, events]);
  const evidenceModalLabel = visibleEvidenceLabels.find((label) => label.id === evidenceModalId);
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

  useEffect(() => {
    const packetStep = packetStepForActiveEvent(active, events, visibleSteps);
    if (!active || !packetStep) {
      const timer = window.setTimeout(() => setPacketReplay(null), 0);
      return () => window.clearTimeout(timer);
    }

    const nextReplay = { eventId: active.id, stepId: packetStep.id };
    const startTimer = window.setTimeout(() => setPacketReplay(nextReplay), 0);
    const clearTimer = window.setTimeout(() => {
      setPacketReplay((current) => (current?.eventId === nextReplay.eventId ? null : current));
    }, packetReplayMs);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(clearTimer);
    };
  }, [active?.id, events, visibleSteps, active]);

  function focusCamera(region: FocusRegion, nextZoom: number, behavior: ScrollBehavior = "auto", stepId?: string) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const target = stepId ? (scrollTargetForStepElement(stepId, viewport) ?? scrollTargetForRegion(region, viewport, nextZoom)) : scrollTargetForRegion(region, viewport, nextZoom);
    viewport.scrollTo({ ...target, behavior });
    setViewportScroll({ left: target.left, top: target.top });
    setCamera(cameraStateForScroll(stepId ?? region.target, target.left, target.top, nextZoom, "auto"));
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

  useLayoutEffect(() => {
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
        window.requestAnimationFrame(() => focusCamera(region, nextZoom, "auto", focusStep.id));
      });
      return () => window.cancelAnimationFrame(zoomFrame);
    }
    focusCamera(region, zoom, "auto", focusStep.id);
  }, [active?.branch, active?.event, active?.phase, active?.turnId, focusStep, zoom]);

  useEffect(() => {
    if (!evidenceModalId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setEvidenceModalId(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [evidenceModalId]);

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

  function openEvidenceDetail(id: EvidenceLabelId, openedAt: number) {
    modalOpenedAtRef.current = openedAt;
    setEvidenceModalId(id);
  }

  function closeTraceDetailFromBackdrop(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.timeStamp - modalOpenedAtRef.current < 320) return;
    setEvidenceModalId(null);
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
              const displayLabel = stepDisplayLabel(step, dataBoundaryTrace, events);
              const evidenceKind = stepEvidenceKind(step, events, active);
              const evidence = evidenceLabel(evidenceKind);
              return (
                <div
                  className={stepClass(step, completed, active, evidenceKind)}
                  data-sequence-branch={step.branch ?? "main"}
                  data-sequence-evidence={evidenceKind ?? "none"}
                  data-sequence-step={step.id}
                  key={`${step.id}-label`}
                  style={{ left: position.left, top: position.top }}
                >
                  <span title={displayLabel}>
                    <span className={styles.sequenceStepText}>{displayLabel}</span>
                    {evidence ? <span className={styles.sequenceStepEvidence}>{evidence}</span> : null}
                  </span>
                </div>
              );
            })}

            {packetSteps.map((step) => (
              <span className={packetRailClass(step)} key={`${step.id}-packet`} style={packetRailStyle(step)} />
            ))}
          </div>
        </div>
      </div>
      {visibleEvidenceLabels.length ? (
        <div className={styles.sequenceEvidenceDock} aria-label="A2UI evidence labels">
          {visibleEvidenceLabels.map((label) => (
            <div
              className={`${styles.sequenceEvidenceLabel} ${evidenceModalId === label.id ? styles.sequenceEvidenceLabelSelected : ""}`}
              data-evidence-label={label.id}
              key={label.id}
            >
              <button
                aria-pressed={evidenceModalId === label.id}
                onClick={(event) => openEvidenceDetail(label.id, event.timeStamp)}
                onPointerDown={(event) => event.stopPropagation()}
                title={`${label.title}: ${label.subtitle}`}
                type="button"
              >
                <span>
                  <strong>{label.title}</strong>
                  <small>{label.subtitle}</small>
                </span>
                <em>{label.badge}</em>
              </button>
            </div>
          ))}
        </div>
      ) : null}
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
      {evidenceModalId ? (
        <div className={styles.sequenceModalBackdrop} onClick={closeTraceDetailFromBackdrop} role="presentation">
          <div
            aria-label="A2UI evidence detail"
            aria-modal="true"
            className={styles.sequenceModal}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className={styles.sequenceModalTop}>
              <div>
                <p className={styles.eyebrow}>A2UI Evidence</p>
                <h3>{evidenceModalLabel?.title ?? "A2UI evidence"}</h3>
              </div>
              <button
                aria-label="Close evidence detail"
                className={styles.sequenceModalClose}
                onClick={() => setEvidenceModalId(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <DetailView view={evidenceDetailView(evidenceModalId, dataBoundaryTrace, events)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, UIEvent as ReactUIEvent } from "react";
import styles from "./styles.module.css";
import type { AgentFlowActor, AgentFlowBranch, AgentFlowEvent, AgentFlowPhase } from "./agent-flow-types";

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
  y: number;
};

type BranchBlock = {
  id: AgentFlowBranch;
  label: string;
  left: number;
  width: number;
  top: number;
  height: number;
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
};

const lanes: ActorLane[] = [
  { id: "chat", label: "Chat UI" },
  { id: "next", label: "Next /api/chat" },
  { id: "main_agent", label: "Main Agent" },
  { id: "a2ui", label: "A2UI Agent" },
  { id: "llm", label: "LLM" },
  { id: "business_db", label: "Business DB/API" },
  { id: "a2ui_render_tool", label: "a2ui_render Tool" },
  { id: "registry", label: "A2UI Registry" },
];

const actorNodeWidth = 144;
const laneWidth = 156;
const laneGutter = 38;
const canvasLeftInset = 110;
const canvasRightInset = 130;
const canvasWidth = canvasLeftInset + canvasRightInset + lanes.length * laneWidth + (lanes.length - 1) * laneGutter;
const canvasHeight = 1760;
const overviewZoom = 0.86;
const focusZoom = 1;
const minZoom = 0.65;
const maxZoom = 1.25;
const zoomStep = 0.1;
const manualAutoFollowPauseMs = 1600;
const messageLabelOffset = 42;

function laneX(actor: AgentFlowActor) {
  const index = lanes.findIndex((lane) => lane.id === actor);
  return canvasLeftInset + index * (laneWidth + laneGutter) + laneWidth / 2;
}

const diagramLeft = laneX("chat") - actorNodeWidth / 2 - 36;
const diagramRight = laneX("registry") + actorNodeWidth / 2 + 36;
const diagramWidth = diagramRight - diagramLeft;

const steps: SequenceStep[] = [
  { id: "request", phase: "request", events: ["request_start"], from: "chat", to: "next", label: "POST /api/chat", y: 124 },
  { id: "bridge", phase: "bridge", events: ["response_open"], from: "next", to: "main_agent", label: "Open /chat/stream", y: 194 },
  { id: "planning", phase: "planning", events: ["state:planning"], from: "main_agent", to: "a2ui", label: "Delegate turn", y: 264 },
  { id: "intent", phase: "intent", events: ["state:intent"], from: "a2ui", to: "llm", label: "Intent classify", y: 334 },
  { id: "general-llm", phase: "general_chat", events: ["llm:answer"], from: "llm", to: "a2ui", label: "Text answer", branch: "general", y: 432 },
  { id: "general-stream", phase: "general_chat", events: ["text", "delta"], from: "a2ui", to: "chat", label: "Stream to chat", branch: "general", y: 486 },
  {
    id: "business-tool-selected",
    phase: "intent",
    events: ["state:business_tool_selected"],
    from: "a2ui",
    to: "business_db",
    label: "Select business API tool",
    branch: "data",
    y: 574,
  },
  {
    id: "business-tool-call",
    phase: "data_loaded",
    events: ["state:business_tool_call", "state:tool"],
    from: "a2ui",
    to: "business_db",
    label: "Call get_equipment_*",
    branch: "data",
    y: 642,
  },
  {
    id: "business-tool-result",
    phase: "data_loaded",
    events: ["state:business_tool_result", "state:data_loaded"],
    from: "business_db",
    to: "a2ui",
    label: "Business tool result",
    branch: "data",
    y: 710,
  },
  {
    id: "a2ui-tool-selected",
    phase: "registry_loaded",
    events: ["state:a2ui_tool_selected"],
    from: "a2ui",
    to: "a2ui_render_tool",
    label: "Select a2ui_render",
    branch: "data",
    y: 778,
  },
  {
    id: "a2ui-tool-call",
    phase: "registry_loaded",
    events: ["state:a2ui_tool_call"],
    from: "a2ui",
    to: "a2ui_render_tool",
    label: "Run a2ui_render",
    branch: "data",
    a2uiSubstep: true,
    y: 846,
  },
  { id: "profile", phase: "profile", events: ["state:profile"], from: "a2ui", to: "a2ui", label: "Build profile / schema", branch: "data", a2uiSubstep: true, y: 914 },
  {
    id: "registry-request",
    phase: "registry_loaded",
    events: ["state:a2a", "state:mcp"],
    from: "a2ui",
    to: "registry",
    label: "Load template contracts",
    branch: "data",
    y: 982,
  },
  {
    id: "registry-loaded",
    phase: "registry_loaded",
    events: ["state:registry_loaded"],
    from: "registry",
    to: "a2ui",
    label: "Template contracts loaded",
    branch: "data",
    y: 1050,
  },
  { id: "matcher", phase: "matcher", events: ["state:matcher"], from: "a2ui", to: "a2ui", label: "Match template / fields", branch: "data", a2uiSubstep: true, y: 1118 },
  {
    id: "a2ui-tool-result",
    phase: "matcher",
    events: ["state:a2ui_tool_result"],
    from: "a2ui_render_tool",
    to: "a2ui",
    label: "a2ui_render result",
    branch: "data",
    a2uiSubstep: true,
    y: 1186,
  },
  {
    id: "matched-summary",
    phase: "surface",
    events: ["text", "delta"],
    from: "a2ui",
    to: "chat",
    label: "Emit matched summary",
    branch: "matched",
    y: 1316,
  },
  { id: "surface", phase: "surface", events: ["surface"], from: "a2ui", to: "chat", label: "Emit SurfaceEnvelope", branch: "matched", y: 1384 },
  {
    id: "no-template",
    phase: "no_template",
    events: ["matcher:no_template"],
    from: "a2ui",
    to: "a2ui",
    label: "No compatible template",
    branch: "no_template",
    y: 1496,
  },
  {
    id: "fallback",
    phase: "text_fallback",
    events: ["text", "delta"],
    from: "llm",
    to: "chat",
    label: "Emit fallback text",
    branch: "no_template",
    y: 1558,
  },
  { id: "error", phase: "error", events: ["error", "request_error", "response_error"], from: "a2ui", to: "chat", label: "Runtime error", branch: "error", y: 1646 },
];

const branchBlocks: BranchBlock[] = [
  { id: "general", label: "alt general chat", left: diagramLeft, width: diagramWidth, top: 372, height: 152 },
  { id: "data", label: "else data task", left: diagramLeft, width: diagramWidth, top: 526, height: 704 },
  { id: "matched", label: "then matched: SurfaceEnvelope", left: diagramLeft, width: diagramWidth, top: 1264, height: 158 },
  { id: "no_template", label: "else no template: fallback text", left: diagramLeft, width: diagramWidth, top: 1442, height: 148 },
  { id: "error", label: "else error", left: diagramLeft, width: diagramWidth, top: 1596, height: 84 },
];

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

function isActiveStep(step: SequenceStep, active?: AgentFlowEvent) {
  return eventMatchesStep(step, active);
}

function stepClass(step: SequenceStep, completed: Set<string>, active?: AgentFlowEvent) {
  const classes = [styles.sequenceStep];
  if (step.branch) classes.push(styles[`sequenceStep_${step.branch}`]);
  if (completed.has(step.id)) classes.push(styles.sequenceStepComplete);
  if (isActiveStep(step, active)) classes.push(styles.sequenceStepActive);
  if (!completed.has(step.id) && !isActiveStep(step, active)) classes.push(styles.sequenceStepPreview);
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
  if (isActiveStep(step, active)) classes.push(styles.sequenceMessageLineActive);
  if (!completed.has(step.id) && !isActiveStep(step, active)) classes.push(styles.sequenceMessageLinePreview);
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
  if (isActiveStep(step, active)) classes.push(styles.sequenceActivationActive);
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
    return { x1: fromX, x2: fromX, y1: step.y, y2: step.y + 44, loopX: fromX + 118 };
  }
  return { x1: fromX, x2: toX, y1: step.y, y2: step.y };
}

function labelPosition(step: SequenceStep) {
  const { x1, x2, y1, loopX } = stepEndpoints(step);
  if (loopX) return { left: x1 + (loopX - x1) / 2, top: y1 - messageLabelOffset };
  return { left: Math.min(x1, x2) + Math.abs(x2 - x1) / 2, top: y1 - messageLabelOffset };
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
  if (step.phase === "profile" || (step.phase === "matcher" && step.from === step.to)) return selfRegion("a2ui", step.y, step.phase);
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

export function SequenceBoard({ events, actorLabels, showA2UISubsteps = true }: SequenceBoardProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const lastUserPanAtRef = useRef(0);
  const lastTurnIdRef = useRef<string | undefined>(undefined);
  const lastEventCountRef = useRef(events.length);
  const didPlaceInitialViewRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const [zoom, setZoom] = useState(overviewZoom);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: overviewZoom, target: "overview", mode: "auto" });
  const [viewportScroll, setViewportScroll] = useState({ left: 0, top: 0 });
  const active = events.at(-1);
  const branches = useMemo(() => branchSet(events), [events]);
  const visibleSteps = useMemo(() => steps.filter((step) => showA2UISubsteps || !step.a2uiSubstep), [showA2UISubsteps]);
  const completed = useMemo(() => completedStepSet(events, visibleSteps), [events, visibleSteps]);
  const activeStep = visibleSteps.find((step) => isActiveStep(step, active));
  const focusStep = activeStep ?? stepForDoneEvent(active, visibleSteps);

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
    lastUserPanAtRef.current = Date.now();

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
      lastUserPanAtRef.current = 0;
    }

    const userRecentlyPanned = Date.now() - lastUserPanAtRef.current < manualAutoFollowPauseMs;
    if (userRecentlyPanned && !startedNewTurn && active?.phase !== "request") return;

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

  function handleViewportScroll(event: ReactUIEvent<HTMLDivElement>) {
    setViewportScroll({ left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop });
  }

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    lastUserPanAtRef.current = Date.now();
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
    lastUserPanAtRef.current = Date.now();
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

  return (
    <div className={styles.sequenceBoardShell}>
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
                .filter((step) => completed.has(step.id) || isActiveStep(step, active))
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
              return (
                <div
                  className={stepClass(step, completed, active)}
                  data-sequence-branch={step.branch ?? "main"}
                  data-sequence-step={step.id}
                  key={`${step.id}-label`}
                  style={{ left: position.left, top: position.top }}
                >
                  <span>{step.label}</span>
                </div>
              );
            })}

            {activeStep ? <span className={packetRailClass(activeStep)} style={packetRailStyle(activeStep)} /> : null}
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
    </div>
  );
}

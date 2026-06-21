"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { agentFlowEventsFromSource } from "./agent-flow-adapter";
import { AgentTracePanel } from "./agent-trace-panel";
import { AdminPanel } from "./admin-panel";
import { ChatbotPanel } from "./chatbot-panel";
import { buildDataBoundaryScenarioTrace } from "./data-boundary-lab";
import { sequenceDisplayStepIdForEvent } from "./sequence-board";
import { useTemplateRegistry } from "./template-store";
import styles from "./styles.module.css";
import type { AgentFlowEvent, ChatFlowDisplayTiming, ChatFlowSourceEvent } from "./agent-flow-types";
import type { DataBoundaryScenarioId } from "./data-boundary-lab";

const flowEventDisplayIntervalMs = 1000;
const flowEventCatchUpIntervalMs = 1000;
const maxFlowEvents = 180;
const minChatWidth = 292;
const maxChatWidth = 640;
const resizeViewportReserve = 520;

export function A2UITemplatePocPage() {
  const { templates, version, saveTemplate, resetRegistry, isLoading, error } = useTemplateRegistry();
  const [chatWidth, setChatWidth] = useState(304);
  const [chatResetKey, setChatResetKey] = useState(0);
  const [flowEvents, setFlowEvents] = useState<AgentFlowEvent[]>([]);
  const [selectedBoundaryScenario, setSelectedBoundaryScenario] = useState<DataBoundaryScenarioId>("status");
  const draggingRef = useRef(false);
  const logicalFlowEventsRef = useRef<AgentFlowEvent[]>([]);
  const displayedFlowEventsRef = useRef<AgentFlowEvent[]>([]);
  const displayQueueRef = useRef<AgentFlowEvent[]>([]);
  const displayTimerRef = useRef<number | null>(null);
  const dataBoundaryTrace = useMemo(
    () => buildDataBoundaryScenarioTrace(selectedBoundaryScenario),
    [selectedBoundaryScenario],
  );

  function clearFlowDisplayTimer() {
    if (!displayTimerRef.current) return;
    window.clearTimeout(displayTimerRef.current);
    displayTimerRef.current = null;
  }

  function sameSequenceDisplayStep(firstEvent: AgentFlowEvent | undefined, nextEvent: AgentFlowEvent | undefined) {
    if (!firstEvent || !nextEvent || firstEvent.turnId !== nextEvent.turnId) return false;
    const firstStepId = sequenceDisplayStepIdForEvent(firstEvent);
    const nextStepId = sequenceDisplayStepIdForEvent(nextEvent);
    return Boolean(firstStepId && firstStepId === nextStepId);
  }

  function shouldDisplayInSameFrame(firstEvent: AgentFlowEvent, nextEvent: AgentFlowEvent) {
    return sameSequenceDisplayStep(firstEvent, nextEvent);
  }

  function appendDisplayedFlowEvents(events: AgentFlowEvent[]) {
    if (events.length === 0) return;
    const nextDisplayedEvents = [...displayedFlowEventsRef.current, ...events].slice(-maxFlowEvents);
    displayedFlowEventsRef.current = nextDisplayedEvents;
    setFlowEvents(nextDisplayedEvents);
  }

  function pushDisplayableFlowEvents(events: AgentFlowEvent[]) {
    const immediateEvents: AgentFlowEvent[] = [];

    events.forEach((event) => {
      if (!sequenceDisplayStepIdForEvent(event)) return;

      const lastDisplayedEvent = immediateEvents.at(-1) ?? displayedFlowEventsRef.current.at(-1);
      if (sameSequenceDisplayStep(lastDisplayedEvent, event)) {
        immediateEvents.push(event);
        return;
      }

      displayQueueRef.current.push(event);
    });

    appendDisplayedFlowEvents(immediateEvents);
  }

  function shouldCatchUpFlowPlayback(turnId?: string) {
    return displayQueueRef.current.some((event) => {
      if (turnId && event.turnId !== turnId) return false;
      return event.event === "surface" || event.phase === "text_fallback" || event.phase === "done";
    });
  }

  function queuedFrameIndexForEvent(eventId: string) {
    let frameIndex = 0;
    let queueIndex = 0;

    while (queueIndex < displayQueueRef.current.length) {
      const firstEvent = displayQueueRef.current[queueIndex];
      if (!firstEvent) break;
      const frame = [firstEvent];
      queueIndex += 1;

      while (displayQueueRef.current[queueIndex] && shouldDisplayInSameFrame(firstEvent, displayQueueRef.current[queueIndex])) {
        const nextEvent = displayQueueRef.current[queueIndex];
        if (nextEvent) frame.push(nextEvent);
        queueIndex += 1;
      }

      if (frame.some((event) => event.id === eventId)) return frameIndex;
      frameIndex += 1;
    }

    return undefined;
  }

  function showNextQueuedFlowEventFrame() {
    const firstEvent = displayQueueRef.current.shift();
    if (!firstEvent) return [];

    const frame = [firstEvent];
    while (displayQueueRef.current[0] && shouldDisplayInSameFrame(firstEvent, displayQueueRef.current[0])) {
      const nextEvent = displayQueueRef.current.shift();
      if (nextEvent) frame.push(nextEvent);
    }

    const nextDisplayedEvents = [...displayedFlowEventsRef.current, ...frame].slice(-maxFlowEvents);
    displayedFlowEventsRef.current = nextDisplayedEvents;
    setFlowEvents(nextDisplayedEvents);
    return frame;
  }

  function scheduleNextFlowEvent(delayMs = flowEventDisplayIntervalMs) {
    if (displayTimerRef.current) return;
    displayTimerRef.current = window.setTimeout(() => {
      displayTimerRef.current = null;
      if (showNextQueuedFlowEventFrame().length) {
        scheduleNextFlowEvent(shouldCatchUpFlowPlayback() ? flowEventCatchUpIntervalMs : flowEventDisplayIntervalMs);
      }
    }, delayMs);
  }

  useEffect(() => () => clearFlowDisplayTimer(), []);

  async function resetDemo() {
    await resetRegistry();
    setChatResetKey((current) => current + 1);
    clearFlowDisplayTimer();
    logicalFlowEventsRef.current = [];
    displayedFlowEventsRef.current = [];
    displayQueueRef.current = [];
    setFlowEvents([]);
    setSelectedBoundaryScenario("status");
  }

  function handleFlowEvent(source: ChatFlowSourceEvent): ChatFlowDisplayTiming | undefined {
    const current = logicalFlowEventsRef.current;
    const currentTurnEvents = current.filter((event) => event.turnId === source.turnId);
    const nextEvents = agentFlowEventsFromSource(source, currentTurnEvents);
    const seenIds = new Set(current.map((event) => event.id));
    const uniqueNextEvents = nextEvents.map((event) => {
      let id = event.id;
      let suffix = 1;
      while (seenIds.has(id)) {
        id = `${event.id}-${suffix}`;
        suffix += 1;
      }
      seenIds.add(id);
      return id === event.id ? event : { ...event, id };
    });

    logicalFlowEventsRef.current = [...current, ...uniqueNextEvents].slice(-maxFlowEvents);
    const wasDisplayIdle = displayQueueRef.current.length === 0 && !displayTimerRef.current;
    pushDisplayableFlowEvents(uniqueNextEvents);

    const surfaceEvent = uniqueNextEvents.find((event) => event.event === "surface" && event.turnId === source.turnId);
    const surfaceAlreadyDisplayed = Boolean(surfaceEvent && displayedFlowEventsRef.current.some((event) => event.id === surfaceEvent.id));
    const surfaceFrameIndex = surfaceEvent && !surfaceAlreadyDisplayed ? queuedFrameIndexForEvent(surfaceEvent.id) : undefined;
    const fallbackTextEvent = uniqueNextEvents.find((event) => event.phase === "text_fallback" && event.turnId === source.turnId);
    const fallbackTextAlreadyDisplayed = Boolean(fallbackTextEvent && displayedFlowEventsRef.current.some((event) => event.id === fallbackTextEvent.id));
    const fallbackTextFrameIndex = fallbackTextEvent && !fallbackTextAlreadyDisplayed ? queuedFrameIndexForEvent(fallbackTextEvent.id) : undefined;
    const timing: ChatFlowDisplayTiming = {};
    if (typeof surfaceFrameIndex === "number") {
      timing.surfaceDelayMs = (surfaceFrameIndex + (wasDisplayIdle ? 0 : 1)) * flowEventDisplayIntervalMs;
    } else if (surfaceAlreadyDisplayed) {
      timing.surfaceDelayMs = 0;
    }
    if (typeof fallbackTextFrameIndex === "number") {
      timing.textDelayMs = (fallbackTextFrameIndex + (wasDisplayIdle ? 0 : 1)) * flowEventDisplayIntervalMs;
    } else if (fallbackTextAlreadyDisplayed) {
      timing.textDelayMs = 0;
    }

    if (wasDisplayIdle && showNextQueuedFlowEventFrame().length) {
      scheduleNextFlowEvent();
    } else if (displayQueueRef.current.length > 0) {
      if (shouldCatchUpFlowPlayback(source.turnId)) clearFlowDisplayTimer();
      scheduleNextFlowEvent(shouldCatchUpFlowPlayback(source.turnId) ? flowEventCatchUpIntervalMs : flowEventDisplayIntervalMs);
    }

    return Object.keys(timing).length ? timing : undefined;
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const initialX = event.clientX;
    const initialWidth = chatWidth;

    function move(pointerEvent: PointerEvent) {
      if (!draggingRef.current) return;
      const delta = initialX - pointerEvent.clientX;
      const viewportMax = Math.max(minChatWidth, Math.min(maxChatWidth, window.innerWidth - resizeViewportReserve));
      setChatWidth(Math.min(viewportMax, Math.max(minChatWidth, initialWidth + delta)));
    }

    function stop() {
      draggingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <main className={styles.pageShell}>
      <header className={styles.topBar}>
        <div>
          <p className={styles.eyebrow}>A2UI Product Console</p>
          <h1>A2UI Studio</h1>
        </div>
        <div className={styles.topMeta}>
          <span>v{version}</span>
          <button className={styles.secondaryButton} type="button" onClick={() => void resetDemo()}>
            Reset demo
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <AdminPanel
          catalogError={error}
          isLoading={isLoading}
          onSave={saveTemplate}
          templates={templates}
        />
        <AgentTracePanel
          dataBoundaryTrace={dataBoundaryTrace}
          events={flowEvents}
          onBoundaryScenarioChange={setSelectedBoundaryScenario}
          registryVersion={version}
          selectedBoundaryScenario={selectedBoundaryScenario}
        />
        <ChatbotPanel
          onFlowEvent={handleFlowEvent}
          onResizeStart={startResize}
          registryVersion={version}
          resetKey={chatResetKey}
          width={chatWidth}
        />
      </div>
    </main>
  );
}

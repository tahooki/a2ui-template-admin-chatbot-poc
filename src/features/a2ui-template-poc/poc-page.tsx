"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { agentFlowEventsFromSource } from "./agent-flow-adapter";
import { AgentTracePanel } from "./agent-trace-panel";
import { AdminPanel } from "./admin-panel";
import { ChatbotPanel } from "./chatbot-panel";
import { buildDataBoundaryScenarioTrace } from "./data-boundary-lab";
import { useTemplateRegistry } from "./template-store";
import styles from "./styles.module.css";
import type { AgentFlowEvent, ChatFlowSourceEvent } from "./agent-flow-types";
import type { DataBoundaryScenarioId } from "./data-boundary-lab";

const flowEventDisplayIntervalMs = 1000;
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

  function showNextQueuedFlowEvent() {
    const nextEvent = displayQueueRef.current.shift();
    if (!nextEvent) return false;

    setFlowEvents((current) => [...current, nextEvent].slice(-maxFlowEvents));
    return true;
  }

  function scheduleNextFlowEvent(delayMs = flowEventDisplayIntervalMs) {
    if (displayTimerRef.current) return;
    displayTimerRef.current = window.setTimeout(() => {
      displayTimerRef.current = null;
      if (showNextQueuedFlowEvent()) scheduleNextFlowEvent();
    }, delayMs);
  }

  useEffect(() => () => clearFlowDisplayTimer(), []);

  async function resetDemo() {
    await resetRegistry();
    setChatResetKey((current) => current + 1);
    clearFlowDisplayTimer();
    logicalFlowEventsRef.current = [];
    displayQueueRef.current = [];
    setFlowEvents([]);
    setSelectedBoundaryScenario("status");
  }

  function handleFlowEvent(source: ChatFlowSourceEvent) {
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

    const isDisplayIdle = displayQueueRef.current.length === 0 && !displayTimerRef.current;
    logicalFlowEventsRef.current = [...current, ...uniqueNextEvents].slice(-maxFlowEvents);
    displayQueueRef.current.push(...uniqueNextEvents);
    if (isDisplayIdle && showNextQueuedFlowEvent()) {
      scheduleNextFlowEvent();
    } else {
      scheduleNextFlowEvent();
    }
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

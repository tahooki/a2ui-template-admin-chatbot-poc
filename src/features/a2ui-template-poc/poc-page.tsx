"use client";

import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { agentFlowEventsFromSource } from "./agent-flow-adapter";
import { AgentTracePanel } from "./agent-trace-panel";
import { AdminPanel } from "./admin-panel";
import { ChatbotPanel } from "./chatbot-panel";
import { useTemplateRegistry } from "./template-store";
import styles from "./styles.module.css";
import type { AgentFlowEvent, ChatFlowSourceEvent } from "./agent-flow-types";

export function A2UITemplatePocPage() {
  const { templates, version, saveTemplate, resetRegistry, isLoading, error } = useTemplateRegistry();
  const [chatWidth, setChatWidth] = useState(304);
  const [chatResetKey, setChatResetKey] = useState(0);
  const [flowEvents, setFlowEvents] = useState<AgentFlowEvent[]>([]);
  const draggingRef = useRef(false);

  async function resetDemo() {
    await resetRegistry();
    setChatResetKey((current) => current + 1);
    setFlowEvents([]);
  }

  function handleFlowEvent(source: ChatFlowSourceEvent) {
    setFlowEvents((current) => {
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
      return [...current, ...uniqueNextEvents].slice(-180);
    });
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const initialX = event.clientX;
    const initialWidth = chatWidth;

    function move(pointerEvent: PointerEvent) {
      if (!draggingRef.current) return;
      const delta = initialX - pointerEvent.clientX;
      setChatWidth(Math.min(348, Math.max(292, initialWidth + delta)));
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
        <AgentTracePanel events={flowEvents} registryVersion={version} />
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

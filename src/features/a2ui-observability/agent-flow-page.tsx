"use client";

import { useCallback, useMemo, useState } from "react";
import { ChatbotPanel } from "@/features/a2ui-chat/chatbot-panel";
import { ProductNavigation } from "@/features/a2ui-core/product-navigation";
import { useTemplateRegistry } from "@/features/a2ui-core/template-registry";
import type { AgentFlowEvent, ChatFlowSourceEvent } from "@/features/a2ui-core/agent-event-types";
import { agentFlowEventsFromSource } from "./agent-flow-adapter";
import { AgentTracePanel } from "./agent-trace-panel";
import {
  buildDataBoundaryScenarioTrace,
  type DataBoundaryScenarioId,
} from "./data-boundary-lab";
import styles from "./agent-flow-page.module.css";

const maxFlowEvents = 180;

export function AgentFlowPage() {
  const { version } = useTemplateRegistry();
  const [events, setEvents] = useState<AgentFlowEvent[]>([]);
  const [chatResetKey, setChatResetKey] = useState(0);
  const [selectedBoundaryScenario, setSelectedBoundaryScenario] = useState<DataBoundaryScenarioId>("status");
  const dataBoundaryTrace = useMemo(
    () => buildDataBoundaryScenarioTrace(selectedBoundaryScenario),
    [selectedBoundaryScenario],
  );
  const handleFlowEvent = useCallback((source: ChatFlowSourceEvent) => {
    setEvents((current) => {
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
      return [...current, ...uniqueNextEvents].slice(-maxFlowEvents);
    });
  }, []);

  function resetTrace() {
    setEvents([]);
    setChatResetKey((current) => current + 1);
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span>A2</span>
          <div><strong>Agent Flow Lab</strong><small>Proxy observability</small></div>
        </div>
        <ProductNavigation active="agent-flow" />
        <div className={styles.actions}>
          <span>{events.length} events</span>
          <button type="button" onClick={resetTrace}>Trace 초기화</button>
        </div>
      </header>

      <div className={styles.workspace}>
        <div className={styles.traceMount}>
          <AgentTracePanel
            dataBoundaryTrace={dataBoundaryTrace}
            events={events}
            onBoundaryScenarioChange={setSelectedBoundaryScenario}
            registryVersion={version}
            selectedBoundaryScenario={selectedBoundaryScenario}
            showA2UISubsteps
          />
        </div>
        <div className={styles.chatMount}>
          <ChatbotPanel
            height="calc(100vh - 64px)"
            onFlowEvent={handleFlowEvent}
            registryVersion={version}
            resetKey={chatResetKey}
          />
        </div>
      </div>
    </main>
  );
}

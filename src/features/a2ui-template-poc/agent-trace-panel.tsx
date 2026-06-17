"use client";

import { useState } from "react";
import { DataBoundaryLabPanel } from "./data-boundary-lab-panel";
import { SequenceBoard } from "./sequence-board";
import { SystemLogPanel } from "./system-log-panel";
import styles from "./styles.module.css";
import type { AgentFlowActor, AgentFlowEvent } from "./agent-flow-types";
import type { DataBoundaryScenarioId, DataBoundaryScenarioTrace } from "./data-boundary-lab";

export function AgentTracePanel({
  actorLabels,
  events,
  registryVersion,
  showA2UISubsteps,
  dataBoundaryTrace,
  selectedBoundaryScenario,
  onBoundaryScenarioChange,
}: {
  actorLabels?: Partial<Record<AgentFlowActor, string>>;
  events: AgentFlowEvent[];
  registryVersion: number;
  showA2UISubsteps?: boolean;
  dataBoundaryTrace: DataBoundaryScenarioTrace;
  selectedBoundaryScenario: DataBoundaryScenarioId;
  onBoundaryScenarioChange: (scenario: DataBoundaryScenarioId) => void;
}) {
  const [activeTab, setActiveTab] = useState<"sequence" | "table">("sequence");
  const current = events.at(-1);
  const currentTurnEvents = current ? events.filter((event) => event.turnId === current.turnId) : [];
  const isShowingLiveEvents = currentTurnEvents.length > 0;
  const boardEvents = isShowingLiveEvents ? currentTurnEvents : [];

  return (
    <section className={styles.tracePanel} aria-label="A2UI agent sequence">
      <div className={styles.traceHeader}>
        <div>
          <p className={styles.eyebrow}>Agent Sequence</p>
          <h2>Flow Board</h2>
        </div>
        <div className={styles.traceHeaderMeta}>
          <div className={styles.flowBoardTabs} role="tablist" aria-label="Flow board views">
            <button
              aria-selected={activeTab === "sequence"}
              className={`${styles.flowBoardTab} ${activeTab === "sequence" ? styles.flowBoardTabActive : ""}`}
              onClick={() => setActiveTab("sequence")}
              role="tab"
              type="button"
            >
              Sequence
            </button>
            <button
              aria-selected={activeTab === "table"}
              className={`${styles.flowBoardTab} ${activeTab === "table" ? styles.flowBoardTabActive : ""}`}
              onClick={() => setActiveTab("table")}
              role="tab"
              type="button"
            >
              DB Table
            </button>
          </div>
          <span>{current?.phase ?? "idle"}</span>
          <span>v{registryVersion}</span>
        </div>
      </div>
      {activeTab === "sequence" ? (
        <div className={styles.sequenceTabContent} role="tabpanel">
          <SequenceBoard
            actorLabels={actorLabels}
            dataBoundaryTrace={isShowingLiveEvents ? undefined : dataBoundaryTrace}
            events={boardEvents}
            showA2UISubsteps={showA2UISubsteps}
          />
          <SystemLogPanel events={events} />
        </div>
      ) : (
        <div className={styles.tableTabContent} role="tabpanel">
          <DataBoundaryLabPanel
            onScenarioChange={onBoundaryScenarioChange}
            selectedScenario={selectedBoundaryScenario}
            trace={dataBoundaryTrace}
          />
        </div>
      )}
    </section>
  );
}

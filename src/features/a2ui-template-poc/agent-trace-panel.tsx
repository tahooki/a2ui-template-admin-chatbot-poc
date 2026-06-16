"use client";

import { SequenceBoard } from "./sequence-board";
import { SystemLogPanel } from "./system-log-panel";
import styles from "./styles.module.css";
import type { AgentFlowActor, AgentFlowEvent } from "./agent-flow-types";

export function AgentTracePanel({
  actorLabels,
  events,
  registryVersion,
  showA2UISubsteps,
}: {
  actorLabels?: Partial<Record<AgentFlowActor, string>>;
  events: AgentFlowEvent[];
  registryVersion: number;
  showA2UISubsteps?: boolean;
}) {
  const current = events.at(-1);
  const currentTurnEvents = current ? events.filter((event) => event.turnId === current.turnId) : [];

  return (
    <section className={styles.tracePanel} aria-label="A2UI agent sequence">
      <div className={styles.traceHeader}>
        <div>
          <p className={styles.eyebrow}>Agent Sequence</p>
          <h2>Flow Board</h2>
        </div>
        <div className={styles.traceHeaderMeta}>
          <span>{current?.phase ?? "idle"}</span>
          <span>v{registryVersion}</span>
        </div>
      </div>
      <SequenceBoard actorLabels={actorLabels} events={currentTurnEvents} showA2UISubsteps={showA2UISubsteps} />
      <SystemLogPanel events={events} />
    </section>
  );
}

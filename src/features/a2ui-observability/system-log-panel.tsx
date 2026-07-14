"use client";

import { useEffect, useRef } from "react";
import styles from "./observability.module.css";
import type { AgentFlowEvent } from "@/features/a2ui-core/agent-event-types";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function logClass(event: AgentFlowEvent) {
  return [
    styles.logRow,
    event.severity ? styles[`logRow_${event.severity}`] : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function SystemLogPanel({ events }: { events: AgentFlowEvent[] }) {
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const visibleEvents = events.slice(-80);
  const latestEventId = visibleEvents.at(-1)?.id;

  useEffect(() => {
    const rows = rowsRef.current;
    if (!rows) return;
    rows.scrollTop = rows.scrollHeight;
  }, [latestEventId]);

  return (
    <div className={styles.systemLogPanel} aria-label="A2UI system log">
      <div className={styles.systemLogHeader}>
        <span>System log</span>
        <span>{visibleEvents.length}</span>
      </div>
      <div className={styles.logRows} ref={rowsRef}>
        {!visibleEvents.length ? (
          <div className={styles.logEmpty}>No runtime events yet.</div>
        ) : (
          visibleEvents.map((event) => (
            <div className={logClass(event)} key={event.id}>
              <time>{formatTime(event.at)}</time>
              <span className={styles.logPhase}>{event.phase}</span>
              <span className={styles.logLabel}>{event.label}</span>
              {event.detail ? <span className={styles.logDetail}>{event.detail}</span> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

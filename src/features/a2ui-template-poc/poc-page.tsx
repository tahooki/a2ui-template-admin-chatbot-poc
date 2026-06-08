"use client";

import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { AdminPanel } from "./admin-panel";
import { ChatbotPanel } from "./chatbot-panel";
import { useTemplateRegistry } from "./template-store";
import styles from "./styles.module.css";

export function A2UITemplatePocPage() {
  const { templates, version, saveTemplate, resetRegistry } = useTemplateRegistry();
  const [selectedId, setSelectedId] = useState("equipment.statusBooleanList");
  const [chatWidth, setChatWidth] = useState(540);
  const [chatResetKey, setChatResetKey] = useState(0);
  const draggingRef = useRef(false);

  function resetDemo() {
    resetRegistry();
    setSelectedId("equipment.statusBooleanList");
    setChatResetKey((current) => current + 1);
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const initialX = event.clientX;
    const initialWidth = chatWidth;

    function move(pointerEvent: PointerEvent) {
      if (!draggingRef.current) return;
      const delta = initialX - pointerEvent.clientX;
      setChatWidth(Math.min(720, Math.max(360, initialWidth + delta)));
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
          <button className={styles.secondaryButton} type="button" onClick={resetDemo}>
            Reset demo
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <AdminPanel
          onSave={saveTemplate}
          onSelect={setSelectedId}
          selectedId={selectedId}
          templates={templates}
        />
        <ChatbotPanel
          onResizeStart={startResize}
          registryVersion={version}
          resetKey={chatResetKey}
          templates={templates}
          width={chatWidth}
        />
      </div>
    </main>
  );
}

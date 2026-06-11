"use client";

import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { AdminPanel } from "./admin-panel";
import { ChatbotPanel } from "./chatbot-panel";
import { useTemplateRegistry } from "./template-store";
import styles from "./styles.module.css";

export function A2UITemplatePocPage() {
  const { templates, version, saveTemplate, resetRegistry, isLoading, error } = useTemplateRegistry();
  const [chatWidth, setChatWidth] = useState(540);
  const [chatResetKey, setChatResetKey] = useState(0);
  const draggingRef = useRef(false);

  async function resetDemo() {
    await resetRegistry();
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
        <ChatbotPanel
          onResizeStart={startResize}
          registryVersion={version}
          resetKey={chatResetKey}
          width={chatWidth}
        />
      </div>
    </main>
  );
}

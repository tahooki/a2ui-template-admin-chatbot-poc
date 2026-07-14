"use client";

import type { A2UIDisplaySelectionState } from "./contracts";
import styles from "./a2ui-chat-kit.module.css";

export function A2UIDisplaySelection({
  selection,
  busy = false,
  onSelect,
}: {
  selection: A2UIDisplaySelectionState;
  busy?: boolean;
  onSelect: (templateId: string) => void | Promise<void>;
}) {
  const selectionFinished = selection.status === "loading" || selection.status === "completed";

  return (
    <div className={styles.displaySelection} aria-label="A2UI display options">
      <p className={styles.displaySelectionPrompt}>{selection.message}</p>
      <div className={styles.displayOptionList}>
        {selection.options.map((option) => {
          const selected = selection.selectedTemplateId === option.templateId;
          return (
            <button
              className={`${styles.displayOptionButton} ${selected ? styles.displayOptionButtonSelected : ""}`}
              disabled={busy || selectionFinished}
              key={option.templateId}
              type="button"
              onClick={() => void onSelect(option.templateId)}
            >
              <span>{option.label}</span>
              {option.recommended ? <small>추천</small> : null}
            </button>
          );
        })}
      </div>
      {selection.status === "loading" ? <span className={styles.displaySelectionStatus}>화면 생성 중…</span> : null}
      {selection.error ? <span className={styles.displaySelectionError}>{selection.error}</span> : null}
    </div>
  );
}

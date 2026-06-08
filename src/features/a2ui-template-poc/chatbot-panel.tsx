"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { A2UIDemoRenderer } from "./a2ui-demo-renderer";
import { buildA2UIRenderPlan } from "./render-plan-builder";
import { chooseApiForPrompt, fetchDemoApi } from "./mock-api-client";
import styles from "./styles.module.css";
import type { A2UIDataProfile, A2UIRenderPlan, A2UITemplateRegistration, EquipmentApiResponse } from "./template-types";

type ChatSurface = {
  apiTitle: string;
  apiId: string;
  data: EquipmentApiResponse<unknown>;
  profile: A2UIDataProfile;
  renderPlan: A2UIRenderPlan;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  surface?: ChatSurface;
};

const introMessage: ChatMessage = {
  id: "intro",
  role: "assistant",
  content: "장비 데이터를 조회하면 Admin registry와 비교해서 A2UI 컴포넌트를 선택합니다.",
};

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function summarizeProfile(profile: A2UIDataProfile) {
  const roles = [
    profile.hasImageField ? "image" : null,
    profile.hasContentField ? "content" : null,
    profile.booleanFieldCount > 0 ? `${profile.booleanFieldCount} boolean fields` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `${profile.rowCount} rows, ${profile.fields.length} fields${roles ? `, ${roles}` : ""}`;
}

export function ChatbotPanel({
  templates,
  registryVersion,
  lastSavedComponentId,
  resetKey,
  width,
  onResizeStart,
}: {
  templates: A2UITemplateRegistration[];
  registryVersion: number;
  lastSavedComponentId: string | null;
  resetKey: number;
  width: number;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([introMessage]);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const versionRef = useRef(registryVersion);
  const resetKeyRef = useRef(resetKey);
  const endRef = useRef<HTMLDivElement | null>(null);

  const runQuery = useCallback(
    async (query: string, mode: "manual" | "auto" = "manual") => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setIsRunning(true);
      if (mode === "manual") {
        setMessages((current) => [...current, { id: newId(), role: "user", content: trimmed }]);
        setLastQuery(trimmed);
      } else {
        setMessages((current) => [
          ...current,
          {
            id: newId(),
            role: "system",
            content: `Registry v${registryVersion} 변경을 감지했습니다. 마지막 질문을 다시 계산합니다.`,
          },
        ]);
      }

      try {
        const apiId = chooseApiForPrompt(trimmed);
        const result = await fetchDemoApi(apiId);
        const { profile, renderPlan } = buildA2UIRenderPlan({
          query: trimmed,
          data: result.data,
          templates,
          registryVersion,
        });

        setMessages((current) => [
          ...current,
          {
            id: newId(),
            role: "assistant",
            content: renderPlan.isFallback
              ? `${result.title}를 호출했습니다. ${renderPlan.reason}`
              : `${result.title}를 호출했습니다. ${renderPlan.selectedComponentId}로 표시합니다.`,
            surface: {
              apiTitle: result.title,
              apiId: result.apiId,
              data: result.data,
              profile,
              renderPlan,
            },
          },
        ]);
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            id: newId(),
            role: "assistant",
            content: error instanceof Error ? error.message : "조회 중 오류가 발생했습니다.",
          },
        ]);
      } finally {
        setIsRunning(false);
      }
    },
    [registryVersion, templates],
  );

  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    versionRef.current = registryVersion;
    setMessages([introMessage]);
    setLastQuery(null);
    setInput("");
    setIsRunning(false);
  }, [registryVersion, resetKey]);

  useEffect(() => {
    if (versionRef.current === registryVersion) return;
    versionRef.current = registryVersion;
    if (lastQuery) {
      void runQuery(lastQuery, "auto");
    }
  }, [lastQuery, registryVersion, runQuery]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <aside className={styles.chatPanel} style={{ width }} aria-label="A2UI chatbot">
      <div className={styles.resizeHandle} onPointerDown={onResizeStart} aria-hidden="true" />
      <div className={styles.chatHeader}>
        <div>
          <p className={styles.eyebrow}>Chatbot Runtime</p>
          <h2>A2UI Agent Preview</h2>
        </div>
        <div className={styles.versionPill}>registry v{registryVersion}</div>
      </div>
      {lastSavedComponentId ? <div className={styles.registryNotice}>Updated: {lastSavedComponentId}</div> : null}

      <div className={styles.quickPrompts}>
        {["장비 상태 목록 보여줘", "이미지 있는 장비 리스트 보여줘"].map((prompt) => (
          <button disabled={isRunning} key={prompt} type="button" onClick={() => runQuery(prompt)}>
            {prompt}
          </button>
        ))}
        <button disabled={!lastQuery || isRunning} type="button" onClick={() => lastQuery && runQuery(lastQuery)}>
          다시 실행
        </button>
      </div>

      <div className={styles.messageList}>
        {messages.map((message) => (
          <div className={`${styles.message} ${styles[`message_${message.role}`]}`} key={message.id}>
            <p>{message.content}</p>
            {message.surface ? (
              <>
                <div className={styles.stageTrail} aria-label="A2UI agent stages">
                  <span>API 호출</span>
                  <span>Data Profile</span>
                  <span>스펙 비교</span>
                  <span>Render</span>
                </div>
                <div className={styles.stepGrid}>
                  <span>API: {message.surface.apiId}</span>
                  <span>Profile: {summarizeProfile(message.surface.profile)}</span>
                  <span>Selected: {message.surface.renderPlan.selectedComponentId}</span>
                  <span>Reason: {message.surface.renderPlan.reason}</span>
                </div>
                <A2UIDemoRenderer
                  data={message.surface.data}
                  profile={message.surface.profile}
                  renderPlan={message.surface.renderPlan}
                />
              </>
            ) : null}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          void runQuery(input);
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="보고 싶은 장비 정보를 입력하세요"
        />
        <button className={styles.primaryButton} disabled={isRunning} type="submit">
          Send
        </button>
      </form>
    </aside>
  );
}

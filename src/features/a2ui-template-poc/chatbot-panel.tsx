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
  content: "보고 싶은 장비 데이터를 말하면 등록된 A2UI 화면으로 정리합니다.",
};

const quickPrompts = [
  {
    label: "상태 목록",
    prompt: "장비 상태 목록 보여줘",
  },
  {
    label: "이미지 목록",
    prompt: "이미지 있는 장비 리스트 보여줘",
  },
];

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function keyFromPath(path?: string) {
  return path?.split(".").pop() ?? "";
}

function rowsFromData(data: EquipmentApiResponse<unknown>) {
  return data.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function value(row: Record<string, unknown>, path?: string) {
  if (!path) return "";
  return row[keyFromPath(path)] ?? "";
}

function textValue(row: Record<string, unknown>, path?: string) {
  const fieldValue = value(row, path);
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : "";
}

function buildFallbackMarkdownList({
  apiTitle,
  data,
  renderPlan,
}: {
  apiTitle: string;
  data: EquipmentApiResponse<unknown>;
  renderPlan: A2UIRenderPlan;
}) {
  const visibleRows = rowsFromData(data).slice(0, renderPlan.maxItems ?? 6);
  const lines = visibleRows.map((row) => {
    const title = String(value(row, renderPlan.fieldMapping.title) || row.name || row.title || row.id || "항목");
    const content = textValue(row, renderPlan.fieldMapping.content) || String(row.description ?? row.category ?? row.location ?? "");
    return content ? `- ${title}: ${content}` : `- ${title}`;
  });

  return `${apiTitle}입니다. 아직 맞는 A2UI 화면이 없어 텍스트 목록으로 정리했습니다.\n\n${lines.join("\n")}`;
}

export function ChatbotPanel({
  templates,
  registryVersion,
  resetKey,
  width,
  onResizeStart,
}: {
  templates: A2UITemplateRegistration[];
  registryVersion: number;
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
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const runQuery = useCallback(
    async (query: string, mode: "manual" | "auto" = "manual") => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setIsRunning(true);
      if (mode === "manual") {
        setMessages((current) => [...current, { id: newId(), role: "user", content: trimmed }]);
        setLastQuery(trimmed);
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
              ? buildFallbackMarkdownList({ apiTitle: result.title, data: result.data, renderPlan })
              : `${result.title}입니다. 화면으로 정리했습니다.`,
            surface: renderPlan.isFallback
              ? undefined
              : {
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
    const list = messageListRef.current;
    if (!list) return;

    function scrollToLatest() {
      const target =
        list.querySelector<HTMLElement>("[data-latest-surface='true']") ??
        list.querySelector<HTMLElement>("[data-latest-message='true']");
      if (!target) return;
      const listTop = list.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      list.scrollTop += targetTop - listTop - 12;
    }

    const animationFrame = window.requestAnimationFrame(scrollToLatest);
    const timeout = window.setTimeout(scrollToLatest, 120);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [messages]);

  return (
    <aside className={styles.chatPanel} style={{ width }} aria-label="A2UI chatbot">
      <div className={styles.resizeHandle} onPointerDown={onResizeStart} aria-hidden="true" />
      <div className={styles.chatHeader}>
        <div>
          <p className={styles.eyebrow}>Chat</p>
          <h2>A2UI Chat</h2>
        </div>
        <div className={styles.chatStatusStack}>
          <span className={styles.liveStatus}>v{registryVersion}</span>
        </div>
      </div>

      <div className={styles.scenarioControls} aria-label="Demo scenarios">
        {quickPrompts.map((item) => (
          <button className={styles.scenarioButton} disabled={isRunning} key={item.prompt} type="button" onClick={() => runQuery(item.prompt)}>
            <span className={styles.scenarioTitle}>{item.label}</span>
          </button>
        ))}
        <button className={styles.rerunButton} disabled={!lastQuery || isRunning} type="button" onClick={() => lastQuery && runQuery(lastQuery)}>
          <span className={styles.scenarioTitle}>다시 실행</span>
        </button>
      </div>

      <div className={styles.messageList} ref={messageListRef}>
        {messages.map((message, index) => (
          <div
            className={`${styles.message} ${styles[`message_${message.role}`]}`}
            data-latest-message={index === messages.length - 1 ? "true" : undefined}
            key={message.id}
          >
            <span className={styles.messageRole}>
              {message.role === "user" ? "You" : message.role === "system" ? "Registry" : "A2UI Agent"}
            </span>
            <p>{message.content}</p>
            {message.surface ? (
              <>
                <div
                  className={styles.resultFrame}
                  data-latest-surface={index === messages.length - 1 ? "true" : undefined}
                >
                  <A2UIDemoRenderer
                    data={message.surface.data}
                    profile={message.surface.profile}
                    renderPlan={message.surface.renderPlan}
                  />
                </div>
              </>
            ) : null}
          </div>
        ))}
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

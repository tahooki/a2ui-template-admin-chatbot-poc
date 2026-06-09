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
    label: "장비 목록",
    prompt: "장비 목록보여줘",
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
    const content = textValue(row, renderPlan.fieldMapping.content) || String(row.description ?? "");
    const category = typeof row.category === "string" ? `${row.category} 라인` : "";
    const location = typeof row.location === "string" ? row.location : "";
    const context = [category, location].filter(Boolean).join(", ");
    const summary = content || "카탈로그에서 확인된 장비입니다.";
    return context ? `- ${title}: ${context}에 있는 장비입니다. ${summary}` : `- ${title}: ${summary}`;
  });

  return `${apiTitle}를 확인했어요. 아직 이 데이터에 맞는 A2UI 화면이 없어서, 우선 제가 주요 장비를 글로 정리해드릴게요.\n\n${lines.join("\n")}`;
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
  const [isRunning, setIsRunning] = useState(false);
  const resetKeyRef = useRef(resetKey);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const runQuery = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setIsRunning(true);
      setMessages((current) => [...current, { id: newId(), role: "user", content: trimmed }]);

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
    setMessages([introMessage]);
    setInput("");
    setIsRunning(false);
  }, [resetKey]);

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

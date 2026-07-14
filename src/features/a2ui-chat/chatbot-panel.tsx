"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  A2UIDisplaySelection,
  A2UISurfaceRenderer,
  a2uiErrorMessage,
  consumeA2UISse,
  displaySelectionFromA2UIEvent,
  surfaceFromA2UIEnvelope,
} from "@/features/a2ui-chat-kit";
import type {
  A2UIChatSurface,
  A2UIDisplaySelectionState,
} from "@/features/a2ui-chat-kit";
import styles from "./chat-components.module.css";
import type { ChatFlowDisplayTiming, ChatFlowSourceEvent } from "@/features/a2ui-core/agent-event-types";
import type { A2UICandidateTrace } from "@/features/a2ui-core/template-types";

type ChatMatcherTrace = {
  strategy?: string;
  score?: number;
  candidateCount?: number;
  candidates?: A2UICandidateTrace[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  surface?: A2UIChatSurface;
  matcher?: ChatMatcherTrace;
  displaySelection?: A2UIDisplaySelectionState;
};

const introMessage: ChatMessage = {
  id: "intro",
  role: "assistant",
  content: "보고 싶은 장비 데이터를 말하면 Agent가 API를 조회하고 등록된 A2UI로 정리합니다.",
};

const quickPrompts = [
  {
    label: "목록",
    prompt: "work-items API를 목록으로 보여줘",
  },
  {
    label: "카드 그리드",
    prompt: "resources API를 카드로 보여줘",
  },
  {
    label: "상세",
    prompt: "resources API를 상세로 보여줘",
  },
  {
    label: "데이터 테이블",
    prompt: "work-items API를 테이블로 보여줘",
  },
  {
    label: "상태 매트릭스",
    prompt: "status-checks API를 상태표로 보여줘",
  },
  {
    label: "지표 카드",
    prompt: "summary API를 숫자 카드로 보여줘",
  },
  {
    label: "진행률 목록",
    prompt: "work-items API를 진행률로 보여줘",
  },
  {
    label: "타임라인",
    prompt: "work-items API를 일정 타임라인으로 보여줘",
  },
  {
    label: "처리 대기열",
    prompt: "work-items API를 처리 큐처럼 보여줘",
  },
  {
    label: "계층 트리",
    prompt: "hierarchy API를 트리로 보여줘",
  },
];

const pendingText = "조회 중입니다.";

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function matcherFromState(data: Record<string, unknown>): ChatMatcherTrace {
  const candidates = Array.isArray(data.candidates) ? (data.candidates as A2UICandidateTrace[]) : undefined;
  return {
    strategy: typeof data.strategy === "string" ? data.strategy : undefined,
    score: numberValue(data.score),
    candidateCount: numberValue(data.candidateCount) ?? candidates?.length,
    candidates,
  };
}

export function ChatbotPanel({
  registryVersion = 0,
  resetKey,
  width = "100%",
  height,
  onResizeStart,
  onFlowEvent,
}: {
  registryVersion?: number;
  resetKey: number;
  width?: number | string;
  height?: number | string;
  onResizeStart?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onFlowEvent?: (event: ChatFlowSourceEvent) => ChatFlowDisplayTiming | void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([introMessage]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectingMessageId, setSelectingMessageId] = useState<string | null>(null);
  const resetKeyRef = useRef(resetKey);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const surfaceDisplayTimersRef = useRef<number[]>([]);

  const clearSurfaceDisplayTimers = useCallback(() => {
    surfaceDisplayTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    surfaceDisplayTimersRef.current = [];
  }, []);

  const scheduleSurfaceDisplay = useCallback((callback: () => void, delayMs = 0) => {
    if (delayMs <= 0) {
      callback();
      return;
    }

    const timer = window.setTimeout(() => {
      surfaceDisplayTimersRef.current = surfaceDisplayTimersRef.current.filter((item) => item !== timer);
      callback();
    }, delayMs);
    surfaceDisplayTimersRef.current.push(timer);
  }, []);

  const selectDisplayTemplate = useCallback(async (
    messageId: string,
    selectionId: string,
    templateId: string,
  ) => {
    setSelectingMessageId(messageId);
    setMessages((current) => current.map((message) => (
      message.id === messageId && message.displaySelection
        ? {
            ...message,
            displaySelection: {
              ...message.displaySelection,
              status: "loading",
              selectedTemplateId: templateId,
              error: undefined,
            },
          }
        : message
    )));

    try {
      const response = await fetch("/api/chat/display-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectionId, templateId }),
      });
      if (!response.ok) throw new Error(`display selection failed with ${response.status}`);

      let selectionError = "";
      await consumeA2UISse(response, ({ event, data }) => {
        if (event === "surface") {
          const surface = surfaceFromA2UIEnvelope(data);
          if (!surface) return;
          setMessages((current) => current.map((message) => (
            message.id === messageId && message.displaySelection
              ? {
                  ...message,
                  surface,
                  displaySelection: {
                    ...message.displaySelection,
                    status: "completed",
                    selectedTemplateId: templateId,
                    error: undefined,
                  },
                }
              : message
          )));
          return;
        }
        if (event === "error") {
          selectionError = a2uiErrorMessage(data);
          setMessages((current) => current.map((message) => (
            message.id === messageId && message.displaySelection
              ? {
                  ...message,
                  displaySelection: {
                    ...message.displaySelection,
                    status: "error",
                    selectedTemplateId: templateId,
                    error: selectionError,
                  },
                }
              : message
          )));
        }
      });
      if (selectionError) return;
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "선택한 화면을 생성하지 못했습니다.";
      setMessages((current) => current.map((message) => (
        message.id === messageId && message.displaySelection
          ? {
              ...message,
              displaySelection: {
                ...message.displaySelection,
                status: "error",
                selectedTemplateId: templateId,
                error: errorText,
              },
            }
          : message
      )));
    } finally {
      setSelectingMessageId(null);
    }
  }, []);

  const runQuery = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      clearSurfaceDisplayTimers();

      const userMessage: ChatMessage = { id: newId(), role: "user", content: trimmed };
      const assistantId = newId();
      const turnId = `turn-${assistantId}`;
      const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", content: pendingText };
      const history = messages.map(({ role, content }) => ({ role, content }));
      let hasText = false;
      let emittedError = false;

      function emitFlow(kind: ChatFlowSourceEvent["kind"], event: string, data: Record<string, unknown> = {}) {
        return onFlowEvent?.({
          kind,
          event,
          data,
          turnId,
          query: trimmed,
          registryVersion,
          at: new Date().toISOString(),
        });
      }

      setIsRunning(true);
      setMessages((current) => [...current, userMessage, assistantMessage]);
      emitFlow("local", "request_start", { message: trimmed });

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, history }),
        });

        if (!response.ok) {
          emittedError = true;
          const message = `/api/chat failed with ${response.status}`;
          emitFlow("local", "response_error", { message, status: response.status });
          throw new Error(message);
        }

        emitFlow("local", "response_open", { status: response.status });

        await consumeA2UISse(response, ({ event, data }) => {
          const flowTiming = emitFlow("sse", event, data);

          if (event === "text" || event === "delta") {
            const text = typeof data.text === "string" ? data.text : typeof data.delta === "string" ? data.delta : "";
            if (!text) return;
            const shouldAppend = hasText;
            scheduleSurfaceDisplay(
              () => {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === assistantId
                      ? {
                          ...message,
                          content: shouldAppend ? `${message.content}${text}` : text,
                        }
                      : message,
                  ),
                );
              },
              flowTiming?.textDelayMs,
            );
            hasText = true;
            return;
          }

          if (event === "surface") {
            const surface = surfaceFromA2UIEnvelope(data);
            if (!surface) return;
            scheduleSurfaceDisplay(
              () => {
                setMessages((current) =>
                  current.map((message) => (message.id === assistantId ? { ...message, surface } : message)),
                );
              },
              flowTiming?.surfaceDelayMs,
            );
            return;
          }

          if (event === "display_options") {
            const displaySelection = displaySelectionFromA2UIEvent(data);
            if (!displaySelection) return;
            setMessages((current) =>
              current.map((message) => (message.id === assistantId ? { ...message, displaySelection } : message)),
            );
            return;
          }

          if (event === "state" && data.status === "matcher") {
            const matcher = matcherFromState(data);
            setMessages((current) =>
              current.map((message) => (message.id === assistantId ? { ...message, matcher } : message)),
            );
            return;
          }

          if (event === "done" && (data.strategy || data.score || data.candidates)) {
            const matcher = matcherFromState(data);
            setMessages((current) =>
              current.map((message) => (message.id === assistantId ? { ...message, matcher } : message)),
            );
            return;
          }

          if (event === "error") {
            const text = a2uiErrorMessage(data);
            setMessages((current) =>
              current.map((message) => (message.id === assistantId ? { ...message, content: text } : message)),
            );
          }
        });
      } catch (error) {
        if (!emittedError) {
          emitFlow("local", "request_error", {
            message: error instanceof Error ? error.message : "조회 중 오류가 발생했습니다.",
          });
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: error instanceof Error ? error.message : "조회 중 오류가 발생했습니다.",
                }
              : message,
          ),
        );
      } finally {
        setIsRunning(false);
      }
    },
    [clearSurfaceDisplayTimers, messages, onFlowEvent, registryVersion, scheduleSurfaceDisplay],
  );

  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    clearSurfaceDisplayTimers();
    setMessages([introMessage]);
    setInput("");
    setIsRunning(false);
    setSelectingMessageId(null);
  }, [clearSurfaceDisplayTimers, resetKey]);

  useEffect(() => () => clearSurfaceDisplayTimers(), [clearSurfaceDisplayTimers]);

  useEffect(() => {
    const currentList = messageListRef.current;
    if (!currentList) return;
    const listElement: HTMLDivElement = currentList;

    function scrollToLatest() {
      const target =
        listElement.querySelector<HTMLElement>("[data-latest-surface='true']") ??
        listElement.querySelector<HTMLElement>("[data-latest-message='true']");
      if (!target) return;
      const listTop = listElement.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      const nextTop = listElement.scrollTop + targetTop - listTop - 12;
      listElement.scrollTo({ top: Math.max(0, nextTop), behavior: "auto" });
    }

    const animationFrame = window.requestAnimationFrame(scrollToLatest);
    const timeout = window.setTimeout(scrollToLatest, 120);
    const settleTimeout = window.setTimeout(scrollToLatest, 700);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
      window.clearTimeout(settleTimeout);
    };
  }, [messages]);

  return (
    <aside className={styles.chatPanel} style={{ width, height }} aria-label="A2UI chatbot">
      {onResizeStart ? <div className={styles.resizeHandle} onPointerDown={onResizeStart} aria-hidden="true" /> : null}
      <div className={styles.chatHeader}>
        <div>
          <p className={styles.eyebrow}>Chat</p>
          <h2>A2UI Chat</h2>
        </div>
        <div className={styles.chatStatusStack}>
          <span className={styles.liveStatus}>{registryVersion > 0 ? `v${registryVersion}` : "Proxy live"}</span>
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
            {message.matcher?.strategy ? (
              <div className={styles.matcherTrace} aria-label="Matcher trace">
                <span>{message.matcher.strategy}</span>
                {typeof message.matcher.score === "number" ? <span>{message.matcher.score.toFixed(2)}</span> : null}
                {typeof message.matcher.candidateCount === "number" ? <span>{message.matcher.candidateCount} candidates</span> : null}
              </div>
            ) : null}
            {message.displaySelection ? (
              <A2UIDisplaySelection
                busy={selectingMessageId === message.id}
                selection={message.displaySelection}
                onSelect={(templateId) => selectDisplayTemplate(
                  message.id,
                  message.displaySelection!.selectionId,
                  templateId,
                )}
              />
            ) : null}
            {message.surface ? (
              <div
                className={styles.resultFrame}
                data-latest-surface={index === messages.length - 1 ? "true" : undefined}
              >
                <A2UISurfaceRenderer
                  data={message.surface.data}
                  profile={message.surface.profile}
                  renderPlan={message.surface.renderPlan}
                />
              </div>
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

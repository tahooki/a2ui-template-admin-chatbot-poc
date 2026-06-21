"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { A2UIDemoRenderer } from "./a2ui-demo-renderer";
import styles from "./styles.module.css";
import type { ChatFlowDisplayTiming, ChatFlowSourceEvent } from "./agent-flow-types";
import type {
  A2UICandidateTrace,
  A2UIDataProfile,
  A2UIRenderPlan,
  A2UISurfaceEnvelope,
  EquipmentApiResponse,
} from "./template-types";

type ChatSurface = {
  apiTitle: string;
  apiId: string;
  data: EquipmentApiResponse<unknown>;
  profile: A2UIDataProfile;
  renderPlan: A2UIRenderPlan;
};

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
  surface?: ChatSurface;
  matcher?: ChatMatcherTrace;
};

type ParsedSseEvent = {
  event: string;
  data: Record<string, unknown>;
};

const introMessage: ChatMessage = {
  id: "intro",
  role: "assistant",
  content: "보고 싶은 장비 데이터를 말하면 Agent가 API를 조회하고 등록된 A2UI로 정리합니다.",
};

const quickPrompts = [
  {
    label: "상태 목록",
    prompt: "장비 상태 목록 보여줘",
  },
  {
    label: "장비 목록",
    prompt: "장비 목록 보여줘",
  },
  {
    label: "컬럼 많은 상태",
    prompt: "컬럼이 많은 장비 상태 목록 보여줘",
  },
  {
    label: "데이터 많은 상태",
    prompt: "데이터가 많은 장비 상태 목록 보여줘",
  },
];

const pendingText = "조회 중입니다.";

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseSseEvent(rawEvent: string): ParsedSseEvent | null {
  const lines = rawEvent.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) return null;

  try {
    return { event, data: JSON.parse(dataLines.join("\n")) as Record<string, unknown> };
  } catch {
    return null;
  }
}

async function consumeSse(response: Response, onEvent: (event: ParsedSseEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Chat stream is empty");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSseEvent(rawEvent);
      if (parsed) onEvent(parsed);
      boundary = buffer.indexOf("\n\n");
    }
  }

  const parsed = parseSseEvent(buffer.trim());
  if (parsed) onEvent(parsed);
}

function errorMessageFromEvent(data: Record<string, unknown>) {
  const message = typeof data.message === "string" ? data.message : "Agent 응답을 처리하는 중 오류가 발생했습니다.";
  const details = typeof data.details === "string" ? data.details : "";
  const errorType = typeof data.errorType === "string" ? data.errorType : "";
  const reason = [errorType, details].filter(Boolean).join(": ");
  return reason && reason !== message ? `${message}\n원인: ${reason}` : message;
}

function surfaceFromEnvelope(value: unknown): ChatSurface | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const envelope = value as Partial<A2UISurfaceEnvelope>;
  const payload = envelope.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (!payload.data || !payload.profile || !payload.renderPlan) return null;

  return {
    apiTitle: String(payload.apiTitle ?? "A2UI API"),
    apiId: String(payload.apiId ?? envelope.templateId ?? "a2ui"),
    data: payload.data,
    profile: payload.profile,
    renderPlan: payload.renderPlan,
  };
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
  registryVersion,
  resetKey,
  width,
  onResizeStart,
  onFlowEvent,
}: {
  registryVersion: number;
  resetKey: number;
  width: number;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onFlowEvent?: (event: ChatFlowSourceEvent) => ChatFlowDisplayTiming | void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([introMessage]);
  const [isRunning, setIsRunning] = useState(false);
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

        await consumeSse(response, ({ event, data }) => {
          const flowTiming = emitFlow("sse", event, data);

          if (event === "text" || event === "delta") {
            const text = typeof data.text === "string" ? data.text : typeof data.delta === "string" ? data.delta : "";
            if (!text) return;
            const shouldAppend = hasText;
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
            hasText = true;
            return;
          }

          if (event === "surface") {
            const surface = surfaceFromEnvelope(data.surface ?? data);
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
            const text = errorMessageFromEvent(data);
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
      listElement.scrollTop += targetTop - listTop - 12;
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
            {message.matcher?.strategy ? (
              <div className={styles.matcherTrace} aria-label="Matcher trace">
                <span>{message.matcher.strategy}</span>
                {typeof message.matcher.score === "number" ? <span>{message.matcher.score.toFixed(2)}</span> : null}
                {typeof message.matcher.candidateCount === "number" ? <span>{message.matcher.candidateCount} candidates</span> : null}
              </div>
            ) : null}
            {message.surface ? (
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

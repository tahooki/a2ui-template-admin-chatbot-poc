import type {
  AgentFlowAdapterState,
  AgentFlowBranch,
  AgentFlowEvent,
  AgentFlowPhase,
  ChatFlowSourceEvent,
} from "./agent-flow-types";

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function boolText(value: unknown) {
  return typeof value === "boolean" ? String(value) : undefined;
}

function branchValue(value: unknown): AgentFlowBranch | undefined {
  return value === "general" || value === "data" || value === "matched" || value === "no_template" || value === "error" ? value : undefined;
}

function shortText(value: unknown, maxLength = 92) {
  if (typeof value !== "string") return undefined;
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function newFlowEvent(
  source: ChatFlowSourceEvent,
  index: number,
  event: Omit<AgentFlowEvent, "id" | "turnId" | "at" | "data"> & { data?: Record<string, unknown> },
): AgentFlowEvent {
  return {
    ...event,
    id: `${source.turnId}-${source.event}-${index}-${source.at}`,
    turnId: source.turnId,
    at: source.at,
  };
}

function phaseSeen(events: AgentFlowEvent[], phase: AgentFlowPhase) {
  return events.some((event) => event.phase === phase);
}

export function summarizeFlowState(events: AgentFlowEvent[]): AgentFlowAdapterState {
  const state: AgentFlowAdapterState = {
    hasDataTask: false,
    hasMatcher: false,
    hasSurface: false,
  };

  for (const event of events) {
    if (event.branch === "data" || event.phase === "data_loaded" || event.phase === "profile") {
      state.hasDataTask = true;
    }
    if (event.phase === "matcher") state.hasMatcher = true;
    if (event.phase === "surface") state.hasSurface = true;
    if (event.branch) state.branch = event.branch;
  }

  return state;
}

function branchFromDone(source: ChatFlowSourceEvent, state: AgentFlowAdapterState): AgentFlowBranch | undefined {
  const explicitBranch = branchValue(source.data.branch);
  if (explicitBranch) return explicitBranch;
  const mode = textValue(source.data.mode);
  if (mode === "render_surface") return "matched";
  if (mode === "error") return "error";
  if (mode === "text_fallback") return state.hasMatcher || state.hasDataTask ? "no_template" : "general";
  return state.branch;
}

function doneDetail(source: ChatFlowSourceEvent) {
  const reason = shortText(source.data.reason);
  const strategy = shortText(source.data.strategy);
  const score = numberValue(source.data.score);
  return [strategy ? `strategy=${strategy}` : undefined, typeof score === "number" ? `score=${score.toFixed(2)}` : undefined, reason]
    .filter(Boolean)
    .join(" | ");
}

function matcherDetail(source: ChatFlowSourceEvent) {
  const strategy = shortText(source.data.strategy);
  const score = numberValue(source.data.score);
  const candidateCount = numberValue(source.data.candidateCount);
  const templateId = shortText(source.data.templateId);
  const mode = shortText(source.data.mode);
  return [
    mode ? `mode=${mode}` : undefined,
    templateId ? `template=${templateId}` : undefined,
    strategy ? `strategy=${strategy}` : undefined,
    typeof score === "number" ? `score=${score.toFixed(2)}` : undefined,
    typeof candidateCount === "number" ? `candidates=${candidateCount}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");
}

function profileDetail(source: ChatFlowSourceEvent) {
  const rowCount = numberValue(source.data.rowCount);
  const previewRowCount = numberValue(source.data.previewRowCount);
  const booleanFieldCount = numberValue(source.data.booleanFieldCount);
  const hasImageField = boolText(source.data.hasImageField);
  return [
    typeof rowCount === "number" ? `rows=${rowCount}` : undefined,
    typeof previewRowCount === "number" ? `preview=${previewRowCount}` : undefined,
    typeof booleanFieldCount === "number" ? `booleans=${booleanFieldCount}` : undefined,
    hasImageField ? `image=${hasImageField}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");
}

function surfaceDetail(source: ChatFlowSourceEvent) {
  const surface = source.data.surface;
  if (!surface || typeof surface !== "object" || Array.isArray(surface)) return "";
  const record = surface as Record<string, unknown>;
  const templateId = shortText(record.templateId);
  const meta = record.meta && typeof record.meta === "object" && !Array.isArray(record.meta)
    ? (record.meta as Record<string, unknown>)
    : {};
  const registryVersion = numberValue(meta.registryVersion);
  const strategy = shortText(meta.strategy);
  return [
    templateId ? `template=${templateId}` : undefined,
    typeof registryVersion === "number" ? `registry=v${registryVersion}` : undefined,
    strategy ? `strategy=${strategy}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");
}

function localEvent(source: ChatFlowSourceEvent, state: AgentFlowAdapterState): AgentFlowEvent[] {
  if (source.event === "request_start") {
    return [
      newFlowEvent(source, 0, {
        event: "request_start",
        phase: "request",
        from: "chat",
        to: "next",
        label: "POST /api/chat",
        detail: source.query,
        severity: "info",
        physicalEmitter: "chat",
        data: source.data,
      }),
    ];
  }

  if (source.event === "response_open") {
    return [
      newFlowEvent(source, 0, {
        event: "response_open",
        phase: "bridge",
        from: "next",
        to: "python_bridge",
        label: "Open /chat/stream",
        detail: `registry=v${source.registryVersion}`,
        severity: "info",
        physicalEmitter: "next",
        data: source.data,
      }),
    ];
  }

  if (source.event === "request_error" || source.event === "response_error") {
    return [
      newFlowEvent(source, 0, {
        event: source.event,
        phase: "error",
        from: state.hasDataTask ? "a2ui" : "next",
        to: "chat",
        label: "Request failed",
        detail: textValue(source.data.message, "Unable to complete chat request."),
        branch: "error",
        severity: "error",
        physicalEmitter: "next",
        data: source.data,
      }),
    ];
  }

  return [];
}

function stateEvent(source: ChatFlowSourceEvent, existingEvents: AgentFlowEvent[]): AgentFlowEvent[] {
  const status = textValue(source.data.status);
  const label = textValue(source.data.label, status);

  if (status === "planning") {
    return [
      newFlowEvent(source, 0, {
        event: "state:planning",
        phase: "planning",
        from: "python_bridge",
        to: "a2ui",
        label: "Delegate chat turn",
        detail: label || "A2UI Agent started planning.",
        severity: "info",
        physicalEmitter: "python-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "intent") {
    const isGeneral = label === "general";
    return [
      newFlowEvent(source, 0, {
        event: "state:intent",
        phase: "intent",
        from: "a2ui",
        to: "llm",
        label: isGeneral ? "Classify as general chat" : "Classify as data task",
        detail: [
          `intent=${label || "unknown"}`,
          source.data.source ? `source=${String(source.data.source)}` : undefined,
          source.data.llmConfigured !== undefined ? `llm=${String(source.data.llmConfigured)}` : undefined,
        ]
          .filter(Boolean)
          .join(" | "),
        branch: isGeneral ? "general" : "data",
        severity: "info",
        physicalEmitter: "python-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "tool") {
    return [
      newFlowEvent(source, 0, {
        event: "state:tool",
        phase: "data_loaded",
        from: "a2ui",
        to: "business_db",
        label: "Query business data",
        detail: label || "equipment data",
        branch: "data",
        severity: "info",
        physicalEmitter: "python-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "data_loaded") {
    return [
      newFlowEvent(source, 0, {
        event: "state:data_loaded",
        phase: "data_loaded",
        from: "business_db",
        to: "a2ui",
        label: "Business data loaded",
        detail: profileDetail(source),
        branch: "data",
        severity: "success",
        physicalEmitter: "python-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "profile") {
    const events: AgentFlowEvent[] = [];
    if (!phaseSeen(existingEvents, "data_loaded")) {
      events.push(
        newFlowEvent(source, events.length, {
          event: "state:data_loaded",
          phase: "data_loaded",
          from: "business_db",
          to: "a2ui",
          label: "Business data loaded",
          detail: profileDetail(source),
          branch: "data",
          severity: "success",
          physicalEmitter: "python-agent",
          data: source.data,
        }),
      );
    }
    events.push(
      newFlowEvent(source, events.length, {
        event: "state:profile",
        phase: "profile",
        from: "a2ui",
        to: "a2ui",
        label: "Build profile and derived schema",
        detail: profileDetail(source),
        branch: "data",
        severity: "success",
        physicalEmitter: "python-agent",
        data: source.data,
      }),
    );
    return events;
  }

  if (status === "a2a" || status === "mcp") {
    return [
      newFlowEvent(source, 0, {
        event: `state:${status}`,
        phase: "registry_loaded",
        from: "a2ui",
        to: "registry",
        label: "Load template contracts",
        detail: `transport=${status}${label ? ` | ${label}` : ""}`,
        branch: "data",
        severity: "info",
        physicalEmitter: "python-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "registry_loaded") {
    return [
      newFlowEvent(source, 0, {
        event: "state:registry_loaded",
        phase: "registry_loaded",
        from: "registry",
        to: "a2ui",
        label: "Template contracts loaded",
        detail: source.data.templateCount ? `templates=${String(source.data.templateCount)}` : undefined,
        branch: "data",
        severity: "success",
        physicalEmitter: "python-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "matcher") {
    return [
      newFlowEvent(source, 0, {
        event: "state:matcher",
        phase: "matcher",
        from: "a2ui",
        to: "a2ui",
        label: "Match template and fields",
        detail: matcherDetail(source),
        branch: "data",
        severity: "info",
        physicalEmitter: "python-agent",
        data: source.data,
      }),
    ];
  }

  return [
    newFlowEvent(source, 0, {
      event: `state:${status || "unknown"}`,
      phase: "planning",
      from: "a2ui",
      to: "a2ui",
      label: label || "Runtime state",
      severity: "info",
      physicalEmitter: "python-agent",
      data: source.data,
    }),
  ];
}

function sseEvent(source: ChatFlowSourceEvent, existingEvents: AgentFlowEvent[]): AgentFlowEvent[] {
  const state = summarizeFlowState(existingEvents);

  if (source.event === "state") {
    return stateEvent(source, existingEvents);
  }

  if (source.event === "surface") {
    return [
      newFlowEvent(source, 0, {
        event: "surface",
        phase: "surface",
        from: "a2ui",
        to: "chat",
        label: "Emit SurfaceEnvelope",
        detail: surfaceDetail(source),
        branch: "matched",
        severity: "success",
        physicalEmitter: "python-agent",
        data: source.data,
      }),
    ];
  }

  if (source.event === "text" || source.event === "delta") {
    const branch: AgentFlowBranch = branchValue(source.data.branch) ?? (state.hasMatcher || state.hasDataTask ? "no_template" : "general");
    const isMatchedSummary = branch === "matched";
    if (branch === "general") {
      return [
        newFlowEvent(source, 0, {
          event: "llm:answer",
          phase: "general_chat",
          from: "llm",
          to: "a2ui",
          label: "Text answer",
          detail: shortText(source.data.text ?? source.data.delta),
          branch,
          severity: "success",
          physicalEmitter: "python-agent",
          data: source.data,
        }),
        newFlowEvent(source, 1, {
          event: source.event,
          phase: "general_chat",
          from: "a2ui",
          to: "chat",
          label: "Stream to chat",
          detail: shortText(source.data.text ?? source.data.delta),
          branch,
          severity: "success",
          physicalEmitter: "python-agent",
          data: source.data,
        }),
      ];
    }
    return [
      newFlowEvent(source, 0, {
        event: source.event,
        phase: isMatchedSummary ? "surface" : "text_fallback",
        from: isMatchedSummary ? "a2ui" : "llm",
        to: "chat",
        label: isMatchedSummary ? "Emit matched summary" : "Emit fallback text",
        detail: shortText(source.data.text ?? source.data.delta),
        branch,
        severity: branch === "no_template" ? "warning" : "success",
        physicalEmitter: "python-agent",
        data: source.data,
      }),
    ];
  }

  if (source.event === "error") {
    return [
      newFlowEvent(source, 0, {
        event: "error",
        phase: "error",
        from: "a2ui",
        to: "chat",
        label: "Runtime error",
        detail: [shortText(source.data.message), shortText(source.data.details)].filter(Boolean).join(" | "),
        branch: "error",
        severity: "error",
        physicalEmitter: "python-agent",
        data: source.data,
      }),
    ];
  }

  if (source.event === "done") {
    const branch = branchFromDone(source, state);
    const events: AgentFlowEvent[] = [];
    if (branch === "no_template" && !phaseSeen(existingEvents, "no_template")) {
      events.push(
        newFlowEvent(source, events.length, {
          event: "matcher:no_template",
          phase: "no_template",
          from: "a2ui",
          to: "a2ui",
          label: "No compatible template",
          detail: doneDetail(source),
          branch,
          severity: "warning",
          physicalEmitter: "python-agent",
          data: source.data,
        }),
      );
    }
    events.push(
      newFlowEvent(source, events.length, {
        event: "done",
        phase: "done",
        from: branch === "error" ? "a2ui" : undefined,
        to: branch === "error" ? "chat" : undefined,
        label: branch === "matched" ? "Completed with surface" : branch === "error" ? "Completed with error" : "Completed with text",
        detail: doneDetail(source),
        branch,
        severity: branch === "error" ? "error" : branch === "matched" ? "success" : "info",
        physicalEmitter: "python-agent",
        data: source.data,
      }),
    );
    return events;
  }

  return [
    newFlowEvent(source, 0, {
      event: source.event,
      phase: "planning",
      label: source.event,
      severity: "info",
      physicalEmitter: "python-agent",
      data: source.data,
    }),
  ];
}

export function agentFlowEventsFromSource(source: ChatFlowSourceEvent, existingEvents: AgentFlowEvent[]) {
  return source.kind === "local" ? localEvent(source, summarizeFlowState(existingEvents)) : sseEvent(source, existingEvents);
}

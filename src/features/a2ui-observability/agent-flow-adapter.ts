import type {
  AgentFlowAdapterState,
  AgentFlowBranch,
  AgentFlowEvent,
  AgentFlowPhase,
  ChatFlowSourceEvent,
} from "@/features/a2ui-core/agent-event-types";

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
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
    evidenceKind: "observed",
    ...event,
    id: `${source.turnId}-${source.event}-${index}-${source.at}`,
    turnId: source.turnId,
    at: source.at,
  };
}

function phaseSeen(events: AgentFlowEvent[], phase: AgentFlowPhase) {
  return events.some((event) => event.phase === phase);
}

function eventSeen(events: AgentFlowEvent[], eventName: string) {
  return events.some((event) => event.event === eventName);
}

function isLiveA2UIProgress(source: ChatFlowSourceEvent) {
  return source.data.liveA2UIProgress === true || source.data.physicalSource === "a2ui-agent";
}

function a2uiEvidenceKind(source: ChatFlowSourceEvent) {
  return isLiveA2UIProgress(source) ? "observed" : "trace_derived";
}

function a2uiEmitter(source: ChatFlowSourceEvent) {
  return isLiveA2UIProgress(source) ? "a2ui-agent" : "a2ui-proxy-agent";
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
  const rowCount = numberValue(source.data.rowCount) ?? numberValue(source.data.sourceRowCount);
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

function toolDetail(source: ChatFlowSourceEvent) {
  const apiId = shortText(source.data.apiId);
  const sourceToolName = shortText(source.data.sourceToolName);
  const sourceToolResultId = shortText(source.data.sourceToolResultId, 34);
  const rowCount = numberValue(source.data.rowCount) ?? numberValue(source.data.sourceRowCount);
  const hash = shortText(source.data.sourceDataHash, 14);
  return [
    sourceToolName ? `tool=${sourceToolName}` : undefined,
    apiId ? `api=${apiId}` : undefined,
    sourceToolResultId ? `result=${sourceToolResultId}` : undefined,
    typeof rowCount === "number" ? `rows=${rowCount}` : undefined,
    hash ? `hash=${hash}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");
}

function renderToolDetail(source: ChatFlowSourceEvent) {
  const renderToolName = shortText(source.data.renderToolName) ?? shortText(source.data.label);
  const policy = shortText(source.data.renderToolCallPolicy);
  const sourceToolName = shortText(source.data.sourceToolName);
  const integrity = recordValue(source.data.dataIntegrity);
  const matched = boolText(integrity?.matched);
  return [
    renderToolName ? `tool=${renderToolName}` : undefined,
    sourceToolName ? `source=${sourceToolName}` : undefined,
    policy ? `policy=${policy}` : undefined,
    matched ? `integrity=${matched}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");
}

function mappingCount(source: ChatFlowSourceEvent) {
  const mapping = recordValue(source.data.mapping);
  const mappings = Array.isArray(mapping?.mappings) ? mapping.mappings.length : undefined;
  return typeof mappings === "number" ? mappings : undefined;
}

function traceDerivedData(source: ChatFlowSourceEvent, extra?: Record<string, unknown>) {
  return {
    ...source.data,
    traceSource: "returned A2UI artifact metadata",
    ...extra,
  };
}

function a2uiStepData(source: ChatFlowSourceEvent, extra?: Record<string, unknown>) {
  if (isLiveA2UIProgress(source)) return { ...source.data, ...extra };
  return traceDerivedData(source, extra);
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
        label: "채팅 요청 수신",
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
        to: "proxy_agent",
        label: "채팅 스트림 열기",
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
        label: "요청 실패",
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

  if (status === "proxy_main_agent_call") {
    return [
      newFlowEvent(source, 0, {
        event: "state:proxy_main_agent_call",
        phase: "bridge",
        from: "proxy_agent",
        to: "main_agent",
        label: "Main Agent 호출",
        detail: label,
        severity: "info",
        physicalEmitter: "a2ui-proxy-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "proxy_data_received") {
    return [
      newFlowEvent(source, 0, {
        event: "state:proxy_data_received",
        phase: "data_loaded",
        from: "main_agent",
        to: "proxy_agent",
        label: "조회 데이터와 메타데이터 반환",
        detail: toolDetail(source),
        branch: "data",
        severity: "success",
        physicalEmitter: "a2ui-proxy-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "proxy_a2ui_call") {
    return [
      newFlowEvent(source, 0, {
        event: "transport:a2a_send",
        phase: "registry_loaded",
        from: "proxy_agent",
        to: "a2ui",
        label: "조회 데이터로 A2UI Agent 호출",
        detail: toolDetail(source),
        branch: "data",
        severity: "info",
        physicalEmitter: "a2ui-proxy-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "render_selected") {
    return [
      newFlowEvent(source, 0, {
        event: "state:render_selected",
        phase: "matcher",
        from: "proxy_agent",
        to: "a2ui",
        label: "사용자 선택 화면 생성",
        detail: matcherDetail(source),
        branch: "matched",
        severity: "info",
        physicalEmitter: "a2ui-proxy-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "planning") {
    return [
      newFlowEvent(source, 0, {
        event: "state:planning",
        phase: "planning",
        from: "main_agent",
        to: "main_agent",
        label: "대화 처리 계획",
        detail: label || "Main Agent started planning.",
        severity: "info",
        physicalEmitter: "main-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "intent") {
    const isGeneral = label === "general";
    const intentSource = textValue(source.data.source);
    const usesLlm = intentSource === "llm";
    const detail = [
      `intent=${label || "unknown"}`,
      intentSource ? `source=${intentSource}` : undefined,
      source.data.intentRouter ? `router=${String(source.data.intentRouter)}` : undefined,
      usesLlm && source.data.llmConfigured !== undefined ? `llm=${String(source.data.llmConfigured)}` : undefined,
    ]
      .filter(Boolean)
      .join(" | ");
    const branch = isGeneral ? "general" : "data";
    return [
      newFlowEvent(source, 0, {
        event: "state:intent",
        phase: "intent",
        from: "main_agent",
        to: usesLlm ? "llm" : "main_agent",
        label: usesLlm ? (isGeneral ? "일반 대화로 분류" : "API 데이터 호출 판단") : isGeneral ? "정규식 일반 분류" : "정규식 API 라우팅",
        detail,
        branch,
        severity: "info",
        physicalEmitter: "main-agent",
        data: source.data,
      }),
      newFlowEvent(source, 1, {
        event: "state:intent_result",
        phase: "intent",
        from: usesLlm ? "llm" : "main_agent",
        to: "main_agent",
        label: usesLlm ? (isGeneral ? "일반 의도 반환" : "API 데이터 호출 여부반환") : isGeneral ? "일반 분류 결과" : "API 라우팅 결과",
        detail,
        branch,
        severity: "success",
        physicalEmitter: "main-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "tool") {
    return [
      newFlowEvent(source, 0, {
        event: "state:tool",
        phase: "data_loaded",
        from: "main_agent",
        to: "business_db",
        label: "업무 데이터 조회",
        detail: label || "equipment data",
        branch: "data",
        severity: "info",
        physicalEmitter: "main-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "business_tool_selected") {
    return [
      newFlowEvent(source, 0, {
        event: "state:business_tool_selected",
        phase: "intent",
        from: "main_agent",
        to: "main_agent",
        label: "업무 API 도구 선택",
        detail: toolDetail(source) || label,
        branch: "data",
        severity: "info",
        physicalEmitter: "main-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "business_tool_call") {
    return [
      newFlowEvent(source, 0, {
        event: "state:business_tool_call",
        phase: "data_loaded",
        from: "main_agent",
        to: "business_db",
        label: "업무 API 도구 호출",
        detail: toolDetail(source) || label,
        branch: "data",
        severity: "info",
        physicalEmitter: "main-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "business_tool_result") {
    return [
      newFlowEvent(source, 0, {
        event: "state:business_tool_result",
        phase: "data_loaded",
        from: "business_db",
        to: "main_agent",
        label: "업무 API 결과 반환",
        detail: toolDetail(source) || profileDetail(source),
        branch: "data",
        severity: "success",
        physicalEmitter: "main-agent",
        data: source.data,
      }),
    ];
  }

  if (status === "a2ui_tool_selected") {
    return [];
  }

  if (status === "a2ui_tool_call") {
    return [
      newFlowEvent(source, 0, {
        event: "transport:a2a_send",
        phase: "registry_loaded",
        from: "main_agent",
        to: "a2ui",
        label: "A2A 렌더 요청 전송",
        detail: renderToolDetail(source) || "raw business result render request",
        branch: "data",
        severity: "info",
        physicalEmitter: "main-agent",
        evidenceKind: "observed",
        data: source.data,
      }),
    ];
  }

  if (status === "a2ui_tool_result") {
    const detail = [matcherDetail(source), renderToolDetail(source)].filter(Boolean).join(" | ");
    const mode = textValue(source.data.mode);
    const isNoTemplate = mode === "no_template";
    return [
      newFlowEvent(source, 0, {
        event: "transport:a2a_result",
        phase: "matcher",
        from: "a2ui",
        to: "main_agent",
        label: isNoTemplate ? "트레이스/템플릿 없음 결과 반환" : "트레이스/화면 결과 반환",
        detail,
        branch: "data",
        severity: isNoTemplate ? "warning" : "success",
        physicalEmitter: "main-agent",
        evidenceKind: "observed",
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
        to: "main_agent",
        label: "업무 데이터 로드 완료",
        detail: profileDetail(source),
        branch: "data",
        severity: "success",
        physicalEmitter: "main-agent",
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
          to: "main_agent",
          label: "업무 데이터 로드 완료",
          detail: profileDetail(source),
          branch: "data",
          severity: "success",
          physicalEmitter: "main-agent",
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
          label: "API 데이터 관찰",
          detail: profileDetail(source),
          branch: "data",
          severity: "success",
          physicalEmitter: a2uiEmitter(source),
          evidenceKind: a2uiEvidenceKind(source),
          data: a2uiStepData(source, { traceStep: "source_preview" }),
        }),
      );
    return events;
  }

  if (status === "a2a") {
    return [
      newFlowEvent(source, 0, {
        event: `state:${status}`,
        phase: "registry_loaded",
        from: "a2ui",
        to: "registry",
          label: "템플릿 계약 로드",
          detail: isLiveA2UIProgress(source) ? (shortText(source.data.detail) ?? label) : `derived after A2A result | transport=${status}${label ? ` | ${label}` : ""}`,
          branch: "data",
          severity: "info",
          physicalEmitter: a2uiEmitter(source),
          evidenceKind: a2uiEvidenceKind(source),
          data: a2uiStepData(source, { traceStep: "template_contract_request" }),
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
        label: "템플릿 계약 로드 완료",
          detail: source.data.templateCount ? `templates=${String(source.data.templateCount)}` : undefined,
          branch: "data",
          severity: "success",
          physicalEmitter: a2uiEmitter(source),
          evidenceKind: a2uiEvidenceKind(source),
          data: a2uiStepData(source, { traceStep: "template_contracts_loaded" }),
        }),
      ];
    }

  if (status === "matcher") {
    const mode = textValue(source.data.mode);
    if (mode === "comparison_data") {
      if (eventSeen(existingEvents, "state:comparison_data_request")) return [];
      return [
        newFlowEvent(source, 0, {
          event: "state:comparison_data_request",
          phase: "matcher",
          from: "a2ui",
          to: "a2ui",
          label: "비교용 데이터 계약 생성",
          detail: matcherDetail(source),
          branch: "data",
          severity: "info",
          physicalEmitter: a2uiEmitter(source),
          evidenceKind: a2uiEvidenceKind(source),
          data: a2uiStepData(source, { traceStep: "comparison_data_request" }),
        }),
      ];
    }

    if (mode === "comparison_data_ready" || mode === "comparison_data_failed") {
      return [
        newFlowEvent(source, 0, {
          event: "state:comparison_data",
          phase: "matcher",
          from: "a2ui",
          to: "a2ui",
          label: "비교용 데이터 계약 준비",
          detail: matcherDetail(source),
          branch: "data",
          severity: mode === "comparison_data_ready" ? "success" : "warning",
          physicalEmitter: a2uiEmitter(source),
          evidenceKind: a2uiEvidenceKind(source),
          data: a2uiStepData(source, { traceStep: "comparison_data" }),
        }),
      ];
    }

    if (mode === "planning" || mode === "template_selection") {
      if (eventSeen(existingEvents, "state:matcher_request")) return [];
      return [
        newFlowEvent(source, 0, {
          event: "state:matcher_request",
          phase: "matcher",
          from: "a2ui",
          to: "llm",
          label: "템플릿 판단 요청",
          detail: matcherDetail(source),
          branch: "data",
          severity: "info",
          physicalEmitter: a2uiEmitter(source),
          evidenceKind: a2uiEvidenceKind(source),
          data: a2uiStepData(source, { traceStep: "template_selection_request" }),
        }),
      ];
    }

    if (mode === "slot_mapping") {
      if (eventSeen(existingEvents, "state:slot_mapping_request")) return [];
      return [
        newFlowEvent(source, 0, {
          event: "state:slot_mapping_request",
          phase: "matcher",
          from: "a2ui",
          to: "llm",
          label: "슬롯 생성 요청",
          detail: matcherDetail(source),
          branch: "data",
          severity: "info",
          physicalEmitter: a2uiEmitter(source),
          evidenceKind: a2uiEvidenceKind(source),
          data: a2uiStepData(source, { traceStep: "slot_mapping_request" }),
        }),
      ];
    }

    if (mode === "slot_mapping_ready") {
      return [
        newFlowEvent(source, 0, {
          event: "state:slot_mapping_plan",
          phase: "matcher",
          from: "llm",
          to: "a2ui",
          label: "슬롯 생성 결과 반환",
          detail: matcherDetail(source),
          branch: "data",
          severity: "info",
          physicalEmitter: a2uiEmitter(source),
          evidenceKind: a2uiEvidenceKind(source),
          data: a2uiStepData(source, { traceStep: "slot_mapping_plan" }),
        }),
      ];
    }

    if (!isLiveA2UIProgress(source) && eventSeen(existingEvents, "state:ai_surface_plan")) return [];
    const events = [
      newFlowEvent(source, 0, {
        event: "state:ai_surface_plan",
        phase: "matcher",
        from: "llm",
        to: "a2ui",
        label: "판단 결과 반환",
        detail: matcherDetail(source),
        branch: "data",
        severity: "info",
        physicalEmitter: a2uiEmitter(source),
        evidenceKind: a2uiEvidenceKind(source),
        data: a2uiStepData(source, { traceStep: "template_selection" }),
      }),
    ];
    if (mode === "render_surface" && !isLiveA2UIProgress(source)) {
      if (!eventSeen(existingEvents, "state:plan_validation")) {
        events.push(newFlowEvent(source, events.length, {
          event: "state:plan_validation",
          phase: "matcher",
          from: "a2ui",
          to: "a2ui",
          label: "슬롯 검증",
          detail: "validator accepted returned plan",
          branch: "data",
          severity: "success",
          physicalEmitter: "main-agent",
          evidenceKind: "trace_derived",
          data: traceDerivedData(source, { traceStep: "plan_validation" }),
        }));
      }
      if (!eventSeen(existingEvents, "state:mapping_applied")) {
        events.push(newFlowEvent(source, events.length, {
          event: "state:mapping_applied",
          phase: "matcher",
          from: "a2ui",
          to: "a2ui",
          label: "데이터 / 슬롯 맵핑",
          detail: typeof mappingCount(source) === "number" ? `mappings=${mappingCount(source)}` : matcherDetail(source),
          branch: "data",
          severity: "success",
          physicalEmitter: "main-agent",
          evidenceKind: "trace_derived",
          data: traceDerivedData(source, { traceStep: "mapping_applied" }),
        }));
      }
    }
    return events;
  }

  if (status === "plan_validation") {
    const validation = recordValue(source.data.validation);
    const ok = validation?.ok === true;
    return [
      newFlowEvent(source, 0, {
        event: "state:plan_validation",
        phase: "matcher",
        from: "a2ui",
        to: "a2ui",
        label: "슬롯 검증",
        detail: shortText(source.data.detail) ?? (ok ? "validator accepted returned plan" : "validator rejected returned plan"),
        branch: "data",
        severity: ok ? "success" : "warning",
        physicalEmitter: a2uiEmitter(source),
        evidenceKind: a2uiEvidenceKind(source),
        data: a2uiStepData(source, { traceStep: "plan_validation" }),
      }),
    ];
  }

  if (status === "mapping_applied") {
    const count = numberValue(source.data.fieldMappingCount) ?? mappingCount(source);
    return [
      newFlowEvent(source, 0, {
        event: "state:mapping_applied",
        phase: "matcher",
        from: "a2ui",
        to: "a2ui",
        label: "데이터 / 슬롯 맵핑",
        detail: typeof count === "number" ? `mappings=${count}` : shortText(source.data.detail),
        branch: "data",
        severity: "success",
        physicalEmitter: a2uiEmitter(source),
        evidenceKind: a2uiEvidenceKind(source),
        data: a2uiStepData(source, { traceStep: "mapping_applied" }),
      }),
    ];
  }

  return [
    newFlowEvent(source, 0, {
      event: `state:${status || "unknown"}`,
      phase: "planning",
      from: "a2ui",
      to: "a2ui",
      label: label || "런타임 상태",
      severity: "info",
      physicalEmitter: "main-agent",
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
        from: "proxy_agent",
        to: "chat",
        label: "A2UI 화면 반환",
        detail: surfaceDetail(source),
        branch: "matched",
        severity: "success",
        physicalEmitter: "a2ui-proxy-agent",
        data: source.data,
      }),
    ];
  }

  if (source.event === "display_options") {
    return [
      newFlowEvent(source, 0, {
        event: "display_options",
        phase: "matcher",
        from: "proxy_agent",
        to: "chat",
        label: "표시 방식 선택 요청",
        detail: `${Array.isArray(source.data.options) ? source.data.options.length : 0} candidates`,
        branch: "matched",
        severity: "success",
        physicalEmitter: "a2ui-proxy-agent",
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
          to: "main_agent",
          label: "텍스트 답변 생성",
          detail: shortText(source.data.text ?? source.data.delta),
          branch,
          severity: "success",
          physicalEmitter: "main-agent",
          data: source.data,
        }),
        newFlowEvent(source, 1, {
          event: source.event,
          phase: "general_chat",
          from: "main_agent",
          to: "chat",
          label: "채팅으로 전송",
          detail: shortText(source.data.text ?? source.data.delta),
          branch,
          severity: "success",
          physicalEmitter: "main-agent",
          data: source.data,
        }),
      ];
    }
    return [
      newFlowEvent(source, 0, {
        event: source.event,
        phase: isMatchedSummary ? "surface" : "text_fallback",
        from: "main_agent",
        to: "chat",
        label: isMatchedSummary ? "텍스트 요약 반환" : "대체 텍스트 반환",
        detail: shortText(source.data.text ?? source.data.delta),
        branch,
        severity: branch === "no_template" ? "warning" : "success",
        physicalEmitter: "main-agent",
        data: source.data,
      }),
    ];
  }

  if (source.event === "error") {
    return [
      newFlowEvent(source, 0, {
        event: "error",
        phase: "error",
        from: "main_agent",
        to: "chat",
        label: "런타임 오류",
        detail: [shortText(source.data.message), shortText(source.data.details)].filter(Boolean).join(" | "),
        branch: "error",
        severity: "error",
        physicalEmitter: "main-agent",
        data: source.data,
      }),
    ];
  }

  if (source.event === "done") {
    const branch = branchFromDone(source, state);
    return [
      newFlowEvent(source, 0, {
        event: "done",
        phase: "done",
        from: branch === "error" ? "main_agent" : undefined,
        to: branch === "error" ? "chat" : undefined,
        label: branch === "matched" ? "화면 응답 완료" : branch === "error" ? "오류로 완료" : "텍스트 응답 완료",
        detail: doneDetail(source),
        branch,
        severity: branch === "error" ? "error" : branch === "matched" ? "success" : "info",
        physicalEmitter: "main-agent",
        data: source.data,
      }),
    ];
  }

  return [
    newFlowEvent(source, 0, {
      event: source.event,
      phase: "planning",
      label: source.event,
      severity: "info",
      physicalEmitter: "main-agent",
      data: source.data,
    }),
  ];
}

export function agentFlowEventsFromSource(source: ChatFlowSourceEvent, existingEvents: AgentFlowEvent[]) {
  return source.kind === "local" ? localEvent(source, summarizeFlowState(existingEvents)) : sseEvent(source, existingEvents);
}

import { createHash } from "node:crypto";
import type {
  A2UICandidateTrace,
  A2UIMappingDecision,
} from "@/features/a2ui-template-poc/template-types";
import {
  type A2AActionRequestData,
  type A2ARenderRequestData,
  type A2ASendMessageRequest,
  type A2ATask,
  A2A_ACTION,
  A2A_RENDER_REQUEST,
} from "./a2a-types";
import { asRecord, textFromMessage } from "./a2a-types";
import { message, newA2AId, surfaceArtifact, task, traceArtifact } from "./a2ui-artifacts";
import { setTask } from "./a2ui-task-store";
import {
  type A2UISurfacePlanProgress,
  type A2UISurfacePlanResult,
  type A2UISurfacePlanTrace,
  planA2UISurfaceWithAI,
} from "@/server/a2ui-admin/a2ui-ai-surface-planner";
import {
  type EquipmentApiId,
  chooseEquipmentApiForPrompt,
  isEquipmentApiId,
} from "@/server/a2ui-admin/a2ui-runtime";

export type A2AStreamEvent =
  | { task: A2ATask }
  | { statusUpdate: { taskId: string; status: A2ATask["status"] } }
  | { artifactUpdate: { taskId: string; artifact: NonNullable<A2ATask["artifacts"]>[number] } }
  | { progressUpdate: A2AProgressUpdate };

export type A2AProgressUpdate = {
  taskId: string;
  status: A2UISurfacePlanProgress["status"];
  label: string;
  detail?: string;
  emittedAt: string;
  data?: Record<string, unknown>;
};

type RenderTaskProgressHandler = (progress: A2UISurfacePlanProgress) => void | Promise<void>;

function createAsyncQueue<T>() {
  const values: T[] = [];
  let closed = false;
  let resolve: ((result: IteratorResult<T>) => void) | undefined;

  return {
    push(value: T) {
      if (closed) return;
      if (resolve) {
        const pending = resolve;
        resolve = undefined;
        pending({ value, done: false });
        return;
      }
      values.push(value);
    },
    close() {
      closed = true;
      if (resolve) {
        const pending = resolve;
        resolve = undefined;
        pending({ value: undefined as T, done: true });
      }
    },
    async *iterate() {
      while (true) {
        const value = values.shift();
        if (value) {
          yield value;
          continue;
        }
        if (closed) return;
        const result = await new Promise<IteratorResult<T>>((next) => {
          resolve = next;
        });
        if (result.done) return;
        yield result.value;
      }
    },
  };
}

function readApiId(value: unknown): EquipmentApiId | undefined {
  return isEquipmentApiId(value) ? value : undefined;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function dataRowCount(value: unknown) {
  if (Array.isArray(value)) return value.length;
  const record = asRecord(value);
  if (!record) return 0;
  if (Array.isArray(record.items)) return typeof record.total === "number" ? record.total : record.items.length;
  if (Array.isArray(record.rows)) return typeof record.total === "number" ? record.total : record.rows.length;
  for (const parentKey of ["result", "data", "payload"]) {
    const parent = asRecord(record[parentKey]);
    if (!parent) continue;
    for (const childKey of ["items", "rows", "list"]) {
      const rows = parent[childKey];
      if (Array.isArray(rows)) {
        return typeof parent.total === "number"
          ? parent.total
          : typeof parent.totalCount === "number"
            ? parent.totalCount
            : rows.length;
      }
    }
  }
  return 1;
}

function dataShape(value: unknown) {
  if (Array.isArray(value)) return value.every((item) => asRecord(item)) ? "array<object>" : "array";
  const record = asRecord(value);
  if (!record) return typeof value;
  if (Array.isArray(record.items)) return record.items.every((item) => asRecord(item)) ? "object{items:array<object>}" : "object{items:array}";
  if (Array.isArray(record.rows)) return record.rows.every((item) => asRecord(item)) ? "object{rows:array<object>}" : "object{rows:array}";
  for (const parentKey of ["result", "data", "payload"]) {
    const parent = asRecord(record[parentKey]);
    if (!parent) continue;
    for (const childKey of ["items", "rows", "list"]) {
      const rows = parent[childKey];
      if (Array.isArray(rows)) return `object{${parentKey}.${childKey}:array<object>}`;
    }
  }
  return "object";
}

function dataSnapshot(value: unknown) {
  if (value === undefined) return undefined;
  const canonical = stableStringify(value);
  return {
    dataHash: createHash("sha256").update(canonical, "utf8").digest("hex"),
    byteLength: new TextEncoder().encode(canonical).length,
    rowCount: dataRowCount(value),
    shape: dataShape(value),
    topLevelKeys: asRecord(value) ? Object.keys(value as Record<string, unknown>).sort() : undefined,
  };
}

function readSourceToolMetadata(
  renderData: A2ARenderRequestData,
  facts: Record<string, unknown>,
  apiId: EquipmentApiId,
) {
  const explicit = asRecord(renderData.toolMetadata) ?? {};
  const renderRecord = renderData as Record<string, unknown>;
  const metadata: Record<string, unknown> = {};
  const keys = [
    "source",
    "operation",
    "sourceToolName",
    "sourceToolResultId",
    "sourceApiId",
    "sourceDataHash",
    "sourceDataByteLength",
    "sourceRowCount",
    "sourceDataShape",
    "sourceTopLevelKeys",
    "renderToolName",
    "renderToolCallPolicy",
    "displayDataHash",
    "displayDataByteLength",
    "displayRowCount",
    "displayDataShape",
    "aiSurfacePlanTrace",
    "intentSource",
  ];

  for (const key of keys) {
    const value = explicit[key] ?? facts[key] ?? renderRecord[key];
    if (value !== undefined) metadata[key] = value;
  }

  if (Object.keys(metadata).length === 0) return undefined;
  metadata.sourceApiId ??= apiId;
  return metadata;
}

function buildDataIntegrity(rawData: unknown, sourceTool?: Record<string, unknown>) {
  const received = dataSnapshot(rawData);
  if (!received && !sourceTool) return undefined;

  const expectedHash = typeof sourceTool?.sourceDataHash === "string" ? sourceTool.sourceDataHash : undefined;
  const expectedByteLength = typeof sourceTool?.sourceDataByteLength === "number" ? sourceTool.sourceDataByteLength : undefined;
  const expectedRowCount = typeof sourceTool?.sourceRowCount === "number" ? sourceTool.sourceRowCount : undefined;
  const hashMatched = expectedHash ? Boolean(received && expectedHash === received.dataHash) : undefined;
  const rowCountMatched = expectedRowCount !== undefined ? Boolean(received && expectedRowCount === received.rowCount) : undefined;
  const byteLengthMatched = expectedByteLength !== undefined ? Boolean(received && expectedByteLength === received.byteLength) : undefined;
  const checks = [hashMatched, rowCountMatched, byteLengthMatched].filter((value) => value !== undefined);

  return {
    comparedAt: new Date().toISOString(),
    expectedHash,
    receivedHash: received?.dataHash,
    hashMatched,
    expectedRowCount,
    receivedRowCount: received?.rowCount,
    rowCountMatched,
    expectedByteLength,
    receivedByteLength: received?.byteLength,
    byteLengthMatched,
    receivedShape: received?.shape,
    receivedTopLevelKeys: received?.topLevelKeys,
    matched: checks.length > 0 ? checks.every(Boolean) : undefined,
  };
}

function withPlanningMetadata(
  sourceTool: Record<string, unknown> | undefined,
  apiId: EquipmentApiId,
  trace?: A2UISurfacePlanTrace,
) {
  if (!trace) return sourceTool;
  return {
    ...(sourceTool ?? {}),
    sourceApiId: sourceTool?.sourceApiId ?? apiId,
    aiSurfacePlanTrace: trace,
    displayDataHash: trace.renderDataHash,
    displayDataByteLength: trace.renderDataByteLength,
    displayRowCount: trace.renderRowCount,
    displayDataShape: "object{items:array<object>}",
  };
}

function readRenderData(body: A2ASendMessageRequest): A2ARenderRequestData | undefined {
  const parts = body.message?.parts ?? [];
  for (const part of parts) {
    const data = asRecord(part.data);
    if (!data) continue;
    if (part.mediaType === A2A_RENDER_REQUEST || data.kind === "a2ui.render.request") {
      return data as A2ARenderRequestData;
    }
  }
  return undefined;
}

function readActionData(body: A2ASendMessageRequest): A2AActionRequestData | undefined {
  const parts = body.message?.parts ?? [];
  for (const part of parts) {
    const data = asRecord(part.data);
    if (!data) continue;
    if (part.mediaType === A2A_ACTION || data.kind === "a2ui.action.request") {
      return data as A2AActionRequestData;
    }
  }
  return undefined;
}

function decisionTrace(
  plan: A2UISurfacePlanResult,
  sourceTool?: Record<string, unknown>,
  dataIntegrity?: Record<string, unknown>,
) {
  const candidates = plan.candidates;
  return {
    kind: "a2ui.ai_surface_plan.trace" as const,
    strategy: plan.strategy,
    score: plan.score,
    candidateCount: candidates?.length ?? 0,
    candidates,
    mapping: plan.mode === "render_surface" ? plan.mapping : undefined,
    aiSurfacePlanTrace: plan.trace,
    sourceTool,
    dataIntegrity,
  };
}

function textFallbackTask({
  contextId,
  fallbackText,
  reason,
  plan,
  sourceTool,
  dataIntegrity,
}: {
  contextId?: string;
  fallbackText?: string;
  reason: string;
  plan?: A2UISurfacePlanResult;
  sourceTool?: Record<string, unknown>;
  dataIntegrity?: Record<string, unknown>;
}) {
  const trace = plan ? traceArtifact(decisionTrace(plan, sourceTool, dataIntegrity)) : undefined;
  return task({
    contextId,
    state: "TASK_STATE_COMPLETED",
    text: fallbackText || reason,
    artifacts: trace ? [trace] : undefined,
    metadata: {
      a2uiTaskKind: "text_fallback",
      reason,
      strategy: plan?.strategy,
      score: plan?.score,
      candidates: plan?.candidates,
      mapping: plan?.mode === "render_surface" ? plan.mapping : undefined,
      sourceTool,
      dataIntegrity,
    },
  });
}

function failedTask(
  contextId: string | undefined,
  error: unknown,
  taskId?: string,
  sourceTool?: Record<string, unknown>,
  dataIntegrity?: Record<string, unknown>,
) {
  const reason = error instanceof Error ? error.message : String(error);
  return task({
    id: taskId,
    contextId,
    state: "TASK_STATE_FAILED",
    text: "A2UI surface를 생성하지 못했습니다.",
    metadata: {
      a2uiTaskKind: "failed",
      reason,
      sourceTool,
      dataIntegrity,
    },
  });
}

async function renderTask(body: A2ASendMessageRequest, taskId?: string, onProgress?: RenderTaskProgressHandler): Promise<A2ATask> {
  const renderData = readRenderData(body);
  const query = renderData?.query?.trim() || textFromMessage(body.message).trim();
  const contextId = body.message?.contextId;

  if (!renderData || !query) {
    return task({
      id: taskId,
      contextId,
      state: "TASK_STATE_INPUT_REQUIRED",
      text: "A2UI render request와 사용자 질문이 필요합니다.",
      metadata: {
        a2uiTaskKind: "input_required",
        missingFacts: ["query", "renderRequest"],
      },
    });
  }

  const facts = asRecord(renderData.facts) ?? {};
  const apiId = readApiId(renderData.apiId) ?? readApiId(facts.apiId) ?? chooseEquipmentApiForPrompt(query);
  const rawData = renderData.data ?? facts.data ?? renderData.displayData ?? facts.displayData;
  const fallbackText = renderData.fallbackText || (typeof facts.fallbackText === "string" ? facts.fallbackText : undefined);
  let sourceTool = readSourceToolMetadata(renderData, facts, apiId);
  let dataIntegrity = buildDataIntegrity(rawData, sourceTool);

  try {
      const plan = await planA2UISurfaceWithAI({
        query,
        apiId,
        rawData,
        onProgress,
      });
    sourceTool = withPlanningMetadata(sourceTool, apiId, plan.trace);
    dataIntegrity = buildDataIntegrity(rawData, sourceTool);

    if (plan.mode !== "render_surface") {
      const fallback = textFallbackTask({
        contextId,
        fallbackText,
        reason: plan.reason,
        plan,
        sourceTool,
        dataIntegrity,
      });
      return taskId ? { ...fallback, id: taskId } : fallback;
    }

    const surface = {
      templateId: plan.templateId,
      version: "1.0.0",
      payload: {
        apiTitle: plan.apiTitle,
        apiId: plan.apiId,
        data: plan.data,
        profile: plan.profile,
        renderPlan: plan.renderPlan,
      },
      surfaceConfig: plan.template.surfaceConfig,
      sourceIntent: plan.apiId === "equipment-catalog" ? "equipment.catalog.lookup" : "equipment.status.lookup",
      updatedAt: new Date().toISOString(),
      meta: {
        registryVersion: plan.registryVersion,
        decisionReason: plan.reason,
        trace: [
          "source:raw-business-api",
          "planner:source-preview",
          "planner:template_selection",
          "planner:slot_mapping",
          `planner:score:${plan.score}`,
          `planner:selected:${plan.templateId}`,
          ...(plan.candidates.filter((candidate) => candidate.rejected).map((candidate) => `candidate-rejected:${candidate.templateId}:${candidate.rejectionReason}`)),
          "validator:ai-plan",
          "binding:renderer-payload",
        ],
        strategy: plan.strategy,
        score: plan.score,
        candidates: plan.candidates,
        mapping: plan.mapping,
      },
    };
    const trace = decisionTrace(plan, sourceTool, dataIntegrity);
    return task({
      id: taskId,
      contextId,
      state: "TASK_STATE_COMPLETED",
      text: `${plan.apiTitle}입니다. AI가 API 필드와 등록된 A2UI 템플릿을 비교해 정리했습니다.`,
      artifacts: [
        traceArtifact(trace),
        surfaceArtifact({
          schemaVersion: "2026-06-11",
          kind: "a2ui.surface.response",
          surface,
          decision: {
            mode: "render_surface",
            reason: plan.reason,
            strategy: plan.strategy,
            score: plan.score,
            templateId: plan.templateId,
            candidates: plan.candidates as A2UICandidateTrace[] | undefined,
            mapping: plan.mapping as A2UIMappingDecision | undefined,
            aiSurfacePlanTrace: plan.trace,
            sourceTool,
            dataIntegrity,
          },
        }),
      ],
      metadata: {
        a2uiTaskKind: "render_surface",
        reason: plan.reason,
        strategy: plan.strategy,
        score: plan.score,
        candidates: plan.candidates,
        mapping: plan.mapping,
        sourceTool,
        dataIntegrity,
      },
    });
  } catch (error) {
    return failedTask(contextId, error, taskId, sourceTool, dataIntegrity);
  }
}

function actionTask(body: A2ASendMessageRequest, taskId?: string) {
  const actionData = readActionData(body);
  const contextId = body.message?.contextId;
  if (!actionData) return undefined;

  return task({
    id: taskId,
    contextId,
    state: "TASK_STATE_COMPLETED",
    text: "이 POC에서는 A2UI action을 read-only no-op으로 처리했습니다.",
    metadata: {
      a2uiTaskKind: "action_noop",
      templateId: actionData.templateId,
      actionId: actionData.actionId,
      params: actionData.params,
    },
  });
}

export async function handleA2AMessageSend(body: A2ASendMessageRequest): Promise<{ task: A2ATask }> {
  const action = actionTask(body);
  const completed = action ?? (await renderTask(body));
  setTask(completed);
  return { task: completed };
}

export async function* buildA2AStreamEvents(body: A2ASendMessageRequest): AsyncGenerator<A2AStreamEvent> {
  const taskId = newA2AId("task");
  const contextId = body.message?.contextId;
  const working = task({
    id: taskId,
    contextId,
    state: "TASK_STATE_WORKING",
    text: "데이터 스키마를 분석하고 있습니다.",
  });
  setTask(working);

  yield { task: working };
  yield {
    statusUpdate: {
      taskId,
      status: {
        state: "TASK_STATE_WORKING",
        message: message("ROLE_AGENT", "데이터 스키마를 분석하고 있습니다.", contextId),
      },
    },
  };

  const action = actionTask(body, taskId);
  if (action) {
    setTask(action);
    yield { task: action };
    yield { statusUpdate: { taskId, status: action.status } };
    return;
  }

  const queue = createAsyncQueue<A2AStreamEvent>();
  const render = (async () => {
    const completed = await renderTask(body, taskId, async (progress) => {
      const progressUpdate: A2AProgressUpdate = {
        taskId,
        status: progress.status,
        label: progress.label,
        detail: progress.detail,
        emittedAt: new Date().toISOString(),
        data: progress.data,
      };
      queue.push({ progressUpdate });
      queue.push({
        statusUpdate: {
          taskId,
          status: {
            state: "TASK_STATE_WORKING",
            message: message("ROLE_AGENT", progress.detail || progress.label, contextId),
          },
        },
      });
    });
    setTask(completed);
    for (const artifact of completed.artifacts ?? []) {
      queue.push({ artifactUpdate: { taskId, artifact } });
    }
    queue.push({ statusUpdate: { taskId, status: completed.status } });
    queue.push({ task: completed });
    queue.close();
  })();

  for await (const event of queue.iterate()) {
    yield event;
  }
  await render;
}

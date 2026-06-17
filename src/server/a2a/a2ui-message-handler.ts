import { createHash } from "node:crypto";
import type {
  A2UICandidateTrace,
  A2UIMappingDecision,
  EquipmentApiResponse,
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
  type A2UIRecommendation,
  type EquipmentApiId,
  chooseEquipmentApiForPrompt,
  equipmentApiTitle,
  isEquipmentApiId,
  recommendTemplate,
  resolveTemplateData,
} from "@/server/a2ui-admin/a2ui-runtime";

export type A2AStreamEvent =
  | { task: A2ATask }
  | { statusUpdate: { taskId: string; status: A2ATask["status"] } }
  | { artifactUpdate: { taskId: string; artifact: NonNullable<A2ATask["artifacts"]>[number] } };

function readApiId(value: unknown): EquipmentApiId | undefined {
  return isEquipmentApiId(value) ? value : undefined;
}

function readEquipmentData(value: unknown): EquipmentApiResponse<unknown> | undefined {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.items)) return undefined;
  return {
    items: record.items,
    total: typeof record.total === "number" ? record.total : record.items.length,
    page: typeof record.page === "number" ? record.page : 1,
    pageSize: typeof record.pageSize === "number" ? record.pageSize : record.items.length,
  };
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
  const items = record.items;
  if (Array.isArray(items)) return typeof record.total === "number" ? record.total : items.length;
  return 1;
}

function dataShape(value: unknown) {
  if (Array.isArray(value)) return value.every((item) => asRecord(item)) ? "array<object>" : "array";
  const record = asRecord(value);
  if (!record) return typeof value;
  const items = record.items;
  if (Array.isArray(items)) return items.every((item) => asRecord(item)) ? "object{items:array<object>}" : "object{items:array}";
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
    "normalizationTrace",
    "displayDataHash",
    "displayDataByteLength",
    "displayRowCount",
    "displayDataShape",
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
  recommendation: A2UIRecommendation,
  sourceTool?: Record<string, unknown>,
  dataIntegrity?: Record<string, unknown>,
) {
  const candidates = recommendation.candidates;
  return {
    kind: "a2ui.matcher.trace" as const,
    strategy: recommendation.strategy,
    score: recommendation.score,
    candidateCount: candidates?.length ?? 0,
    candidates,
    mapping: recommendation.mapping,
    sourceTool,
    dataIntegrity,
  };
}

function textFallbackTask({
  contextId,
  fallbackText,
  reason,
  recommendation,
  sourceTool,
  dataIntegrity,
}: {
  contextId?: string;
  fallbackText?: string;
  reason: string;
  recommendation?: A2UIRecommendation;
  sourceTool?: Record<string, unknown>;
  dataIntegrity?: Record<string, unknown>;
}) {
  const trace = recommendation ? traceArtifact(decisionTrace(recommendation, sourceTool, dataIntegrity)) : undefined;
  return task({
    contextId,
    state: "TASK_STATE_COMPLETED",
    text: fallbackText || reason,
    artifacts: trace ? [trace] : undefined,
    metadata: {
      a2uiTaskKind: "text_fallback",
      reason,
      strategy: recommendation?.strategy,
      score: recommendation?.score,
      candidates: recommendation?.candidates,
      mapping: recommendation?.mapping,
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

async function renderTask(body: A2ASendMessageRequest, taskId?: string): Promise<A2ATask> {
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
  const sourceTool = readSourceToolMetadata(renderData, facts, apiId);
  const renderDataDisplayEquipment = readEquipmentData(renderData.displayData);
  const factsDisplayEquipment = readEquipmentData(facts.displayData);
  const renderDataEquipment = readEquipmentData(renderData.data);
  const factsEquipment = readEquipmentData(facts.data);
  const data = renderDataDisplayEquipment ?? factsDisplayEquipment ?? renderDataEquipment ?? factsEquipment;
  const rawData = renderData.data ?? facts.data ?? renderData.displayData ?? facts.displayData;
  const dataIntegrity = buildDataIntegrity(rawData, sourceTool);
  const sampleDataPreview = renderData.sampleDataPreview ?? (facts.sampleDataPreview as A2ARenderRequestData["sampleDataPreview"]);
  const derivedSchema = renderData.derivedSchema ?? (facts.derivedSchema as A2ARenderRequestData["derivedSchema"]);
  const fallbackText = renderData.fallbackText || (typeof facts.fallbackText === "string" ? facts.fallbackText : undefined);
  const options = {
    includeTrace: renderData.a2uiOptions?.includeTrace ?? true,
    allowIntentFallback: renderData.a2uiOptions?.allowIntentFallback ?? true,
  };

  try {
    const recommendation = await recommendTemplate({
      query,
      apiId,
      data,
      derivedSchema,
      sampleDataPreview,
      options,
    });

    if (recommendation.mode !== "render_surface" || !recommendation.templateId) {
      const fallback = textFallbackTask({
        contextId,
        fallbackText,
        reason: recommendation.reason,
        recommendation,
        sourceTool,
        dataIntegrity,
      });
      return taskId ? { ...fallback, id: taskId } : fallback;
    }

    if (!data) {
      const fallback = textFallbackTask({
        contextId,
        fallbackText,
        reason: "A2UI surface resolution requires agent-provided data in facts.data.",
        recommendation,
        sourceTool,
        dataIntegrity,
      });
      return taskId ? { ...fallback, id: taskId } : fallback;
    }

    const surface = await resolveTemplateData({
      templateId: recommendation.templateId,
      query,
      apiId,
      data,
      derivedSchema,
      sampleDataPreview,
      mapping: recommendation.mapping,
    });
    const trace = decisionTrace(recommendation, sourceTool, dataIntegrity);
    return task({
      id: taskId,
      contextId,
      state: "TASK_STATE_COMPLETED",
      text: `${equipmentApiTitle(apiId)}입니다. 등록된 A2UI 템플릿으로 정리했습니다.`,
      artifacts: [
        traceArtifact(trace),
        surfaceArtifact({
          schemaVersion: "2026-06-11",
          kind: "a2ui.surface.response",
          surface,
          decision: {
            mode: "render_surface",
            reason: recommendation.reason,
            strategy: recommendation.strategy,
            score: recommendation.score,
            templateId: recommendation.templateId,
            candidates: recommendation.candidates as A2UICandidateTrace[] | undefined,
            mapping: recommendation.mapping as A2UIMappingDecision | undefined,
            sourceTool,
            dataIntegrity,
          },
        }),
      ],
      metadata: {
        a2uiTaskKind: "render_surface",
        reason: recommendation.reason,
        strategy: recommendation.strategy,
        score: recommendation.score,
        candidates: recommendation.candidates,
        mapping: recommendation.mapping,
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

export async function buildA2AStreamEvents(body: A2ASendMessageRequest): Promise<A2AStreamEvent[]> {
  const taskId = newA2AId("task");
  const contextId = body.message?.contextId;
  const working = task({
    id: taskId,
    contextId,
    state: "TASK_STATE_WORKING",
    text: "데이터 스키마를 분석하고 있습니다.",
  });
  setTask(working);

  const completed = actionTask(body, taskId) ?? (await renderTask(body, taskId));
  setTask(completed);

  const events: A2AStreamEvent[] = [
    { task: working },
    {
      statusUpdate: {
        taskId,
        status: {
          state: "TASK_STATE_WORKING",
          message: message("ROLE_AGENT", "데이터 스키마를 분석하고 있습니다.", contextId),
        },
      },
    },
  ];

  for (const artifact of completed.artifacts ?? []) {
    events.push({ artifactUpdate: { taskId, artifact } });
  }

  events.push({
    statusUpdate: {
      taskId,
      status: completed.status,
    },
  });
  return events;
}

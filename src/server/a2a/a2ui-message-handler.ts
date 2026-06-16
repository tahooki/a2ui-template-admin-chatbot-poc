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
  recommendTemplate,
  resolveTemplateData,
} from "@/server/a2ui-admin/a2ui-runtime";

export type A2AStreamEvent =
  | { task: A2ATask }
  | { statusUpdate: { taskId: string; status: A2ATask["status"] } }
  | { artifactUpdate: { taskId: string; artifact: NonNullable<A2ATask["artifacts"]>[number] } };

function readApiId(value: unknown): EquipmentApiId | undefined {
  return value === "equipment-catalog" || value === "equipment-status" ? value : undefined;
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

function decisionTrace(recommendation: A2UIRecommendation) {
  const candidates = recommendation.candidates;
  return {
    kind: "a2ui.matcher.trace" as const,
    strategy: recommendation.strategy,
    score: recommendation.score,
    candidateCount: candidates?.length ?? 0,
    candidates,
    mapping: recommendation.mapping,
  };
}

function textFallbackTask({
  contextId,
  fallbackText,
  reason,
  recommendation,
}: {
  contextId?: string;
  fallbackText?: string;
  reason: string;
  recommendation?: A2UIRecommendation;
}) {
  const trace = recommendation ? traceArtifact(decisionTrace(recommendation)) : undefined;
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
    },
  });
}

function failedTask(contextId: string | undefined, error: unknown, taskId?: string) {
  const reason = error instanceof Error ? error.message : String(error);
  return task({
    id: taskId,
    contextId,
    state: "TASK_STATE_FAILED",
    text: "A2UI surface를 생성하지 못했습니다.",
    metadata: {
      a2uiTaskKind: "failed",
      reason,
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
  const data = readEquipmentData(renderData.data) ?? readEquipmentData(facts.data);
  const sampleDataPreview = renderData.sampleDataPreview ?? (facts.sampleDataPreview as A2ARenderRequestData["sampleDataPreview"]);
  const derivedSchema = renderData.derivedSchema ?? (facts.derivedSchema as A2ARenderRequestData["derivedSchema"]);
  const fallbackText = renderData.fallbackText || (typeof facts.fallbackText === "string" ? facts.fallbackText : undefined);
  const options = {
    includeTrace: renderData.a2uiOptions?.includeTrace ?? true,
    allowLegacyIntentFallback: renderData.a2uiOptions?.allowLegacyIntentFallback ?? true,
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
      });
      return taskId ? { ...fallback, id: taskId } : fallback;
    }

    if (!data) {
      const fallback = textFallbackTask({
        contextId,
        fallbackText,
        reason: "A2UI surface resolution requires agent-provided data in facts.data.",
        recommendation,
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
    const trace = decisionTrace(recommendation);
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
      },
    });
  } catch (error) {
    return failedTask(contextId, error, taskId);
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

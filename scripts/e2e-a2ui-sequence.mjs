const baseUrl = process.env.A2UI_E2E_BASE_URL || "http://localhost:3001";
const A2A_RENDER_REQUEST = "application/vnd.a2ui.render-request+json";
const A2A_SURFACE = "application/vnd.a2ui.surface+json";

function fail(message) {
  throw new Error(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

async function fetchJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store", ...init });
  if (!response.ok) fail(`${path} returned ${response.status}`);
  return response.json();
}

function rows(data, label) {
  expect(data && typeof data === "object", `${label} must return an object`);
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.result?.rows)) return data.result.rows;
  fail(`${label} must return items[] or result.rows[]`);
}

function rowCount(data) {
  if (typeof data?.total === "number") return data.total;
  if (typeof data?.result?.totalCount === "number") return data.result.totalCount;
  return rows(data, "row count data").length;
}

function intentKey(apiId) {
  return apiId === "equipment-catalog" ? "equipment.catalog.lookup" : "equipment.status.lookup";
}

function a2aPayload({ query, apiId, data }) {
  const id = `${apiId}-${Date.now()}`;
  return {
    configuration: {
      acceptedOutputModes: [A2A_SURFACE, "text/plain"],
      returnImmediately: false,
    },
    message: {
      messageId: `msg-sequence-${id}`,
      contextId: `ctx-sequence-${id}`,
      role: "ROLE_USER",
      parts: [
        { text: query },
        {
          mediaType: A2A_RENDER_REQUEST,
          data: {
            kind: "a2ui.render.request",
            query,
            intentKey: intentKey(apiId),
            apiId,
            facts: {
              apiId,
              data,
              fallbackText: `${query} fallback`,
              profile: { rowCount: rowCount(data) },
            },
            data,
            fallbackText: `${query} fallback`,
            a2uiOptions: {
              includeTrace: true,
              allowIntentFallback: true,
            },
          },
        },
      ],
    },
  };
}

function parseSseEvents(text) {
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const payload = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trimStart())
        .join("\n");
      expect(payload, `SSE block should include data: ${block}`);
      return JSON.parse(payload);
    });
}

async function callA2AStream({ query, apiId, data }) {
  const response = await fetch(`${baseUrl}/api/a2a/message:stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/a2a+json",
      "A2A-Version": "1.0",
    },
    body: JSON.stringify(a2aPayload({ query, apiId, data })),
  });
  if (!response.ok) fail(`/api/a2a/message:stream returned ${response.status}`);
  return parseSseEvents(await response.text());
}

function findPart(task, predicate) {
  for (const artifact of task.artifacts ?? []) {
    for (const part of artifact.parts ?? []) {
      if (predicate(part)) return part;
    }
  }
  return undefined;
}

function assertOrderedSubsequence({ actual, expected, label }) {
  let searchIndex = 0;
  for (const expectedItem of expected) {
    const foundIndex = actual.findIndex((item, index) => {
      if (index < searchIndex) return false;
      return Object.entries(expectedItem).every(([key, value]) => item[key] === value);
    });
    expect(foundIndex >= 0, `${label} sequence should include ${JSON.stringify(expectedItem)} after index ${searchIndex}; actual=${JSON.stringify(actual)}`);
    searchIndex = foundIndex + 1;
  }
}

function assertProgressSequence({ label, events, expectedTemplateId, expectedSourceArrayPath }) {
  const progress = events.map((event) => event.progressUpdate).filter(Boolean);
  const compact = progress.map((event) => ({
    status: event.status,
    label: event.label,
    mode: event.data?.mode,
    templateId: event.data?.templateId,
  }));

  assertOrderedSubsequence({
    label,
    actual: compact,
    expected: [
      { status: "profile", label: "A2UI 원천 미리보기 생성" },
      { status: "a2a", label: "A2UI 레지스트리" },
      { status: "registry_loaded", label: "A2UI 레지스트리" },
      { status: "matcher", label: "템플릿 판단 요청", mode: "template_selection" },
      { status: "matcher", label: "판단 결과 반환", mode: "template_selected", templateId: expectedTemplateId },
      { status: "matcher", label: "슬롯 생성 요청", mode: "slot_mapping", templateId: expectedTemplateId },
      { status: "matcher", label: "슬롯 생성 결과 반환", mode: "slot_mapping_ready", templateId: expectedTemplateId },
      { status: "plan_validation", label: "슬롯 검증", mode: "validated", templateId: expectedTemplateId },
      { status: "mapping_applied", label: "데이터 / 슬롯 맵핑", mode: "render_surface", templateId: expectedTemplateId },
    ],
  });

  const task = [...events].reverse().find((event) => event.task?.status?.state === "TASK_STATE_COMPLETED")?.task;
  expect(task, `${label} stream should finish with completed task`);
  const surfacePart = findPart(task, (part) => part.mediaType === A2A_SURFACE && part.data?.surface);
  const tracePart = findPart(task, (part) => part.data?.kind === "a2ui.ai_surface_plan.trace");
  const surface = surfacePart?.data?.surface;
  const decision = surfacePart?.data?.decision ?? {};
  const aiTrace = decision.aiSurfacePlanTrace ?? decision.sourceTool?.aiSurfacePlanTrace;

  expect(surface?.templateId === expectedTemplateId, `${label} should return ${expectedTemplateId}, got ${surface?.templateId}`);
  expect(surface?.meta?.trace?.includes("planner:template_selection"), `${label} surface trace should include planner:template_selection`);
  expect(surface?.meta?.trace?.includes("planner:slot_mapping"), `${label} surface trace should include planner:slot_mapping`);
  expect(tracePart?.data?.aiSurfacePlanTrace?.templateSelection?.selectedTemplateId === expectedTemplateId, `${label} trace artifact should include templateSelection`);
  expect(aiTrace?.templateSelection?.selectedTemplateId === expectedTemplateId, `${label} decision trace should include selected template`);
  expect(aiTrace?.slotMapping?.fieldMappings?.length > 0, `${label} decision trace should include slot mapping fieldMappings`);
  expect(aiTrace?.slotMapping?.slotMappings?.length > 0, `${label} decision trace should include slotMappings`);
  expect(aiTrace?.validation?.ok === true, `${label} slot plan validation should pass`);
  if (expectedSourceArrayPath) {
    expect(aiTrace?.sourceArrayPath === expectedSourceArrayPath, `${label} should extract rows from ${expectedSourceArrayPath}`);
  }

  const attemptStages = new Set((aiTrace?.plannerAttempts ?? []).map((attempt) => attempt.stage));
  if (attemptStages.size > 0) {
    expect(attemptStages.has("template_selection"), `${label} attempts should include template_selection`);
    expect(attemptStages.has("slot_mapping"), `${label} attempts should include slot_mapping`);
  }

  console.log(`[ok] ${label}: sequence=${compact.map((item) => item.label).join(" -> ")}`);
}

async function assertScenario({ label, query, apiId, data, expectedTemplateId, expectedSourceArrayPath }) {
  const events = await callA2AStream({ query, apiId, data });
  assertProgressSequence({ label, events, expectedTemplateId, expectedSourceArrayPath });
}

async function main() {
  console.log(`[info] A2UI sequence E2E base=${baseUrl}`);

  const status = await fetchJson("/api/equipment-status");
  const wide = await fetchJson("/api/equipment-status-wide-columns");
  const large = await fetchJson("/api/equipment-status-large-rows");

  await assertScenario({
    label: "status list sequence",
    query: "장비 상태 목록 보여줘",
    apiId: "equipment-status",
    data: status,
    expectedTemplateId: "equipment.statusBooleanList",
    expectedSourceArrayPath: "items",
  });

  await assertScenario({
    label: "wide columns sequence",
    query: "컬럼이 많은 장비 상태 목록 보여줘",
    apiId: "equipment-status-wide-columns",
    data: wide,
    expectedTemplateId: "equipment.telemetryStatusTable",
    expectedSourceArrayPath: "items",
  });

  await assertScenario({
    label: "large rows sequence",
    query: "데이터가 많은 장비 상태 목록 보여줘",
    apiId: "equipment-status-large-rows",
    data: large,
    expectedTemplateId: "equipment.telemetryStatusTable",
    expectedSourceArrayPath: "result.rows",
  });
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

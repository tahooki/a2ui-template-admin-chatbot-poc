const baseUrl = process.env.A2UI_E2E_BASE_URL || "http://localhost:3001";
const telemetryStatusTemplateId = "equipment.telemetryStatusTable";
const A2A_RENDER_REQUEST = "application/vnd.a2ui.render-request+json";
const A2A_SURFACE = "application/vnd.a2ui.surface+json";

function fail(message) {
  throw new Error(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

async function fetchJson(path, init) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    fail(`${path} returned ${response.status}`);
  }
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
  const fallbackText = `${query} fallback`;
  return {
    configuration: {
      acceptedOutputModes: [A2A_SURFACE, "text/plain"],
      returnImmediately: false,
    },
    message: {
      messageId: `msg-${id}`,
      contextId: `ctx-${id}`,
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
              fallbackText,
              profile: { rowCount: rowCount(data) },
            },
            data,
            fallbackText,
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

function findPart(task, predicate) {
  for (const artifact of task.artifacts ?? []) {
    for (const part of artifact.parts ?? []) {
      if (predicate(part)) return part;
    }
  }
  return undefined;
}

async function callA2A({ query, apiId, data }) {
  const body = await fetchJson("/api/a2a/message:send", {
    method: "POST",
    headers: {
      "Content-Type": "application/a2a+json",
      "A2A-Version": "1.0",
    },
    body: JSON.stringify(a2aPayload({ query, apiId, data })),
  });
  const task = body.task;
  expect(task?.status?.state === "TASK_STATE_COMPLETED", `${apiId} A2A task should complete`);
  return task;
}

async function assertTemplate({ label, query, apiId, data, expectedTemplateId, expectedSourceArrayPath }) {
  const task = await callA2A({ query, apiId, data });
  const surfacePart = findPart(task, (part) => part.mediaType === A2A_SURFACE && part.data?.surface);
  const tracePart = findPart(task, (part) => part.data?.kind === "a2ui.ai_surface_plan.trace");
  const surface = surfacePart?.data?.surface;
  const decision = surfacePart?.data?.decision ?? {};
  const aiSurfacePlanTrace = decision.aiSurfacePlanTrace ?? decision.sourceTool?.aiSurfacePlanTrace;

  expect(surface, `${label} should return an A2UI surface`);
  expect(surface.templateId === expectedTemplateId, `${label} should select ${expectedTemplateId}, got ${surface.templateId}`);
  expect(decision.strategy === "ai_surface_planner", `${label} should use ai_surface_planner strategy`);
  expect(tracePart?.data?.candidateCount > 0, `${label} should include AI planner candidate trace`);
  expect(aiSurfacePlanTrace?.validation?.ok === true, `${label} should include passing AI plan validation`);
  expect(surface.payload?.data?.items?.[0]?.name, `${label} planned surface payload should include canonical name`);
  expect(typeof surface.payload?.data?.items?.[0]?.isOnline === "boolean", `${label} planned surface payload should include boolean isOnline`);
  if (expectedSourceArrayPath) {
    expect(aiSurfacePlanTrace?.sourceArrayPath === expectedSourceArrayPath, `${label} should extract rows from ${expectedSourceArrayPath}`);
  }
  console.log(`[ok] ${label}: ${surface.templateId} score=${decision.score}`);
}

async function assertNoTemplate({ label, query, apiId, data, expectedSourceArrayPath }) {
  const task = await callA2A({ query, apiId, data });
  const surfacePart = findPart(task, (part) => part.mediaType === A2A_SURFACE && part.data?.surface);
  const tracePart = findPart(task, (part) => part.data?.kind === "a2ui.ai_surface_plan.trace");
  const aiSurfacePlanTrace = tracePart?.data?.aiSurfacePlanTrace;

  expect(!surfacePart, `${label} should not return an A2UI surface after common status template removal`);
  expect(task.metadata?.a2uiTaskKind === "text_fallback", `${label} should return text_fallback task`);
  expect(task.metadata?.reason === "맞는 A2UI 템플릿이 없습니다.", `${label} should explain no compatible template`);
  expect(tracePart?.data?.candidateCount > 0, `${label} should include rejected candidate trace`);
  expect(aiSurfacePlanTrace?.validation?.ok === false, `${label} should include failed AI plan validation`);
  if (expectedSourceArrayPath) {
    expect(aiSurfacePlanTrace?.sourceArrayPath === expectedSourceArrayPath, `${label} should extract rows from ${expectedSourceArrayPath}`);
  }
  console.log(`[ok] ${label}: no compatible template`);
}

async function main() {
  console.log(`[info] A2UI data boundary E2E base=${baseUrl}`);

  const status = await fetchJson("/api/equipment-status");
  const statusRows = rows(status, "status API");
  expect(statusRows.length > 0, "status API should return local default rows without equipment env");
  expect(String(statusRows[0].id).startsWith("eq-status-"), "status API should use default status fixture ids");
  console.log(`[ok] status API default rows=${statusRows.length}`);

  const catalogData = await fetchJson("/api/equipment-catalog");
  const catalogRows = rows(catalogData, "catalog API");
  expect(catalogRows.length > 0, "catalog API should return local default rows without equipment env");
  expect(String(catalogRows[0].id).startsWith("eq-catalog-"), "catalog API should use default catalog fixture ids");
  console.log(`[ok] catalog API default rows=${catalogRows.length}`);

  const wide = await fetchJson("/api/equipment-status-wide-columns");
  const wideRows = rows(wide, "wide columns API");
  expect(wideRows.length === 6, "wide columns API should return 6 rows");
  expect(Object.keys(wideRows[0]).length >= 120, "wide columns API should include many columns");
  expect(String(wideRows[0].assetId).startsWith("WIDE-"), "wide columns API should use non-canonical asset ids");
  expect(String(wideRows[0].assetDisplayName).includes("센서") || String(wideRows[0].assetDisplayName).includes("계측"), "wide columns API should use distinct sensor/telemetry names");
  expect(Object.hasOwn(wideRows[0], "operStateCd"), "wide columns API should expose non-canonical status codes");
  expect(Object.hasOwn(wideRows[0], "telemetry_000"), "wide columns API should expose telemetry_* extra columns");
  expect(wide.total === 6, "wide columns API should preserve total=6");
  console.log(`[ok] wide columns API rows=${wideRows.length} columns=${Object.keys(wideRows[0]).length}`);

  const large = await fetchJson("/api/equipment-status-large-rows");
  const largeRows = rows(large, "large rows API");
  expect(largeRows.length === 1000, "large rows API should return 1000 rows");
  expect(String(largeRows[0].eqp_id).startsWith("BULK-"), "large rows API should use non-canonical bulk ids");
  expect(String(largeRows[0].eqp_nm).includes("대량 검증"), "large rows API should use distinct bulk validation names");
  expect(Object.hasOwn(largeRows[0], "telemetry_000"), "large rows API should expose telemetry_* fields for telemetry template matching");
  expect(large.result?.totalCount === 1000, "large rows API should preserve result.totalCount=1000");
  console.log(`[ok] large rows API rows=${largeRows.length}`);

  await assertTemplate({
    label: "wide columns",
    query: "컬럼이 많은 장비 상태 목록 보여줘",
    apiId: "equipment-status-wide-columns",
    data: wide,
    expectedTemplateId: telemetryStatusTemplateId,
    expectedSourceArrayPath: "items",
  });
  await assertTemplate({
    label: "large rows",
    query: "데이터가 많은 장비 상태 목록 보여줘",
    apiId: "equipment-status-large-rows",
    data: large,
    expectedTemplateId: telemetryStatusTemplateId,
    expectedSourceArrayPath: "result.rows",
  });

  const aliasStatus = {
    items: [
      { eqpId: "ALIAS-001", eqpNm: "Alias CNC 1", opYn: "Y", runYn: "N", alrmCnt: 2, inspReqYn: "Y", lastDtm: "2026-06-20T09:00:00Z", site: "A동" },
      { eqpId: "ALIAS-002", eqpNm: "Alias CNC 2", opYn: "N", runYn: "Y", alrmCnt: 0, inspReqYn: "N", lastDtm: "2026-06-20T09:01:00Z", site: "B동" },
    ],
    total: 2,
    page: 1,
    pageSize: 2,
  };
  await assertNoTemplate({
    label: "raw alias status",
    query: "다른 컬럼명의 장비 상태 목록 보여줘",
    apiId: "equipment-status",
    data: aliasStatus,
    expectedSourceArrayPath: "items",
  });

  const nestedAliasStatus = {
    result: {
      rows: aliasStatus.items,
      total: aliasStatus.total,
      page: aliasStatus.page,
      pageSize: aliasStatus.pageSize,
    },
  };
  await assertNoTemplate({
    label: "nested alias status",
    query: "result rows 안에 있는 장비 상태 목록 보여줘",
    apiId: "equipment-status",
    data: nestedAliasStatus,
    expectedSourceArrayPath: "result.rows",
  });
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

const baseUrl = process.env.A2UI_E2E_BASE_URL || "http://localhost:3001";
const tableTemplateId = "matrix.table";
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
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.result?.rows)) return data.result.rows;
  if (Array.isArray(data.result?.payload?.body?.rows)) return data.result.payload.body.rows;
  fail(`${label} must return items[], result.rows[], or result.payload.body.rows[]`);
}

function rowCount(data) {
  if (typeof data?.total === "number") return data.total;
  if (typeof data?.result?.totalCount === "number") return data.result.totalCount;
  if (typeof data?.result?.payload?.body?.totalCount === "number") return data.result.payload.body.totalCount;
  return rows(data, "row count data").length;
}

function intentKey(apiId) {
  if (apiId === "equipment-catalog") return "equipment.catalog.lookup";
  if (apiId.startsWith("equipment-")) return "equipment.status.lookup";
  return `a2ui.fixture.${apiId}.lookup`;
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
  expect(surface.payload?.data?.items?.[0]?.title || surface.payload?.data?.items?.[0]?.name, `${label} planned surface payload should include a title/name field`);
  expect(Object.keys(surface.payload?.data?.items?.[0] ?? {}).length > 1, `${label} planned surface payload should include mapped display fields`);
  if (expectedSourceArrayPath) {
    expect(aiSurfacePlanTrace?.sourceArrayPath === expectedSourceArrayPath, `${label} should extract rows from ${expectedSourceArrayPath}`);
    expect(aiSurfacePlanTrace?.observedSource?.selectedDatasetPath === expectedSourceArrayPath, `${label} should observe dataset ${expectedSourceArrayPath}`);
  }
  console.log(`[ok] ${label}: ${surface.templateId} score=${decision.score}`);
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

  const workItems = await fetchJson("/api/a2ui-fixtures/work-items");
  const workRows = rows(workItems, "work items API");
  expect(workRows.length > 0, "work-items API should return rows");
  expect(Object.hasOwn(workRows[0], "progress"), "work-items API should expose progress");
  expect(Object.hasOwn(workRows[0], "priority"), "work-items API should expose priority");
  console.log(`[ok] work-items API rows=${workRows.length}`);

  const resources = await fetchJson("/api/a2ui-fixtures/resources");
  const resourceRows = rows(resources, "resources API");
  expect(resourceRows.length > 0, "resources API should return rows");
  expect(Object.hasOwn(resourceRows[0], "imageUrl"), "resources API should expose imageUrl");
  console.log(`[ok] resources API rows=${resourceRows.length}`);

  const statusChecks = await fetchJson("/api/a2ui-fixtures/status-checks");
  const statusCheckRows = rows(statusChecks, "status-checks API");
  expect(statusCheckRows.length > 0, "status-checks API should return rows");
  expect(Object.hasOwn(statusCheckRows[0], "isHealthy"), "status-checks API should expose boolean checks");
  console.log(`[ok] status-checks API rows=${statusCheckRows.length}`);

  const summary = await fetchJson("/api/a2ui-fixtures/summary");
  const summaryRows = rows(summary, "summary API");
  expect(summaryRows.length > 0, "summary API should return metric rows");
  expect(Object.hasOwn(summaryRows[0], "value"), "summary API should expose numeric values");
  console.log(`[ok] summary API rows=${summaryRows.length}`);

  const hierarchy = await fetchJson("/api/a2ui-fixtures/hierarchy");
  const hierarchyRows = rows(hierarchy, "hierarchy API");
  expect(hierarchyRows.length > 0, "hierarchy API should return rows");
  expect(Object.hasOwn(hierarchyRows[0], "children"), "hierarchy API should expose children");
  console.log(`[ok] hierarchy API rows=${hierarchyRows.length}`);

  await assertTemplate({
    label: "status list",
    query: "장비 상태 목록 보여줘",
    apiId: "equipment-status",
    data: status,
    expectedTemplateId: "matrix.statusMatrix",
    expectedSourceArrayPath: "items",
  });
  await assertTemplate({
    label: "wide columns",
    query: "컬럼이 많은 장비 상태 목록 보여줘",
    apiId: "equipment-status-wide-columns",
    data: wide,
    expectedTemplateId: tableTemplateId,
    expectedSourceArrayPath: "items",
  });
  await assertTemplate({
    label: "large rows",
    query: "데이터가 많은 장비 상태 목록 보여줘",
    apiId: "equipment-status-large-rows",
    data: large,
    expectedTemplateId: tableTemplateId,
    expectedSourceArrayPath: "result.rows",
  });

  await assertTemplate({
    label: "work items as list",
    query: "work-items API를 목록으로 보여줘",
    apiId: "work-items",
    data: workItems,
    expectedTemplateId: "collection.list",
    expectedSourceArrayPath: "items",
  });
  await assertTemplate({
    label: "work items as table",
    query: "work-items API를 표로 보여줘",
    apiId: "work-items",
    data: workItems,
    expectedTemplateId: "matrix.table",
    expectedSourceArrayPath: "items",
  });
  await assertTemplate({
    label: "work items as progress",
    query: "work-items API를 진행률로 보여줘",
    apiId: "work-items",
    data: workItems,
    expectedTemplateId: "metric.progressList",
    expectedSourceArrayPath: "items",
  });
  await assertTemplate({
    label: "work items as queue",
    query: "work-items API를 처리 큐처럼 보여줘",
    apiId: "work-items",
    data: workItems,
    expectedTemplateId: "process.queue",
    expectedSourceArrayPath: "items",
  });
  await assertTemplate({
    label: "work items as timeline",
    query: "work-items API를 최근 변경 순서로 보여줘",
    apiId: "work-items",
    data: workItems,
    expectedTemplateId: "time.timeline",
    expectedSourceArrayPath: "items",
  });
  await assertTemplate({
    label: "resources as cards",
    query: "resources API를 카드로 보여줘",
    apiId: "resources",
    data: resources,
    expectedTemplateId: "collection.cardGrid",
    expectedSourceArrayPath: "items",
  });
  await assertTemplate({
    label: "status checks as matrix",
    query: "status-checks API를 상태표로 보여줘",
    apiId: "status-checks",
    data: statusChecks,
    expectedTemplateId: "matrix.statusMatrix",
    expectedSourceArrayPath: "items",
  });
  await assertTemplate({
    label: "summary as stat cards",
    query: "summary API를 숫자 카드로 보여줘",
    apiId: "summary",
    data: summary,
    expectedTemplateId: "metric.statCards",
    expectedSourceArrayPath: "items",
  });
  await assertTemplate({
    label: "hierarchy as tree",
    query: "hierarchy API를 트리로 보여줘",
    apiId: "hierarchy",
    data: hierarchy,
    expectedTemplateId: "relation.tree",
    expectedSourceArrayPath: "items",
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
  await assertTemplate({
    label: "raw alias status",
    query: "다른 컬럼명의 장비 상태 목록 보여줘",
    apiId: "equipment-status",
    data: aliasStatus,
    expectedTemplateId: "matrix.statusMatrix",
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
  await assertTemplate({
    label: "nested alias status",
    query: "result rows 안에 있는 장비 상태 목록 보여줘",
    apiId: "equipment-status",
    data: nestedAliasStatus,
    expectedTemplateId: "matrix.statusMatrix",
    expectedSourceArrayPath: "result.rows",
  });

  const deepNestedAliasStatus = {
    result: {
      payload: {
        body: {
          rows: aliasStatus.items,
          totalCount: aliasStatus.total,
          pageNo: aliasStatus.page,
          rowsPerPage: aliasStatus.pageSize,
        },
      },
    },
  };
  await assertTemplate({
    label: "deep nested alias status",
    query: "payload body rows 안에 있는 장비 상태 목록 보여줘",
    apiId: "equipment-status",
    data: deepNestedAliasStatus,
    expectedTemplateId: "matrix.statusMatrix",
    expectedSourceArrayPath: "result.payload.body.rows",
  });
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

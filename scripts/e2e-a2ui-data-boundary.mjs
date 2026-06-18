const baseUrl = process.env.A2UI_E2E_BASE_URL || "http://localhost:3001";
const commonStatusTemplateId = "equipment.commonStatusTable";
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
  expect(data && typeof data === "object" && Array.isArray(data.items), `${label} must return items[]`);
  return data.items;
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
              profile: { rowCount: data.total ?? data.items?.length ?? 0 },
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

async function assertStatusTemplate({ label, query, apiId, data }) {
  const task = await callA2A({ query, apiId, data });
  const surfacePart = findPart(task, (part) => part.mediaType === A2A_SURFACE && part.data?.surface);
  const tracePart = findPart(task, (part) => part.data?.kind === "a2ui.matcher.trace");
  const surface = surfacePart?.data?.surface;
  const decision = surfacePart?.data?.decision ?? {};

  expect(surface, `${label} should return an A2UI surface`);
  expect(surface.templateId === commonStatusTemplateId, `${label} should select ${commonStatusTemplateId}, got ${surface.templateId}`);
  expect(decision.strategy === "derived_schema", `${label} should use derived_schema strategy`);
  expect(tracePart?.data?.candidateCount > 0, `${label} should include matcher trace candidates`);
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
  expect(String(wideRows[0].id).startsWith("wide-status-"), "wide columns API should use distinct wide-status ids");
  expect(String(wideRows[0].name).includes("센서") || String(wideRows[0].name).includes("계측"), "wide columns API should use distinct sensor/telemetry names");
  expect(Object.hasOwn(wideRows[0], "telemetry_000"), "wide columns API should expose telemetry_* extra columns");
  expect(wide.total === 6, "wide columns API should preserve total=6");
  console.log(`[ok] wide columns API rows=${wideRows.length} columns=${Object.keys(wideRows[0]).length}`);

  const large = await fetchJson("/api/equipment-status-large-rows");
  const largeRows = rows(large, "large rows API");
  expect(largeRows.length === 1000, "large rows API should return 1000 rows");
  expect(String(largeRows[0].id).startsWith("bulk-status-"), "large rows API should use distinct bulk-status ids");
  expect(String(largeRows[0].name).includes("대량 검증"), "large rows API should use distinct bulk validation names");
  expect(large.total === 1000, "large rows API should preserve total=1000");
  console.log(`[ok] large rows API rows=${largeRows.length}`);

  await assertStatusTemplate({
    label: "wide columns",
    query: "컬럼이 많은 장비 상태 목록 보여줘",
    apiId: "equipment-status-wide-columns",
    data: wide,
  });
  await assertStatusTemplate({
    label: "large rows",
    query: "데이터가 많은 장비 상태 목록 보여줘",
    apiId: "equipment-status-large-rows",
    data: large,
  });
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

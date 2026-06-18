const baseUrl = process.env.A2UI_E2E_BASE_URL || "http://localhost:3001";
const commonStatusTemplateId = "equipment.commonStatusTable";

function fail(message) {
  throw new Error(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

async function fetchJson(path, { optional = false } = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    if (optional) {
      console.warn(`[skip] ${path} returned ${response.status}`);
      return undefined;
    }
    fail(`${path} returned ${response.status}`);
  }
  return response.json();
}

function rows(data, label) {
  expect(data && typeof data === "object" && Array.isArray(data.items), `${label} must return items[]`);
  return data.items;
}

async function callMcpTool(name, args) {
  const response = await fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${name}-${Date.now()}`,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  expect(response.ok, `/api/mcp tools/call ${name} returned ${response.status}`);
  const body = await response.json();
  expect(!body.error, `/api/mcp tools/call ${name} returned JSON-RPC error`);
  const text = body.result?.content?.[0]?.text;
  expect(typeof text === "string", `/api/mcp tools/call ${name} returned no text content`);
  return JSON.parse(text);
}

async function assertStatusTemplate({ label, query, apiId, data }) {
  const recommendation = await callMcpTool("a2ui.recommendTemplate", {
    query,
    apiId,
    facts: { data, apiId },
    options: { includeTrace: true },
  });
  expect(recommendation.mode === "render_surface", `${label} should render a surface`);
  expect(recommendation.templateId === commonStatusTemplateId, `${label} should select ${commonStatusTemplateId}, got ${recommendation.templateId}`);
  expect(recommendation.derivedSchema?.rowCount === data.total, `${label} should keep derivedSchema rowCount`);
  console.log(`[ok] ${label}: ${recommendation.templateId} score=${recommendation.score}`);
}

async function main() {
  console.log(`[info] A2UI data boundary E2E base=${baseUrl}`);

  const mcp = await fetchJson("/api/mcp");
  const catalog = await callMcpTool("a2ui.listTemplates", {});
  const templateIds = catalog.templates?.map((template) => template.componentId) ?? [];
  expect(templateIds.includes(commonStatusTemplateId), `fixed template ${commonStatusTemplateId} must be registered`);
  console.log(`[ok] fixed A2UI template registered: ${commonStatusTemplateId}`);

  const recommendTool = mcp.tools?.find((tool) => tool.name === "a2ui.recommendTemplate");
  const enumValues = recommendTool?.inputSchema?.properties?.apiId?.enum ?? [];
  for (const apiId of ["equipment-status-wide-columns", "equipment-status-large-rows"]) {
    expect(enumValues.includes(apiId), `/api/mcp schema must include ${apiId}`);
  }
  console.log("[ok] MCP apiId enum includes large-data test APIs");

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

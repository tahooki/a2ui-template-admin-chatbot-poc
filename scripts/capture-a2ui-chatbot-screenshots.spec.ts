import { expect, test } from "@playwright/test";

const baseUrl = process.env.A2UI_CHATBOT_CAPTURE_URL ?? "http://localhost:3003";
const outputDir = process.env.A2UI_CHATBOT_CAPTURE_DIR ?? "artifacts/a2ui-chatbot-screenshots";

const scenarios = [
  { id: "collection-list", title: "목록", prompt: "work-items API를 목록으로 보여줘" },
  { id: "collection-card-grid", title: "카드 그리드", prompt: "resources API를 카드로 보여줘" },
  { id: "record-detail", title: "상세", prompt: "resources API를 상세로 보여줘" },
  { id: "matrix-table", title: "데이터 테이블", prompt: "work-items API를 테이블로 보여줘" },
  { id: "matrix-status-matrix", title: "상태 매트릭스", prompt: "status-checks API를 상태표로 보여줘" },
  { id: "metric-stat-cards", title: "지표 카드", prompt: "summary API를 숫자 카드로 보여줘" },
  { id: "metric-progress-list", title: "진행률 목록", prompt: "work-items API를 진행률로 보여줘" },
  { id: "time-timeline", title: "타임라인", prompt: "work-items API를 일정 타임라인으로 보여줘" },
  { id: "process-queue", title: "처리 대기열", prompt: "work-items API를 처리 큐처럼 보여줘" },
  { id: "relation-tree", title: "계층 트리", prompt: "hierarchy API를 트리로 보여줘" },
];

test.use({
  channel: "chrome",
  viewport: { width: 1440, height: 1100 },
});

test("capture chatbot-generated A2UI surfaces", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const [index, scenario] of scenarios.entries()) {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("즉시 처리")).toBeVisible();

    const chat = page.locator('aside[aria-label="A2UI chatbot"]');
    await expect(chat).toBeVisible();
    await chat.getByPlaceholder("보고 싶은 장비 정보를 입력하세요").fill(scenario.prompt);
    await chat.getByRole("button", { name: "Send" }).click();

    const surface = chat.locator('[data-latest-surface="true"]');
    await expect(surface).toBeVisible({ timeout: 45_000 });
    await expect(surface).toContainText(scenario.title);
    await expect(chat.getByText("Agent가 장비 데이터를 조회하거나 처리하지 못했습니다.")).toHaveCount(0);
    await expect(chat.getByText("Proxy Agent chat failed")).toHaveCount(0);

    const number = String(index + 1).padStart(2, "0");
    await page.screenshot({
      path: `${outputDir}/full-${number}-${scenario.id}.png`,
      fullPage: false,
    });
    await chat.screenshot({
      path: `${outputDir}/chat-${number}-${scenario.id}.png`,
    });
  }

  expect(errors).toEqual([]);
});

type FixtureVariant = "default" | "minimal" | "localized" | "ratio" | "flat" | "ambiguous";
type FixtureWrap = "none" | "items" | "resultRows" | "deep";

export type FixtureOptions = {
  page: number;
  pageSize: number;
  count?: number;
  variant: FixtureVariant;
  wrap: FixtureWrap;
  nulls: "none" | "some" | "many";
};

type FixtureRow = Record<string, unknown>;

const imagePaths = [
  "/images/a2ui-template-poc/cnc.svg",
  "/images/a2ui-template-poc/robot-arm.svg",
  "/images/a2ui-template-poc/pump.svg",
  "/images/a2ui-template-poc/inspection.svg",
];

function numberParam(url: URL, key: string, fallback: number) {
  const value = Number(url.searchParams.get(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function enumParam<T extends string>(url: URL, key: string, allowed: readonly T[], fallback: T): T {
  const value = url.searchParams.get(key);
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function fixtureOptionsFromRequest(request: Request): FixtureOptions {
  const url = new URL(request.url);
  return {
    page: numberParam(url, "page", 1),
    pageSize: Math.min(numberParam(url, "pageSize", 20), 1000),
    count: url.searchParams.has("count") ? Math.min(numberParam(url, "count", 20), 2000) : undefined,
    variant: enumParam(url, "variant", ["default", "minimal", "localized", "ratio", "flat", "ambiguous"] as const, "default"),
    wrap: enumParam(url, "wrap", ["none", "items", "resultRows", "deep"] as const, "items"),
    nulls: enumParam(url, "nulls", ["none", "some", "many"] as const, "none"),
  };
}

function pageRows<T>(rows: T[], options: FixtureOptions) {
  const start = (Math.max(1, options.page) - 1) * options.pageSize;
  return rows.slice(start, start + options.pageSize);
}

function withNulls(rows: FixtureRow[], options: FixtureOptions, keys: string[]) {
  if (options.nulls === "none") return rows;
  const interval = options.nulls === "many" ? 2 : 5;
  return rows.map((row, index) => {
    if (index % interval !== 0) return row;
    const next = { ...row };
    const key = keys[index % keys.length];
    if (key) next[key] = null;
    return next;
  });
}

export function wrapFixtureRows(rows: FixtureRow[], options: FixtureOptions) {
  const paged = pageRows(rows, options);
  if (options.wrap === "resultRows") {
    return {
      result: {
        rows: paged,
        totalCount: rows.length,
        pageNo: options.page,
        rowsPerPage: options.pageSize,
      },
      success: true,
    };
  }
  if (options.wrap === "deep") {
    return {
      result: {
        payload: {
          body: {
            rows: paged,
            totalCount: rows.length,
            pageNo: options.page,
            rowsPerPage: options.pageSize,
          },
        },
      },
      success: true,
    };
  }
  return {
    items: paged,
    total: rows.length,
    page: options.page,
    pageSize: options.pageSize,
  };
}

function cycle<T>(items: T[], index: number) {
  return items[index % items.length];
}

export function buildWorkItems(options: FixtureOptions): FixtureRow[] {
  const statuses = ["queued", "in_progress", "review", "blocked", "done"];
  const priorities = ["high", "medium", "low", "urgent"];
  const owners = ["김도윤", "Ari Kim", "Mina Park", "Jules Lee", "Noah Choi"];
  const lanes = ["Discovery", "Build", "QA", "Release"];
  const count = options.count ?? 18;
  const rows = Array.from({ length: count }, (_, index) => {
    const serial = String(index + 1).padStart(3, "0");
    const progress = Math.min(100, 12 + index * 5);
    const startDay = (index % 12) + 1;
    const durationDays = 2 + (index % 5);
    const endDay = Math.min(startDay + durationDays, 24);
    return {
      id: `work-${serial}`,
      title: `워크 아이템 ${serial}`,
      description: `${cycle(["검토", "준비", "배포", "운영"], index)} 단계의 공통 작업 항목입니다.`,
      status: cycle(statuses, index),
      progress: options.variant === "ratio" ? Number((progress / 100).toFixed(2)) : progress,
      priority: cycle(priorities, index),
      assignee: cycle(owners, index),
      lane: cycle(lanes, index),
      startAt: `2026-07-${String(startDay).padStart(2, "0")}T09:00:00Z`,
      endAt: `2026-07-${String(endDay).padStart(2, "0")}T18:00:00Z`,
      dueAt: `2026-07-${String(endDay).padStart(2, "0")}T18:00:00Z`,
      updatedAt: `2026-07-${String((index % 20) + 1).padStart(2, "0")}T09:${String((index * 7) % 60).padStart(2, "0")}:00Z`,
    };
  });
  return withNulls(rows, options, ["description", "assignee", "endAt"]);
}

export function buildResources(options: FixtureOptions): FixtureRow[] {
  const categories = ["템플릿", "문서", "미디어", "데이터셋"];
  const count = options.count ?? 12;
  const rows = Array.from({ length: count }, (_, index) => {
    const serial = String(index + 1).padStart(3, "0");
    return {
      id: `resource-${serial}`,
      title: `리소스 ${serial}`,
      imageUrl: imagePaths[index % imagePaths.length],
      description: `${cycle(categories, index)} 유형의 재사용 가능한 리소스입니다.`,
      category: cycle(categories, index),
      status: index % 4 === 0 ? "draft" : "available",
      score: 72 + (index % 24),
    };
  });
  return withNulls(rows, options, ["imageUrl", "description"]);
}

export function buildStatusChecks(options: FixtureOptions): FixtureRow[] {
  const count = options.count ?? 14;
  const rows = Array.from({ length: count }, (_, index) => {
    const serial = String(index + 1).padStart(3, "0");
    const row = {
      id: `check-${serial}`,
      title: `상태 체크 ${serial}`,
      category: cycle(["서비스", "데이터", "보안", "운영"], index),
      isEnabled: index % 7 !== 0,
      isHealthy: index % 5 !== 0,
      hasWarning: index % 4 === 0,
      isBlocked: index % 11 === 0,
      lastCheckedAt: `2026-07-02T08:${String((index * 3) % 60).padStart(2, "0")}:00Z`,
    };
    if (options.variant !== "localized") return row;
    return {
      id: row.id,
      명칭: row.title,
      분류: row.category,
      활성여부: row.isEnabled ? "Y" : "N",
      정상여부: row.isHealthy ? "OK" : "WARN",
      경고여부: row.hasWarning ? "Y" : "N",
      차단여부: row.isBlocked ? "Y" : "N",
      점검일시: row.lastCheckedAt,
    };
  });
  return withNulls(rows, options, ["category", "lastCheckedAt"]);
}

export function buildSummaryMetrics(options: FixtureOptions): FixtureRow[] {
  const rows = [
    { id: "metric-total", label: "전체 항목", value: 128, unit: "items", delta: 12, status: "good" },
    { id: "metric-completion", label: "완료율", value: 84, unit: "%", delta: 4.2, status: "good" },
    { id: "metric-risk", label: "위험 항목", value: 7, unit: "items", delta: -2, status: "warn" },
    { id: "metric-latency", label: "평균 지연", value: 1.8, unit: "days", delta: -0.4, status: "good" },
  ];
  return withNulls(rows, options, ["delta", "status"]);
}

function nestedHierarchyRows(): FixtureRow[] {
  return [
    {
      id: "node-product",
      title: "제품 영역",
      status: "active",
      count: 18,
      children: [
        { id: "node-product-a", title: "온보딩", status: "active", count: 7 },
        { id: "node-product-b", title: "리텐션", status: "review", count: 11 },
      ],
    },
    {
      id: "node-platform",
      title: "플랫폼 영역",
      status: "active",
      count: 24,
      children: [
        { id: "node-platform-a", title: "API", status: "active", count: 12 },
        { id: "node-platform-b", title: "데이터", status: "blocked", count: 6 },
        { id: "node-platform-c", title: "관측성", status: "review", count: 6 },
      ],
    },
  ];
}

function flatHierarchyRows(): FixtureRow[] {
  return [
    { id: "node-product", parentId: null, title: "제품 영역", status: "active", count: 18 },
    { id: "node-product-a", parentId: "node-product", title: "온보딩", status: "active", count: 7 },
    { id: "node-product-b", parentId: "node-product", title: "리텐션", status: "review", count: 11 },
    { id: "node-platform", parentId: null, title: "플랫폼 영역", status: "active", count: 24 },
    { id: "node-platform-a", parentId: "node-platform", title: "API", status: "active", count: 12 },
    { id: "node-platform-b", parentId: "node-platform", title: "데이터", status: "blocked", count: 6 },
    { id: "node-platform-c", parentId: "node-platform", title: "관측성", status: "review", count: 6 },
  ];
}

export function buildHierarchy(options: FixtureOptions): FixtureRow[] {
  return options.variant === "flat" ? flatHierarchyRows() : nestedHierarchyRows();
}

export function fixtureResponse(kind: "work-items" | "resources" | "status-checks" | "summary" | "hierarchy", request: Request) {
  const options = fixtureOptionsFromRequest(request);
  const builders = {
    "work-items": buildWorkItems,
    resources: buildResources,
    "status-checks": buildStatusChecks,
    summary: buildSummaryMetrics,
    hierarchy: buildHierarchy,
  } satisfies Record<typeof kind, (options: FixtureOptions) => FixtureRow[]>;
  return Response.json(wrapFixtureRows(builders[kind](options), options));
}

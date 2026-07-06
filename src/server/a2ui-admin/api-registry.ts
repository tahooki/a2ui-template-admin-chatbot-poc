export const a2uiApiIds = [
  "equipment-catalog",
  "equipment-status",
  "equipment-status-wide-columns",
  "equipment-status-large-rows",
  "work-items",
  "resources",
  "status-checks",
  "summary",
  "hierarchy",
] as const;

export type A2UIApiId = (typeof a2uiApiIds)[number];

export type A2UIApiDefinition = {
  id: A2UIApiId;
  title: string;
  endpoint: string;
  aliases: string[];
  description: string;
  preferredSurfaces: string[];
  sourceIntent: string;
};

export type PresentationIntent = {
  requestedSurfaces: string[];
  confidence: number;
  sourcePhrase?: string;
};

export const a2uiApiDefinitions: A2UIApiDefinition[] = [
  {
    id: "equipment-catalog",
    title: "장비 카탈로그 API",
    endpoint: "/api/equipment-catalog",
    aliases: ["equipment-catalog", "장비목록", "장비리스트", "장비", "설비", "카탈로그", "이미지"],
    description: "이미지와 설명이 있는 legacy 장비 카탈로그 데이터",
    preferredSurfaces: ["collection.cardGrid", "collection.list", "matrix.table"],
    sourceIntent: "equipment.catalog.lookup",
  },
  {
    id: "equipment-status",
    title: "장비 상태 API",
    endpoint: "/api/equipment-status",
    aliases: ["equipment-status", "장비상태", "상태목록", "설비상태"],
    description: "boolean status field가 많은 legacy 장비 상태 데이터",
    preferredSurfaces: ["matrix.statusMatrix", "matrix.table", "collection.list"],
    sourceIntent: "equipment.status.lookup",
  },
  {
    id: "equipment-status-wide-columns",
    title: "컬럼 많은 장비 상태 API",
    endpoint: "/api/equipment-status-wide-columns",
    aliases: ["equipment-status-wide-columns", "wide columns", "컬럼많은상태", "계측상태"],
    description: "컬럼이 많은 legacy 장비 상태 boundary 데이터",
    preferredSurfaces: ["matrix.table", "matrix.statusMatrix"],
    sourceIntent: "equipment.status.lookup",
  },
  {
    id: "equipment-status-large-rows",
    title: "데이터 많은 장비 상태 API",
    endpoint: "/api/equipment-status-large-rows",
    aliases: ["equipment-status-large-rows", "large rows", "대량상태", "데이터많은상태"],
    description: "row가 많은 legacy 장비 상태 boundary 데이터",
    preferredSurfaces: ["matrix.table", "matrix.statusMatrix"],
    sourceIntent: "equipment.status.lookup",
  },
  {
    id: "work-items",
    title: "Work Items API",
    endpoint: "/api/a2ui-fixtures/work-items",
    aliases: ["work-items", "workitems", "작업", "작업목록", "태스크", "task", "tasks", "queue", "큐"],
    description: "상태, 진행률, 우선순위, 담당자, 마감일이 섞인 작업 목록",
    preferredSurfaces: ["collection.list", "metric.progressList", "process.queue", "matrix.table", "time.timeline"],
    sourceIntent: "a2ui.fixture.work-items.lookup",
  },
  {
    id: "resources",
    title: "Resources API",
    endpoint: "/api/a2ui-fixtures/resources",
    aliases: ["resources", "resource", "리소스", "리소스목록", "갤러리", "카드소스"],
    description: "이미지, 제목, 설명, 카테고리가 있는 리소스 목록",
    preferredSurfaces: ["collection.cardGrid", "collection.list", "matrix.table", "record.detail"],
    sourceIntent: "a2ui.fixture.resources.lookup",
  },
  {
    id: "status-checks",
    title: "Status Checks API",
    endpoint: "/api/a2ui-fixtures/status-checks",
    aliases: ["status-checks", "statuschecks", "상태체크", "체크", "점검", "상태표"],
    description: "여러 boolean/status flag를 가진 점검표 데이터",
    preferredSurfaces: ["matrix.statusMatrix", "matrix.table", "collection.list"],
    sourceIntent: "a2ui.fixture.status-checks.lookup",
  },
  {
    id: "summary",
    title: "Summary API",
    endpoint: "/api/a2ui-fixtures/summary",
    aliases: ["summary", "요약", "지표", "kpi", "통계", "metrics", "metric"],
    description: "핵심 숫자와 변화량을 가진 요약 지표 데이터",
    preferredSurfaces: ["metric.statCards", "record.detail", "matrix.table"],
    sourceIntent: "a2ui.fixture.summary.lookup",
  },
  {
    id: "hierarchy",
    title: "Hierarchy API",
    endpoint: "/api/a2ui-fixtures/hierarchy",
    aliases: ["hierarchy", "계층", "트리", "tree", "구조", "상하위"],
    description: "children 또는 parentId를 가진 계층 데이터",
    preferredSurfaces: ["relation.tree", "collection.list", "matrix.table", "record.detail"],
    sourceIntent: "a2ui.fixture.hierarchy.lookup",
  },
];

function normalizeMatchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "");
}

function includesPhrase(query: string, phrase: string) {
  return normalizeMatchText(query).includes(normalizeMatchText(phrase));
}

export function isA2UIApiId(value: unknown): value is A2UIApiId {
  return typeof value === "string" && (a2uiApiIds as readonly string[]).includes(value);
}

export function a2uiApiDefinition(apiId: A2UIApiId) {
  return a2uiApiDefinitions.find((definition) => definition.id === apiId) ?? a2uiApiDefinitions[0];
}

export function a2uiApiTitle(apiId: A2UIApiId) {
  return a2uiApiDefinition(apiId).title;
}

export function sourceIntentForApi(apiId: A2UIApiId) {
  return a2uiApiDefinition(apiId).sourceIntent;
}

export function chooseA2UIApiForPrompt(prompt: string): A2UIApiId {
  const normalized = normalizeMatchText(prompt);
  const scored = a2uiApiDefinitions
    .map((definition) => {
      const score = definition.aliases.reduce((total, alias) => total + (normalized.includes(normalizeMatchText(alias)) ? 1 : 0), 0);
      return { definition, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.definition.aliases[0].length - a.definition.aliases[0].length);

  if (scored[0]) return scored[0].definition.id;
  if (
    normalized.includes("장비목록") ||
    normalized.includes("장비리스트") ||
    normalized.includes("설비") ||
    normalized.includes("카탈로그") ||
    normalized.includes("이미지") ||
    normalized.includes("사진")
  ) {
    return "equipment-catalog";
  }
  return "equipment-status";
}

const presentationPatterns: Array<{ surface: string; confidence: number; phrases: string[] }> = [
  { surface: "matrix.table", confidence: 0.95, phrases: ["표로", "테이블로", "표 형태", "테이블 형태", "비교표", "table"] },
  { surface: "collection.cardGrid", confidence: 0.95, phrases: ["카드로", "카드 형태", "그리드로", "갤러리로", "썸네일로"] },
  { surface: "metric.progressList", confidence: 0.96, phrases: ["진행률로", "완료율로", "퍼센트로", "progress", "progress bar"] },
  { surface: "process.queue", confidence: 0.96, phrases: ["처리 큐", "큐처럼", "대기열", "처리순서", "우선순위로"] },
  { surface: "time.timeline", confidence: 0.94, phrases: ["타임라인", "일정", "스케줄", "기간", "로드맵", "timeline", "gantt"] },
  { surface: "relation.tree", confidence: 0.97, phrases: ["트리로", "계층으로", "구조로", "상하위", "tree"] },
  { surface: "matrix.statusMatrix", confidence: 0.95, phrases: ["상태표로", "상태 매트릭스", "체크표", "체크 리스트", "on/off", "불리언"] },
  { surface: "metric.statCards", confidence: 0.95, phrases: ["숫자 카드", "지표 카드", "kpi 카드", "통계 카드", "요약 카드"] },
  { surface: "record.detail", confidence: 0.92, phrases: ["상세로", "자세히", "상세 보기", "프로필로"] },
  { surface: "collection.list", confidence: 0.9, phrases: ["리스트로", "목록으로", "간단 목록", "간단히"] },
];

export function presentationIntentForQuery(query: string): PresentationIntent {
  const matches = presentationPatterns
    .flatMap((pattern) =>
      pattern.phrases
        .filter((phrase) => includesPhrase(query, phrase))
        .map((phrase) => ({ surface: pattern.surface, confidence: pattern.confidence, phrase })),
    )
    .sort((a, b) => b.confidence - a.confidence || b.phrase.length - a.phrase.length);

  return {
    requestedSurfaces: Array.from(new Set(matches.map((match) => match.surface))),
    confidence: matches[0]?.confidence ?? 0,
    sourcePhrase: matches[0]?.phrase,
  };
}

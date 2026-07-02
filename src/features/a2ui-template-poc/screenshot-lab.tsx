"use client";

import { useEffect, useMemo, useState } from "react";
import { A2UIDemoRenderer } from "./a2ui-demo-renderer";
import styles from "./styles.module.css";
import type { A2UIDataProfile, A2UIRenderPlan, A2UIViewType, EquipmentApiResponse, FieldMapping, FieldProfile } from "./template-types";

type DataRow = Record<string, unknown>;

type ScreenshotCase = {
  id: string;
  index: number;
  title: string;
  templateId: string;
  viewType: A2UIViewType;
  apiRoute: string;
  query: string;
  fieldMapping: FieldMapping;
  maxItems: number;
};

type LoadedCase = {
  data?: EquipmentApiResponse<unknown>;
  error?: string;
};

const screenshotCases: ScreenshotCase[] = [
  {
    id: "collection-list",
    index: 1,
    title: "목록",
    templateId: "collection.list",
    viewType: "collection.list",
    apiRoute: "/api/a2ui-fixtures/work-items?pageSize=8",
    query: "work-items API를 목록으로 보여줘",
    fieldMapping: {
      title: "items[].title",
      content: "items[].description",
      category: "items[].priority",
      status: "items[].status",
      updatedAt: "items[].updatedAt",
    },
    maxItems: 6,
  },
  {
    id: "collection-card-grid",
    index: 2,
    title: "카드 그리드",
    templateId: "collection.cardGrid",
    viewType: "collection.cardGrid",
    apiRoute: "/api/a2ui-fixtures/resources?pageSize=6",
    query: "resources API를 카드로 보여줘",
    fieldMapping: {
      title: "items[].title",
      content: "items[].description",
      image: "items[].imageUrl",
      category: "items[].category",
      status: "items[].status",
    },
    maxItems: 6,
  },
  {
    id: "record-detail",
    index: 3,
    title: "상세",
    templateId: "record.detail",
    viewType: "record.detail",
    apiRoute: "/api/a2ui-fixtures/resources?pageSize=1",
    query: "resources API 첫 항목을 상세로 보여줘",
    fieldMapping: {
      title: "items[].title",
      content: "items[].description",
      status: "items[].status",
      category: "items[].category",
      fields: ["items[].id", "items[].category", "items[].status", "items[].score"],
    },
    maxItems: 1,
  },
  {
    id: "matrix-table",
    index: 4,
    title: "데이터 테이블",
    templateId: "matrix.table",
    viewType: "matrix.table",
    apiRoute: "/api/a2ui-fixtures/work-items?pageSize=8",
    query: "work-items API를 테이블로 보여줘",
    fieldMapping: {
      title: "items[].title",
      fields: ["items[].id", "items[].status", "items[].priority", "items[].assignee", "items[].dueAt", "items[].progress"],
      status: "items[].status",
      updatedAt: "items[].updatedAt",
    },
    maxItems: 6,
  },
  {
    id: "matrix-status-matrix",
    index: 5,
    title: "상태 매트릭스",
    templateId: "matrix.statusMatrix",
    viewType: "matrix.statusMatrix",
    apiRoute: "/api/a2ui-fixtures/status-checks?pageSize=8",
    query: "status-checks API를 상태표로 보여줘",
    fieldMapping: {
      title: "items[].title",
      category: "items[].category",
      booleanFlags: ["items[].isEnabled", "items[].isHealthy", "items[].hasWarning", "items[].isBlocked"],
      updatedAt: "items[].lastCheckedAt",
    },
    maxItems: 6,
  },
  {
    id: "metric-stat-cards",
    index: 6,
    title: "지표 카드",
    templateId: "metric.statCards",
    viewType: "metric.statCards",
    apiRoute: "/api/a2ui-fixtures/summary?pageSize=4",
    query: "summary API를 숫자 카드로 보여줘",
    fieldMapping: {
      title: "items[].label",
      value: "items[].value",
      delta: "items[].delta",
      unit: "items[].unit",
      status: "items[].status",
    },
    maxItems: 4,
  },
  {
    id: "metric-progress-list",
    index: 7,
    title: "진행률 목록",
    templateId: "metric.progressList",
    viewType: "metric.progressList",
    apiRoute: "/api/a2ui-fixtures/work-items?pageSize=8",
    query: "work-items API를 진행률로 보여줘",
    fieldMapping: {
      title: "items[].title",
      content: "items[].description",
      progress: "items[].progress",
      status: "items[].status",
      updatedAt: "items[].updatedAt",
    },
    maxItems: 6,
  },
  {
    id: "time-timeline",
    index: 8,
    title: "타임라인",
    templateId: "time.timeline",
    viewType: "time.timeline",
    apiRoute: "/api/a2ui-fixtures/work-items?pageSize=8",
    query: "work-items API를 타임라인으로 보여줘",
    fieldMapping: {
      title: "items[].title",
      content: "items[].description",
      time: "items[].updatedAt",
      assignee: "items[].assignee",
      status: "items[].status",
    },
    maxItems: 6,
  },
  {
    id: "process-queue",
    index: 9,
    title: "처리 대기열",
    templateId: "process.queue",
    viewType: "process.queue",
    apiRoute: "/api/a2ui-fixtures/work-items?pageSize=8",
    query: "work-items API를 처리 큐처럼 보여줘",
    fieldMapping: {
      title: "items[].title",
      content: "items[].description",
      status: "items[].status",
      priority: "items[].priority",
      assignee: "items[].assignee",
      dueAt: "items[].dueAt",
    },
    maxItems: 6,
  },
  {
    id: "relation-tree",
    index: 10,
    title: "계층 트리",
    templateId: "relation.tree",
    viewType: "relation.tree",
    apiRoute: "/api/a2ui-fixtures/hierarchy?pageSize=10",
    query: "hierarchy API를 트리로 보여줘",
    fieldMapping: {
      title: "items[].title",
      content: "items[].description",
      status: "items[].status",
      children: "items[].children",
      parentId: "items[].parentId",
    },
    maxItems: 10,
  },
];

function record(value: unknown): DataRow | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DataRow) : undefined;
}

function rowsFromData(data: unknown): DataRow[] {
  if (Array.isArray(data)) return data.filter((item): item is DataRow => Boolean(record(item)));
  const root = record(data);
  const result = record(root?.result);
  const deep = record(record(result?.payload)?.body);
  const rows = Array.isArray(root?.items)
    ? root.items
    : Array.isArray(root?.rows)
      ? root.rows
      : Array.isArray(result?.rows)
        ? result.rows
        : Array.isArray(deep?.rows)
          ? deep.rows
          : root
            ? [root]
            : [];
  return rows.filter((item): item is DataRow => Boolean(record(item)));
}

function rowTotal(data: unknown, rows: DataRow[]) {
  const root = record(data);
  const result = record(root?.result);
  const deep = record(record(result?.payload)?.body);
  const total = root?.total ?? root?.totalCount ?? result?.total ?? result?.totalCount ?? deep?.total ?? deep?.totalCount;
  return typeof total === "number" ? total : rows.length;
}

function fieldType(key: string, examples: unknown[]): FieldProfile["type"] {
  const first = examples.find((item) => item !== null && item !== undefined);
  if (typeof first === "boolean") return "boolean";
  if (typeof first === "number") return "number";
  if (typeof first !== "string") return "unknown";
  if (/image|photo|thumbnail/i.test(key) || /\.(png|jpe?g|webp|gif|svg)$/i.test(first)) return "image-url";
  if (/^\d{4}-\d{2}-\d{2}/.test(first)) return "date";
  return "string";
}

function rolesForField(key: string, type: FieldProfile["type"]) {
  const roles: FieldProfile["roleCandidates"] = [];
  if (key === "id" || key.endsWith("Id")) roles.push("id");
  if (/title|name|label/i.test(key)) roles.push("title");
  if (/description|content|summary/i.test(key)) roles.push("content", "description");
  if (type === "image-url" || /image|photo|thumbnail/i.test(key)) roles.push("image");
  if (type === "boolean") roles.push("booleanFlag", "status");
  if (/status|state|phase/i.test(key)) roles.push("status");
  if (/category|type/i.test(key)) roles.push("category");
  if (/progress|percent|ratio/i.test(key)) roles.push("progress", "metric");
  if (/priority|severity|urgency/i.test(key)) roles.push("priority");
  if (/assignee|owner|actor/i.test(key)) roles.push("assignee", "actor");
  if (/dueAt|deadline|targetDate/i.test(key)) roles.push("dueAt", "time");
  if (/updatedAt|checkedAt|time|date/i.test(key)) roles.push("updatedAt", "time");
  if (/children|nodes/i.test(key)) roles.push("children");
  if (/delta|change/i.test(key)) roles.push("delta");
  if (/unit|uom/i.test(key)) roles.push("unit");
  if (type === "number") roles.push("metric");
  return Array.from(new Set(roles));
}

function profileFromData(data: EquipmentApiResponse<unknown>): A2UIDataProfile {
  const rows = rowsFromData(data);
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).sort();
  const fields = keys.map((key) => {
    const examples = rows.slice(0, 5).map((row) => row[key]);
    const type = fieldType(key, examples);
    return {
      path: `items[].${key}`,
      key,
      type,
      roleCandidates: rolesForField(key, type),
      examples,
    };
  });
  return {
    shape: rows.length ? "array<object>" : "object",
    rowCount: rowTotal(data, rows),
    listPath: rows.length ? "items" : undefined,
    fields,
    booleanFieldCount: fields.filter((field) => field.type === "boolean").length,
    hasImageField: fields.some((field) => field.type === "image-url"),
    hasContentField: fields.some((field) => field.roleCandidates.includes("content")),
    hasDescriptionField: fields.some((field) => field.roleCandidates.includes("description")),
  };
}

function renderPlanFor(item: ScreenshotCase): A2UIRenderPlan {
  return {
    selectedComponentId: item.templateId,
    viewType: item.viewType,
    score: 1,
    reason: item.query,
    fieldMapping: item.fieldMapping,
    isFallback: false,
    registryVersion: 1,
    maxItems: item.maxItems,
    strategy: "template_schema_spec",
  };
}

export function A2UITemplateScreenshotLab({ shotId = null }: { shotId?: string | null }) {
  const [loaded, setLoaded] = useState<Record<string, LoadedCase>>({});
  const visibleCases = useMemo(
    () => (shotId ? screenshotCases.filter((item) => item.id === shotId) : screenshotCases),
    [shotId],
  );

  useEffect(() => {
    let active = true;

    async function load() {
      const entries = await Promise.all(
        visibleCases.map(async (item) => {
          try {
            const response = await fetch(item.apiRoute, { cache: "no-store" });
            if (!response.ok) throw new Error(`${item.apiRoute} failed with ${response.status}`);
            const data = (await response.json()) as EquipmentApiResponse<unknown>;
            if (!rowsFromData(data).length) throw new Error(`${item.apiRoute} returned no rows`);
            return [item.id, { data }] as const;
          } catch (error) {
            return [item.id, { error: error instanceof Error ? error.message : "API load failed" }] as const;
          }
        }),
      );
      if (active) setLoaded(Object.fromEntries(entries));
    }

    void load();

    return () => {
      active = false;
    };
  }, [shotId, visibleCases]);

  const readyCount = visibleCases.filter((item) => loaded[item.id]?.data).length;
  const errors = visibleCases.filter((item) => loaded[item.id]?.error);
  const isReady = visibleCases.length > 0 && readyCount === visibleCases.length && errors.length === 0;
  const metaText = useMemo(() => `${readyCount}/${visibleCases.length} API loaded`, [readyCount, visibleCases.length]);

  return (
    <main
      className={styles.screenshotLabShell}
      data-error-count={errors.length}
      data-screenshot-ready={isReady ? "true" : "false"}
      data-shot-count={visibleCases.length}
    >
      <header className={styles.screenshotLabTop}>
        <div>
          <p className={styles.eyebrow}>A2UI QA Capture</p>
          <h1>Template Screenshot Lab</h1>
        </div>
        <div className={styles.screenshotLabMeta}>
          <span>{metaText}</span>
          <span>flow delay off</span>
          <span>{errors.length ? `${errors.length} errors` : "0 errors"}</span>
        </div>
      </header>

      <section className={styles.screenshotLabGrid} aria-label="A2UI template screenshot targets">
        {visibleCases.map((item) => {
          const state = loaded[item.id];
          const data = state?.data;
          return (
            <article
              className={styles.screenshotShot}
              data-shot-id={item.id}
              data-template-id={item.templateId}
              data-status={state?.error ? "error" : data ? "ready" : "loading"}
              key={item.id}
            >
              <div className={styles.screenshotShotHeader}>
                <div>
                  <span>{String(item.index).padStart(2, "0")} / {item.templateId}</span>
                  <h2>{item.title}</h2>
                </div>
                <strong>{data ? "API OK" : state?.error ? "ERROR" : "LOADING"}</strong>
              </div>
              <div className={styles.screenshotShotMeta}>
                <span>{item.apiRoute}</span>
                <span>{item.query}</span>
              </div>
              {state?.error ? <p className={styles.screenshotError}>{state.error}</p> : null}
              {data ? (
                <A2UIDemoRenderer
                  data={data}
                  profile={profileFromData(data)}
                  renderPlan={renderPlanFor(item)}
                />
              ) : null}
            </article>
          );
        })}
      </section>
    </main>
  );
}

/* eslint-disable @next/next/no-img-element */
import styles from "./a2ui-chat-kit.module.css";
import type { CSSProperties } from "react";
import type { A2UIDataProfile, A2UIRenderPlan } from "./contracts";

type DataRow = Record<string, unknown>;

const hiddenKeys = new Set(["id", "title", "name", "label", "description", "content", "summary", "image", "imageUrl", "thumbnailUrl"]);

function keyFromPath(path?: string) {
  return path?.replace(/\[\]/g, "").split(".").filter(Boolean).pop() ?? "";
}

function rowsFromData(data: unknown): DataRow[] {
  if (Array.isArray(data)) return data.filter((item): item is DataRow => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  if (!data || typeof data !== "object") return [];
  const record = data as DataRow;
  if (Array.isArray(record.items)) {
    return record.items.filter((item): item is DataRow => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }
  return [record];
}

function value(row: DataRow, path?: string) {
  if (!path) return undefined;
  const key = keyFromPath(path);
  return row[key];
}

function displayValue(raw: unknown) {
  if (raw === null || raw === undefined || raw === "") return "-";
  if (typeof raw === "boolean") return raw ? "ON" : "OFF";
  if (typeof raw === "number") return raw.toLocaleString();
  if (Array.isArray(raw)) return `${raw.length} items`;
  if (typeof raw === "object") return "object";
  return String(raw);
}

function textValue(row: DataRow, path?: string) {
  const fieldValue = value(row, path);
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : "";
}

function titleValue(row: DataRow, renderPlan: A2UIRenderPlan) {
  const mapped = value(row, renderPlan.fieldMapping.title);
  return String(mapped ?? row.title ?? row.name ?? row.label ?? row.id ?? "Untitled");
}

function surfaceTitle(viewType: string) {
  const titles: Record<string, string> = {
    "collection.list": "목록",
    "collection.cardGrid": "카드 그리드",
    "record.detail": "상세",
    "matrix.table": "데이터 테이블",
    "matrix.statusMatrix": "상태 매트릭스",
    "metric.statCards": "지표 카드",
    "metric.progressList": "진행률 목록",
    "time.timeline": "타임라인",
    "process.queue": "처리 대기열",
    "relation.tree": "계층 트리",
    simpleTextList: "목록",
    imageCardList: "카드 그리드",
    statusBooleanList: "상태 매트릭스",
    telemetryStatusTable: "데이터 테이블",
  };
  return titles[viewType] ?? "A2UI Surface";
}

function surfaceClass(viewType: string) {
  return styles[`surface_${viewType.replace(/[^a-zA-Z0-9_-]/g, "_")}`] ?? "";
}

function labelFromPath(path?: string) {
  const key = keyFromPath(path);
  if (!key) return "Field";
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferredFieldPaths(rows: DataRow[], renderPlan: A2UIRenderPlan, limit = 6) {
  const first = rows[0] ?? {};
  const explicit = renderPlan.fieldMapping.fields?.filter(Boolean) ?? [];
  if (explicit.length) return explicit.slice(0, limit);
  const blocked = new Set([
    keyFromPath(renderPlan.fieldMapping.title),
    keyFromPath(renderPlan.fieldMapping.content),
    keyFromPath(renderPlan.fieldMapping.image),
    keyFromPath(renderPlan.fieldMapping.progress),
  ]);
  return Object.keys(first)
    .filter((key) => !hiddenKeys.has(key) && !blocked.has(key))
    .slice(0, limit)
    .map((key) => `items[].${key}`);
}

function statusTone(raw: unknown) {
  const text = String(raw ?? "").toLowerCase();
  if (raw === true || /done|complete|success|ok|active|open|running|online|정상|완료/.test(text)) return styles.flagOn;
  if (/blocked|fail|error|risk|late|overdue|alarm|critical|지연|위험|실패/.test(text)) return styles.flagBad;
  return styles.flagOff;
}

function normalizedProgress(raw: unknown) {
  const number = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseFloat(raw.replace("%", "")) : NaN;
  if (!Number.isFinite(number)) return undefined;
  const percent = number <= 1 ? number * 100 : number;
  return Math.max(0, Math.min(100, percent));
}

function dateTimeValue(raw: unknown) {
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function shortDate(raw: unknown) {
  const time = dateTimeValue(raw);
  if (time === undefined) return displayValue(raw);
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(time));
}

function timelineItems(rows: DataRow[], renderPlan: A2UIRenderPlan) {
  return rows
    .map((row, index) => {
      const startRaw = value(row, renderPlan.fieldMapping.startAt) ?? value(row, renderPlan.fieldMapping.time);
      const endRaw = value(row, renderPlan.fieldMapping.endAt) ?? value(row, renderPlan.fieldMapping.dueAt) ?? startRaw;
      const start = dateTimeValue(startRaw);
      const end = dateTimeValue(endRaw) ?? start;
      if (start === undefined || end === undefined) return null;
      return {
        row,
        index,
        start,
        end: Math.max(end, start),
        startRaw,
        endRaw,
        lane: value(row, renderPlan.fieldMapping.lane) ?? value(row, renderPlan.fieldMapping.category),
        status: value(row, renderPlan.fieldMapping.status),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function rowKey(row: DataRow, index: number) {
  return String(row.id ?? row.key ?? row.title ?? row.name ?? index);
}

function metricPaths(rows: DataRow[], renderPlan: A2UIRenderPlan) {
  const explicit = renderPlan.fieldMapping.metrics?.filter(Boolean) ?? [];
  if (explicit.length) return explicit.slice(0, 6);
  const first = rows[0] ?? {};
  return Object.entries(first)
    .filter(([, item]) => typeof item === "number")
    .map(([key]) => `items[].${key}`)
    .slice(0, 6);
}

function firstNumericPath(row: DataRow) {
  const entry = Object.entries(row).find(([, item]) => typeof item === "number");
  return entry ? `items[].${entry[0]}` : undefined;
}

function usesMetricRows(rows: DataRow[], renderPlan: A2UIRenderPlan) {
  const valuePath = renderPlan.fieldMapping.value ?? renderPlan.fieldMapping.metrics?.[0];
  if (!valuePath || rows.length < 2) return false;
  return rows.some((row) => row.label || row.title || row.name) && rows.some((row) => normalizedProgress(value(row, valuePath)) !== undefined);
}

function statusPaths(rows: DataRow[], renderPlan: A2UIRenderPlan) {
  const explicit = renderPlan.fieldMapping.booleanFlags?.filter(Boolean) ?? [];
  if (explicit.length) return explicit.slice(0, 5);
  const first = rows[0] ?? {};
  return Object.entries(first)
    .filter(([, item]) => typeof item === "boolean")
    .map(([key]) => `items[].${key}`)
    .slice(0, 5);
}

function TreeNode({ node, depth, renderPlan }: { node: DataRow; depth: number; renderPlan: A2UIRenderPlan }) {
  const childrenValue = value(node, renderPlan.fieldMapping.children) ?? node.children ?? node.nodes;
  const children = Array.isArray(childrenValue)
    ? childrenValue.filter((item): item is DataRow => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
  const status = value(node, renderPlan.fieldMapping.status);

  return (
    <>
      <div className={styles.treeNode} style={{ "--depth": depth } as CSSProperties}>
        <span className={styles.treeRail} />
        <div>
          <strong>{titleValue(node, renderPlan)}</strong>
          <span>{textValue(node, renderPlan.fieldMapping.content) || displayValue(status)}</span>
        </div>
        {children.length ? <em>{children.length}</em> : null}
      </div>
      {children.slice(0, 6).map((child, index) => (
        <TreeNode key={rowKey(child, index)} node={child} depth={depth + 1} renderPlan={renderPlan} />
      ))}
    </>
  );
}

function flatTreeRows(rows: DataRow[], renderPlan: A2UIRenderPlan) {
  const parentPath = renderPlan.fieldMapping.parentId;
  if (!parentPath) return rows;
  const idKey = "id";
  const parentKey = keyFromPath(parentPath);
  const byParent = new Map<string, DataRow[]>();
  for (const row of rows) {
    const parent = row[parentKey];
    const key = parent === null || parent === undefined || parent === "" ? "__root__" : String(parent);
    byParent.set(key, [...(byParent.get(key) ?? []), row]);
  }
  const result: DataRow[] = [];
  const visit = (items: DataRow[], depth: number) => {
    for (const item of items) {
      result.push({ ...item, __depth: depth });
      const id = item[idKey];
      if (id !== undefined) visit(byParent.get(String(id)) ?? [], depth + 1);
    }
  };
  visit(byParent.get("__root__") ?? rows.filter((row) => !row[parentKey]), 0);
  return result.length ? result : rows;
}

export function A2UISurfaceRenderer({
  data,
  profile,
  renderPlan,
}: {
  data: unknown;
  profile: A2UIDataProfile;
  renderPlan: A2UIRenderPlan;
}) {
  const rows = rowsFromData(data);
  const maxItems = renderPlan.maxItems ?? 8;
  const visibleRows = rows.slice(0, maxItems);
  const viewType = renderPlan.viewType;
  const fields = inferredFieldPaths(visibleRows, renderPlan);
  const booleans = statusPaths(visibleRows, renderPlan);
  const metrics = metricPaths(visibleRows, renderPlan);

  return (
    <div className={`${styles.surface} ${surfaceClass(viewType)}`}>
      <div className={styles.surfaceHeader}>
        <div>
          <span className={styles.surfaceLabel}>A2UI</span>
          <h4>{surfaceTitle(viewType)}</h4>
        </div>
      </div>

      {viewType === "collection.list" || viewType === "simpleTextList" ? (
        <div className={styles.textList}>
          {visibleRows.map((row, index) => (
            <div className={styles.textListItem} key={rowKey(row, index)}>
              <strong>{titleValue(row, renderPlan)}</strong>
              <span>{textValue(row, renderPlan.fieldMapping.content) || displayValue(value(row, renderPlan.fieldMapping.category) ?? value(row, renderPlan.fieldMapping.status))}</span>
            </div>
          ))}
        </div>
      ) : null}

      {viewType === "collection.cardGrid" || viewType === "imageCardList" ? (
        <div className={styles.imageGrid}>
          {visibleRows.map((row, index) => {
            const image = value(row, renderPlan.fieldMapping.image);
            return (
              <article className={styles.imageCard} key={rowKey(row, index)}>
                {typeof image === "string" && image ? <img alt={titleValue(row, renderPlan)} src={image} /> : <div className={styles.cardPlaceholder}>{titleValue(row, renderPlan).slice(0, 1)}</div>}
                <div>
                  <strong>{titleValue(row, renderPlan)}</strong>
                  <span>{textValue(row, renderPlan.fieldMapping.content) || displayValue(value(row, renderPlan.fieldMapping.category))}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {viewType === "record.detail" ? (
        <div className={styles.detailSurface}>
          {visibleRows.slice(0, 1).map((row, index) => (
            <div key={rowKey(row, index)}>
              <div className={styles.detailTitle}>
                <strong>{titleValue(row, renderPlan)}</strong>
                <span>{textValue(row, renderPlan.fieldMapping.content)}</span>
              </div>
              <div className={styles.detailFields}>
                {inferredFieldPaths([row], renderPlan, 8).map((path) => (
                  <div key={path}>
                    <span>{labelFromPath(path)}</span>
                    <strong>{displayValue(value(row, path))}</strong>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {viewType === "matrix.table" || viewType === "telemetryStatusTable" ? (
        <div className={styles.genericTable} role="table" aria-label="A2UI data table">
          <div className={styles.genericTableRow} role="row">
            <span>{labelFromPath(renderPlan.fieldMapping.title)}</span>
            {fields.map((field) => <span key={field}>{labelFromPath(field)}</span>)}
          </div>
          {visibleRows.map((row, index) => (
            <div className={styles.genericTableRow} key={rowKey(row, index)} role="row">
              <strong>{titleValue(row, renderPlan)}</strong>
              {fields.map((field) => <span key={field}>{displayValue(value(row, field))}</span>)}
            </div>
          ))}
        </div>
      ) : null}

      {viewType === "matrix.statusMatrix" || viewType === "statusBooleanList" ? (
        <div className={styles.statusTable} role="table" aria-label="A2UI status matrix">
          <div className={styles.statusHeader} role="row">
            <span>Item</span>
            {booleans.map((flagPath) => <span key={flagPath}>{labelFromPath(flagPath)}</span>)}
          </div>
          {visibleRows.map((row, index) => (
            <div className={styles.statusDataRow} key={rowKey(row, index)} role="row">
              <div className={styles.statusEquipment}>
                <strong>{titleValue(row, renderPlan)}</strong>
                <span>{displayValue(value(row, renderPlan.fieldMapping.category) ?? row.id)}</span>
              </div>
              {booleans.map((flagPath) => {
                const active = Boolean(value(row, flagPath));
                return (
                  <span className={`${styles.flagCell} ${active ? styles.flagOn : styles.flagOff}`} key={flagPath}>
                    {active ? "ON" : "OFF"}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}

      {viewType === "metric.statCards" ? (
        <div className={styles.statGrid}>
          {usesMetricRows(visibleRows, renderPlan)
            ? visibleRows.slice(0, 4).map((row, index) => {
                const metric = renderPlan.fieldMapping.value ?? renderPlan.fieldMapping.metrics?.[0] ?? firstNumericPath(row);
                return (
                  <div className={styles.statCard} key={rowKey(row, index)}>
                    <span>{titleValue(row, renderPlan)}</span>
                    <strong>{displayValue(value(row, metric))}</strong>
                    <em>{displayValue(value(row, renderPlan.fieldMapping.delta) ?? value(row, renderPlan.fieldMapping.unit))}</em>
                  </div>
                );
              })
            : (metrics.length ? metrics : [renderPlan.fieldMapping.value].filter(Boolean) as string[]).slice(0, 4).map((metric) => {
                const row = visibleRows[0] ?? {};
                return (
                  <div className={styles.statCard} key={metric}>
                    <span>{labelFromPath(metric)}</span>
                    <strong>{displayValue(value(row, metric))}</strong>
                    <em>{displayValue(value(row, renderPlan.fieldMapping.delta) ?? value(row, renderPlan.fieldMapping.unit))}</em>
                  </div>
                );
              })}
        </div>
      ) : null}

      {viewType === "metric.progressList" ? (
        <div className={styles.progressList}>
          {visibleRows.map((row, index) => {
            const percent = normalizedProgress(value(row, renderPlan.fieldMapping.progress));
            return (
              <div className={styles.progressItem} key={rowKey(row, index)}>
                <div>
                  <strong>{titleValue(row, renderPlan)}</strong>
                  <span>{displayValue(value(row, renderPlan.fieldMapping.status) ?? value(row, renderPlan.fieldMapping.updatedAt))}</span>
                  <em>{percent === undefined ? "-" : `${Math.round(percent)}%`}</em>
                </div>
                <div className={styles.progressTrack}>
                  <span style={{ width: `${percent ?? 0}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {viewType === "time.timeline" ? (
        <TimelineRange rows={visibleRows} renderPlan={renderPlan} />
      ) : null}

      {viewType === "process.queue" ? (
        <div className={styles.queueList}>
          {visibleRows.map((row, index) => {
            const status = value(row, renderPlan.fieldMapping.status);
            return (
              <div className={styles.queueItem} key={rowKey(row, index)}>
                <span className={`${styles.queueStatus} ${statusTone(status)}`}>{displayValue(status)}</span>
                <div>
                  <strong>{titleValue(row, renderPlan)}</strong>
                  <span>{displayValue(value(row, renderPlan.fieldMapping.assignee))} · {displayValue(value(row, renderPlan.fieldMapping.dueAt))}</span>
                </div>
                <em>{displayValue(value(row, renderPlan.fieldMapping.priority))}</em>
              </div>
            );
          })}
        </div>
      ) : null}

      {viewType === "relation.tree" ? (
        <div className={styles.treeList}>
          {childrenOrFlatTree(visibleRows, renderPlan).map((row, index) =>
            row.__flat ? (
              <div className={styles.treeNode} style={{ "--depth": Number((row as DataRow).__depth ?? 0) } as CSSProperties} key={rowKey(row, index)}>
                <span className={styles.treeRail} />
                <div>
                  <strong>{titleValue(row, renderPlan)}</strong>
                  <span>{textValue(row, renderPlan.fieldMapping.content) || displayValue(value(row, renderPlan.fieldMapping.status))}</span>
                </div>
              </div>
            ) : (
              <TreeNode key={rowKey(row, index)} node={row} depth={0} renderPlan={renderPlan} />
            ),
          )}
        </div>
      ) : null}

      {!rows.length ? <div className={styles.emptyState}>표시할 데이터가 없습니다.</div> : null}
      {profile.rowCount > visibleRows.length ? <div className={styles.surfaceFooter}>Showing {visibleRows.length} of {profile.rowCount}</div> : null}
    </div>
  );
}

function TimelineRange({ rows, renderPlan }: { rows: DataRow[]; renderPlan: A2UIRenderPlan }) {
  const items = timelineItems(rows, renderPlan);
  if (!items.length) return <div className={styles.emptyState}>표시할 일정 데이터가 없습니다.</div>;
  const rangeStart = Math.min(...items.map((item) => item.start));
  const rangeEnd = Math.max(...items.map((item) => item.end));
  const span = Math.max(1, rangeEnd - rangeStart);
  const middle = rangeStart + span / 2;

  return (
    <div className={styles.rangeTimeline}>
      <div className={styles.timelineAxis} aria-hidden="true">
        <span>{shortDate(rangeStart)}</span>
        <span>{shortDate(middle)}</span>
        <span>{shortDate(rangeEnd)}</span>
      </div>
      <div className={styles.timelineRangeRows}>
        {items.map((item) => {
          const offset = Math.max(0, Math.min(100, ((item.start - rangeStart) / span) * 100));
          const width = Math.max(2, Math.min(100 - offset, ((item.end - item.start) / span) * 100));
          const status = displayValue(item.status);
          const lane = displayValue(item.lane);
          return (
            <div className={styles.timelineRangeRow} key={rowKey(item.row, item.index)}>
              <div className={styles.timelineRangeMeta}>
                <strong>{titleValue(item.row, renderPlan)}</strong>
                <span>{lane} · {shortDate(item.startRaw)} - {shortDate(item.endRaw)}</span>
              </div>
              <div className={styles.timelineTrack} aria-label={`${titleValue(item.row, renderPlan)} ${shortDate(item.startRaw)} to ${shortDate(item.endRaw)}`}>
                <span
                  className={`${styles.timelineRangeBar} ${statusTone(item.status)}`}
                  style={{ "--offset": `${offset}%`, "--span": `${width}%` } as CSSProperties}
                >
                  {status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function childrenOrFlatTree(rows: DataRow[], renderPlan: A2UIRenderPlan) {
  const hasNested = rows.some((row) => Array.isArray(value(row, renderPlan.fieldMapping.children) ?? row.children ?? row.nodes));
  if (hasNested) return rows;
  return flatTreeRows(rows, renderPlan).map((row) => ({ ...row, __flat: true }));
}

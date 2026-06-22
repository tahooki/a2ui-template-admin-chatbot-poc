import styles from "./styles.module.css";
import type { A2UIDataProfile, A2UIRenderPlan, EquipmentApiResponse } from "./template-types";

function keyFromPath(path?: string) {
  return path?.split(".").pop() ?? "";
}

function rowsFromData(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const items = (data as { items?: unknown }).items;
  if (Array.isArray(items)) {
    return items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }
  return [data as Record<string, unknown>];
}

function value(row: Record<string, unknown>, path?: string) {
  if (!path) return "";
  return row[keyFromPath(path)] ?? "";
}

const booleanLabels: Record<string, string> = {
  isOnline: "온라인",
  isRunning: "가동",
  hasAlarm: "알람",
  needsInspection: "점검",
  isReserved: "예약",
};

function booleanLabel(path: string) {
  const key = keyFromPath(path);
  return booleanLabels[key] ?? key;
}

function metricLabel(path: string) {
  const key = keyFromPath(path);
  if (/^telemetry_\d+$/i.test(key)) return key.replace("telemetry_", "T");
  if (key === "alarmTotalCnt" || key === "alarm_count") return "알람수";
  return key;
}

function textValue(row: Record<string, unknown>, path?: string) {
  const fieldValue = value(row, path);
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : "";
}

function surfaceTitle(viewType: string) {
  if (viewType === "telemetryStatusTable") return "계측 상태 테이블";
  if (viewType === "statusBooleanList") return "장비 상태";
  if (viewType === "imageCardList") return "장비 목록";
  return "장비 목록";
}

export function A2UIDemoRenderer({
  data,
  profile,
  renderPlan,
}: {
  data: EquipmentApiResponse<unknown>;
  profile: A2UIDataProfile;
  renderPlan: A2UIRenderPlan;
}) {
  const rows = rowsFromData(data);
  const maxItems = renderPlan.maxItems ?? 6;
  const visibleRows = rows.slice(0, maxItems);
  const booleanFlags = renderPlan.fieldMapping.booleanFlags?.slice(0, 5) ?? [];
  const metricFields = renderPlan.fieldMapping.metrics?.slice(0, 4) ?? [];

  return (
    <div className={`${styles.surface} ${styles[`surface_${renderPlan.viewType}`]}`}>
      <div className={styles.surfaceHeader}>
        <div>
          <span className={styles.surfaceLabel}>A2UI</span>
          <h4>{surfaceTitle(renderPlan.viewType)}</h4>
        </div>
      </div>

      {renderPlan.viewType === "statusBooleanList" ? (
        <div className={styles.statusTable} role="table" aria-label="Equipment status boolean list">
          <div className={styles.statusHeader} role="row">
            <span>장비</span>
            {booleanFlags.map((flagPath) => (
              <span key={flagPath}>{booleanLabel(flagPath)}</span>
            ))}
          </div>
          {visibleRows.map((row) => (
            <div className={styles.statusDataRow} key={String(row.id)} role="row">
              <div className={styles.statusEquipment}>
                <strong>{String(value(row, renderPlan.fieldMapping.title))}</strong>
                <span>{String(row.id)}</span>
              </div>
              {booleanFlags.map((flagPath) => {
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

      {renderPlan.viewType === "telemetryStatusTable" ? (
        <div className={styles.telemetryTable} role="table" aria-label="Equipment telemetry status table">
          <div className={styles.telemetryHeader} role="row">
            <span>장비</span>
            {booleanFlags.slice(0, 3).map((flagPath) => (
              <span key={flagPath}>{booleanLabel(flagPath)}</span>
            ))}
            {metricFields.map((metricPath) => (
              <span key={metricPath}>{metricLabel(metricPath)}</span>
            ))}
          </div>
          {visibleRows.map((row, rowIndex) => (
            <div className={styles.telemetryDataRow} key={String(row.id ?? rowIndex)} role="row">
              <div className={styles.statusEquipment}>
                <strong>{String(value(row, renderPlan.fieldMapping.title))}</strong>
                <span>{String(row.id ?? row.assetId ?? row.eqp_id ?? "")}</span>
              </div>
              {booleanFlags.slice(0, 3).map((flagPath) => {
                const active = Boolean(value(row, flagPath));
                return (
                  <span className={`${styles.flagCell} ${active ? styles.flagOn : styles.flagOff}`} key={flagPath}>
                    {active ? "ON" : "OFF"}
                  </span>
                );
              })}
              {metricFields.map((metricPath) => {
                const metricValue = value(row, metricPath);
                return (
                  <span className={styles.metricCell} key={metricPath}>
                    {typeof metricValue === "number" ? metricValue.toLocaleString() : String(metricValue)}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}

      {renderPlan.viewType === "simpleTextList" ? (
        <>
          {renderPlan.isFallback && profile.hasImageField ? (
            <div className={styles.fallbackNotice}>
              <strong>이미지 화면이 아직 등록되지 않았습니다.</strong>
              <span>우선 텍스트 목록으로 보여드립니다.</span>
            </div>
          ) : null}
          <div className={styles.textList}>
            {visibleRows.map((row) => {
              const content =
                textValue(row, renderPlan.fieldMapping.content) ||
                String(row.category ?? row.location ?? "표시 가능한 본문 필드가 없습니다.");

              return (
                <div className={styles.textListItem} key={String(row.id)}>
                  <strong>{String(value(row, renderPlan.fieldMapping.title))}</strong>
                  <span>{content}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {renderPlan.viewType === "imageCardList" ? (
        <div className={styles.imageGrid}>
          {visibleRows.map((row) => (
            <article className={styles.imageCard} key={String(row.id)}>
              <img alt={String(value(row, renderPlan.fieldMapping.title))} src={String(value(row, renderPlan.fieldMapping.image))} />
              <div>
                <strong>{String(value(row, renderPlan.fieldMapping.title))}</strong>
                <span>{String(value(row, renderPlan.fieldMapping.content))}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}

    </div>
  );
}

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
  const maxItems = renderPlan.maxItems ?? (renderPlan.viewType === "imageCardList" ? 8 : 10);
  const visibleRows = rows.slice(0, maxItems);

  return (
    <div className={styles.surface}>
      <div className={styles.surfaceHeader}>
        <div>
          <span className={styles.surfaceLabel}>A2UI Surface</span>
          <h4>{renderPlan.selectedComponentId}</h4>
        </div>
        <div className={styles.surfaceMeta}>
          <span>score {renderPlan.score}</span>
          <span>v{renderPlan.registryVersion}</span>
        </div>
      </div>

      {renderPlan.viewType === "statusBooleanList" ? (
        <div className={styles.statusList}>
          {visibleRows.map((row) => (
            <div className={styles.statusRow} key={String(row.id)}>
              <div>
                <strong>{String(value(row, renderPlan.fieldMapping.title))}</strong>
                <span>{String(row.id)}</span>
              </div>
              <div className={styles.flagGrid}>
                {renderPlan.fieldMapping.booleanFlags?.slice(0, 5).map((flagPath) => {
                  const active = Boolean(value(row, flagPath));
                  return (
                    <span className={`${styles.flagPill} ${active ? styles.flagOn : styles.flagOff}`} key={flagPath}>
                      {booleanLabel(flagPath)}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {renderPlan.viewType === "simpleTextList" ? (
        <div className={styles.textList}>
          {visibleRows.map((row) => (
            <div className={styles.textListItem} key={String(row.id)}>
              <strong>{String(value(row, renderPlan.fieldMapping.title))}</strong>
              <span>{String(value(row, renderPlan.fieldMapping.content) || row.category || row.location || "표시 가능한 본문 필드가 없습니다.")}</span>
            </div>
          ))}
        </div>
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

      <div className={styles.surfaceFooter}>
        <span>
          rows {visibleRows.length}/{profile.rowCount}
        </span>
        <span>{profile.hasImageField ? "image field detected" : "no image field"}</span>
      </div>
    </div>
  );
}

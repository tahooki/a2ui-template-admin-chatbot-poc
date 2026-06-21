"use client";

import { useEffect, useMemo, useState } from "react";
import { dataBoundaryScenarioById, dataBoundaryScenarios } from "./data-boundary-lab";
import styles from "./styles.module.css";
import type { DataBoundaryScenarioId, DataBoundaryScenarioTrace } from "./data-boundary-lab";

type ApiTableState = {
  apiRoute?: string;
  data?: unknown;
  error?: string;
  isLoading: boolean;
};

function valueText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function tableRows(data: unknown) {
  const root = record(data);
  const result = record(root?.result);
  let rows: unknown[] = [];
  if (Array.isArray(root?.items)) rows = root.items;
  else if (Array.isArray(root?.rows)) rows = root.rows;
  else if (Array.isArray(result?.rows)) rows = result.rows;
  return rows.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function rowTotal(data: unknown, rows: Record<string, unknown>[]) {
  const root = record(data);
  const result = record(root?.result);
  if (typeof root?.total === "number") return root.total;
  if (typeof root?.totalCount === "number") return root.totalCount;
  if (typeof result?.total === "number") return result.total;
  if (typeof result?.totalCount === "number") return result.totalCount;
  return rows.length;
}

function columnsForRows(rows: Record<string, unknown>[]) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).sort();
}

export function DataBoundaryLabPanel({
  selectedScenario,
  trace,
  onScenarioChange,
}: {
  selectedScenario: DataBoundaryScenarioId;
  trace: DataBoundaryScenarioTrace;
  onScenarioChange: (scenario: DataBoundaryScenarioId) => void;
}) {
  const scenario = dataBoundaryScenarioById(selectedScenario);
  const [apiTable, setApiTable] = useState<ApiTableState>({ isLoading: false });

  useEffect(() => {
    let active = true;

    async function loadTable() {
      try {
        const response = await fetch(scenario.apiRoute, { cache: "no-store" });
        if (!response.ok) throw new Error(`${scenario.apiRoute} failed with ${response.status}`);
        const data = (await response.json()) as unknown;
        if (tableRows(data).length === 0) throw new Error(`${scenario.apiRoute} did not return table rows`);
        if (active) setApiTable({ apiRoute: scenario.apiRoute, data, isLoading: false });
      } catch (error) {
        if (!active) return;
        setApiTable({
          apiRoute: scenario.apiRoute,
          error: error instanceof Error ? error.message : "Business API table load failed",
          isLoading: false,
        });
      }
    }

    void loadTable();

    return () => {
      active = false;
    };
  }, [scenario.apiRoute]);

  const isRouteLoading = apiTable.apiRoute !== scenario.apiRoute;
  const tableError = isRouteLoading ? undefined : apiTable.error;
  const tableData = !isRouteLoading && apiTable.data ? apiTable.data : trace.sourceData;
  const rows = useMemo(() => tableRows(tableData), [tableData]);
  const columns = useMemo(() => columnsForRows(rows), [rows]);
  const visibleRowLimit = selectedScenario === "large_rows" ? 80 : 24;
  const visibleRows = rows.slice(0, visibleRowLimit);
  const totalRows = rowTotal(tableData, rows);

  return (
    <section className={styles.dataBoundaryLab} aria-label="A2UI data boundary table">
      <div className={styles.scenarioTabs} aria-label="API scenario tabs" role="tablist">
        {dataBoundaryScenarios.map((item) => (
          <button
            aria-selected={selectedScenario === item.id}
            className={`${styles.scenarioTab} ${selectedScenario === item.id ? styles.scenarioTabActive : ""}`}
            key={item.id}
            onClick={() => onScenarioChange(item.id)}
            role="tab"
            type="button"
          >
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </div>

      <div className={styles.dataBoundaryGrid}>
        <div className={styles.rawDataPanel}>
          <div className={styles.labSubheader}>
            <div>
              <span>Business API table</span>
              <strong>{scenario.businessToolName}</strong>
            </div>
            <small>
              {totalRows} rows / {columns.length} columns
            </small>
          </div>
          <div className={styles.dataMetaStrip} aria-label="Business API route">
            <span>{scenario.apiRoute}</span>
            <span>{scenario.apiId}</span>
            <span>{scenario.expectedTemplateId}</span>
            {isRouteLoading || apiTable.isLoading ? <span>loading</span> : null}
            {tableError ? <span>fallback fixture: {tableError}</span> : null}
            {rows.length > visibleRows.length ? <span>preview {visibleRows.length}/{rows.length}</span> : null}
          </div>
          <div className={styles.rawTableScroller}>
            <table className={styles.rawDataTable}>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, rowIndex) => (
                  <tr key={`${trace.id}-${rowIndex}`}>
                    {columns.map((column) => (
                      <td key={column}>{valueText(row[column])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

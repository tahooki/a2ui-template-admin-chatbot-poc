"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductNavigation } from "@/features/a2ui-core/product-navigation";
import { useTemplateRegistry } from "@/features/a2ui-core/template-registry";
import type { A2UITemplateRegistration } from "@/features/a2ui-core/template-types";
import {
  createTemplateDraft,
  draftFromTemplate,
  validateTemplateDraft,
  type TemplateDraft,
} from "./template-validation";
import styles from "./admin.module.css";

type StatusFilter = "all" | A2UITemplateRegistration["status"];

function draftSignature(draft: TemplateDraft | null) {
  return draft ? JSON.stringify(draft) : "";
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(status: A2UITemplateRegistration["status"]) {
  if (status === "registered") return "등록";
  if (status === "draft") return "초안";
  return "오류";
}

export function AdminPage() {
  const {
    templates,
    version,
    registeredCount,
    lastSavedComponentId,
    error: catalogError,
    isLoading,
    saveTemplate,
    resetRegistry,
    refreshRegistry,
  } = useTemplateRegistry();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [baseline, setBaseline] = useState<TemplateDraft | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mobileView, setMobileView] = useState<"catalog" | "editor">("catalog");

  const isDirty = draftSignature(draft) !== draftSignature(baseline);
  const validation = useMemo(
    () => draft ? validateTemplateDraft(draft, templates) : { template: null, errors: [] },
    [draft, templates],
  );
  const statusCounts = useMemo(() => ({
    draft: templates.filter((template) => template.status === "draft").length,
    invalid: templates.filter((template) => template.status === "invalid").length,
  }), [templates]);
  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
    return templates.filter((template) => {
      if (statusFilter !== "all" && template.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [template.title, template.description, template.componentId, template.surfaceConfig.viewType]
        .some((value) => value.toLocaleLowerCase("ko-KR").includes(normalizedQuery));
    });
  }, [query, statusFilter, templates]);

  useEffect(() => {
    function preventAccidentalLeave(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", preventAccidentalLeave);
    return () => window.removeEventListener("beforeunload", preventAccidentalLeave);
  }, [isDirty]);

  function canDiscardChanges() {
    return !isDirty || window.confirm("저장하지 않은 변경사항이 있습니다. 계속할까요?");
  }

  function selectTemplate(template: A2UITemplateRegistration) {
    if (template.componentId === selectedId) {
      setMobileView("editor");
      return;
    }
    if (!canDiscardChanges()) return;
    const nextDraft = draftFromTemplate(template);
    setSelectedId(template.componentId);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setSaveError(null);
    setMobileView("editor");
  }

  function createTemplate() {
    if (!canDiscardChanges()) return;
    const nextDraft = createTemplateDraft(templates.map((template) => template.componentId));
    setSelectedId(null);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setSaveError(null);
    setMobileView("editor");
  }

  function updateDraft<Key extends keyof TemplateDraft>(key: Key, value: TemplateDraft[Key]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setSaveError(null);
  }

  function revertDraft() {
    if (!baseline) return;
    setDraft(baseline);
    setSaveError(null);
  }

  async function handleSave() {
    if (!validation.template || validation.errors.length) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveTemplate(validation.template);
      const savedDraft = draftFromTemplate(validation.template);
      setSelectedId(validation.template.componentId);
      setDraft(savedDraft);
      setBaseline(savedDraft);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "템플릿 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReset() {
    if (!window.confirm("Catalog를 초기 템플릿으로 되돌릴까요? 현재 변경사항이 사라집니다.")) return;
    setIsSaving(true);
    try {
      await resetRegistry();
      setSelectedId(null);
      setDraft(null);
      setBaseline(null);
      setSaveError(null);
      setMobileView("catalog");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Catalog 초기화에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  const filters: Array<{ value: StatusFilter; label: string; count: number }> = [
    { value: "all", label: "전체", count: templates.length },
    { value: "registered", label: "등록", count: registeredCount },
    { value: "draft", label: "초안", count: statusCounts.draft },
    { value: "invalid", label: "오류", count: statusCounts.invalid },
  ];

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar} aria-label="Admin navigation">
        <div className={styles.brand}>
          <span className={styles.brandMark}>A2</span>
          <div className={styles.brandCopy}>
            <strong>A2UI Studio</strong>
            <small>Operations Console</small>
          </div>
        </div>

        <p className={styles.sidebarSectionLabel}>Workspace</p>
        <ProductNavigation active="admin" variant="sidebar" />

        <div className={styles.sidebarSpacer} />
        <div className={styles.sidebarStatus}>
          <div className={styles.connectionState}>
            <span aria-hidden="true" />
            <div>
              <small>Template catalog</small>
              <strong>{catalogError ? "Connection error" : isLoading ? "Connecting" : "Connected"}</strong>
            </div>
          </div>
          <dl>
            <div><dt>Version</dt><dd>v{version || "—"}</dd></div>
            <div><dt>Templates</dt><dd>{templates.length}</dd></div>
          </dl>
        </div>
      </aside>

      <section className={styles.appShell}>
        <header className={styles.topbar}>
          <div className={styles.pageTitle}>
            <span>Admin / Template Catalog</span>
            <h1>템플릿 관리</h1>
            <p>A2UI 화면 템플릿의 등록 상태와 데이터 계약을 관리합니다.</p>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.secondaryButton}
              disabled={isLoading || isSaving}
              type="button"
              onClick={() => void refreshRegistry()}
            >
              새로고침
            </button>
            <button className={styles.primaryButton} type="button" onClick={createTemplate}>
              <span aria-hidden="true">+</span> 새 템플릿
            </button>
          </div>
        </header>

        <section className={styles.statusOverview} aria-label="Catalog status summary">
          <div><span>전체 템플릿</span><strong>{templates.length}</strong></div>
          <div><span>등록</span><strong>{registeredCount}</strong></div>
          <div><span>초안</span><strong>{statusCounts.draft}</strong></div>
          <div><span>검증 오류</span><strong className={statusCounts.invalid ? styles.dangerText : ""}>{statusCounts.invalid}</strong></div>
          <div className={styles.saveState}>
            <span className={isDirty ? styles.dirtyState : styles.syncedState}>
              {isDirty ? "저장하지 않은 변경" : lastSavedComponentId ? "저장 완료" : "Catalog 동기화됨"}
            </span>
            <small>{lastSavedComponentId || `Catalog v${version || "—"}`}</small>
          </div>
        </section>

        <div className={styles.workspace}>
          <aside className={`${styles.catalog} ${mobileView === "editor" ? styles.mobileHidden : ""}`} aria-label="Template catalog">
            <div className={styles.catalogHeader}>
              <div>
                <h2>템플릿 카탈로그</h2>
                <p>등록된 Surface와 View Type을 조회합니다.</p>
              </div>
              <span>{filteredTemplates.length} / {templates.length}</span>
            </div>

            <div className={styles.catalogTools}>
              <label className={styles.searchField}>
                <span>템플릿 검색</span>
                <input
                  aria-label="템플릿 검색"
                  placeholder="이름, Component ID, View Type"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className={styles.filterRow} aria-label="템플릿 상태 필터">
                {filters.map((filter) => (
                  <button
                    aria-pressed={statusFilter === filter.value}
                    className={statusFilter === filter.value ? styles.filterActive : ""}
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                  >
                    <span>{filter.label}</span>
                    <small>{filter.count}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.templateList}>
              {catalogError ? <div className={styles.errorState}>Catalog 오류<br />{catalogError}</div> : null}
              {isLoading ? <div className={styles.emptyState}>Catalog를 불러오는 중입니다.</div> : null}
              {!isLoading && !catalogError && !filteredTemplates.length ? (
                <div className={styles.emptyState}>조건에 맞는 템플릿이 없습니다.</div>
              ) : null}
              {filteredTemplates.map((template) => (
                <button
                  aria-pressed={selectedId === template.componentId}
                  className={`${styles.templateItem} ${selectedId === template.componentId ? styles.templateItemActive : ""}`}
                  key={template.componentId}
                  type="button"
                  onClick={() => selectTemplate(template)}
                >
                  <span className={styles.itemTitleRow}>
                    <strong>{template.title}</strong>
                    <i data-status={template.status}>{statusLabel(template.status)}</i>
                  </span>
                  <span className={styles.itemDescription}>{template.description}</span>
                  <span className={styles.itemMeta}>
                    <code>{template.componentId}</code>
                    <span>{template.surfaceConfig.viewType}</span>
                    <time>{formatUpdatedAt(template.updatedAt)}</time>
                  </span>
                </button>
              ))}
            </div>

            <div className={styles.catalogFooter}>
              <span>Catalog v{version || "—"}</span>
              <button disabled={isSaving} type="button" onClick={() => void handleReset()}>기본값으로 초기화</button>
            </div>
          </aside>

          <section className={`${styles.editor} ${mobileView === "catalog" ? styles.mobileHidden : ""}`} aria-label="Template editor">
            {draft ? (
              <>
                <div className={styles.editorHeader}>
                  <button className={styles.mobileBack} type="button" onClick={() => setMobileView("catalog")}>← 목록</button>
                  <div className={styles.editorTitle}>
                    <span>Template / {draft.originalComponentId ? "Edit" : "New"}</span>
                    <h2>{draft.title || "새 템플릿"}</h2>
                    <code>{draft.componentId || "component.id"}</code>
                  </div>
                  <div className={styles.editorHeaderMeta}>
                    <span data-status={draft.status}>{statusLabel(draft.status)}</span>
                    <small className={isDirty ? styles.dirtyState : styles.syncedState}>{isDirty ? "수정됨" : "최신 상태"}</small>
                  </div>
                </div>

                <div className={styles.editorScroll}>
                  <section className={styles.editorSection}>
                    <div className={styles.sectionLabel}>
                      <strong>기본 정보</strong>
                      <small>카탈로그에서 템플릿을 식별하고 추천할 때 사용하는 정보입니다.</small>
                    </div>
                    <div className={styles.formGrid}>
                      <label className={styles.field}>
                        <span>템플릿 이름 *</span>
                        <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
                      </label>
                      <label className={styles.field}>
                        <span>Component ID *</span>
                        <input
                          className={styles.monoInput}
                          disabled={draft.originalComponentId !== null}
                          value={draft.componentId}
                          onChange={(event) => updateDraft("componentId", event.target.value)}
                        />
                        {draft.originalComponentId ? <small>기존 템플릿의 ID는 변경할 수 없습니다.</small> : null}
                      </label>
                      <label className={`${styles.field} ${styles.fullField}`}>
                        <span>설명 *</span>
                        <textarea rows={2} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} />
                      </label>
                      <label className={`${styles.field} ${styles.fullField}`}>
                        <span>Selection Guide *</span>
                        <textarea rows={3} value={draft.selectionGuide} onChange={(event) => updateDraft("selectionGuide", event.target.value)} />
                      </label>
                      <label className={styles.field}>
                        <span>등록 상태</span>
                        <select value={draft.status} onChange={(event) => updateDraft("status", event.target.value as TemplateDraft["status"])}>
                          <option value="registered">등록</option>
                          <option value="draft">초안</option>
                          <option value="invalid">오류</option>
                        </select>
                      </label>
                    </div>
                  </section>

                  <section className={styles.editorSection}>
                    <div className={styles.sectionLabel}>
                      <strong>Matching Rules</strong>
                      <small>Agent가 조회 데이터와 이 템플릿을 연결하는 기준입니다.</small>
                    </div>
                    <div className={styles.ruleGrid}>
                      <div><small>Required Roles</small><strong>{validation.template?.schemaSpec.requiredRoles.join(", ") || "JSON 확인 필요"}</strong></div>
                      <div><small>Intent Keywords</small><strong>{validation.template?.schemaSpec.intentKeywords?.join(", ") || "—"}</strong></div>
                      <div><small>Input Shape</small><strong>{validation.template?.inputSchema?.accepts.shape.join(", ") || "Schema adapter"}</strong></div>
                      <div><small>Required Slots</small><strong>{validation.template?.inputSchema?.requiredSlots.length ?? 0}</strong></div>
                      <div><small>Optional Slots</small><strong>{validation.template?.inputSchema?.optionalSlots?.length ?? 0}</strong></div>
                    </div>
                  </section>

                  <section className={styles.editorSection}>
                    <div className={styles.sectionLabel}>
                      <strong>고급 설정</strong>
                      <small>템플릿의 Schema, Surface, Input 계약 JSON을 편집합니다.</small>
                    </div>
                    <div className={styles.jsonGrid}>
                      <label className={styles.field}>
                        <span>Schema Spec</span>
                        <textarea className={styles.codeEditor} rows={16} spellCheck={false} value={draft.schemaJson} onChange={(event) => updateDraft("schemaJson", event.target.value)} />
                      </label>
                      <label className={styles.field}>
                        <span>Surface Config</span>
                        <textarea className={styles.codeEditor} rows={16} spellCheck={false} value={draft.surfaceJson} onChange={(event) => updateDraft("surfaceJson", event.target.value)} />
                      </label>
                      <label className={`${styles.field} ${styles.fullField}`}>
                        <span>Input Schema</span>
                        <textarea className={styles.codeEditor} rows={18} spellCheck={false} value={draft.inputSchemaJson} onChange={(event) => updateDraft("inputSchemaJson", event.target.value)} />
                      </label>
                    </div>
                  </section>
                </div>

                <footer className={styles.validationBar}>
                  <div className={`${styles.validationIcon} ${validation.errors.length ? styles.validationIconError : ""}`} aria-hidden="true">
                    {validation.errors.length ? "!" : "✓"}
                  </div>
                  <div className={styles.validationCopy}>
                    <strong>{validation.errors.length ? `${validation.errors.length}개 검증 오류` : "저장 가능한 상태입니다"}</strong>
                    {validation.errors.length ? (
                      <ul>{validation.errors.slice(0, 3).map((error) => <li key={error}>{error}</li>)}</ul>
                    ) : <small>필수 필드와 JSON 계약을 확인했습니다.</small>}
                    {saveError ? <p>{saveError}</p> : null}
                  </div>
                  <div className={styles.editorActions}>
                    <button disabled={!isDirty || isSaving} type="button" onClick={revertDraft}>변경 취소</button>
                    <button className={styles.saveButton} disabled={!isDirty || isSaving || Boolean(validation.errors.length)} type="button" onClick={() => void handleSave()}>
                      {isSaving ? "저장 중…" : "변경사항 저장"}
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <div className={styles.editorEmpty}>
                <span className={styles.emptyIcon} aria-hidden="true">
                  <svg viewBox="0 0 32 32"><path d="M8 4.5h11l5 5V27.5H8zM19 4.5v5h5M12 15h8M12 19h8M12 23h5" /></svg>
                </span>
                <h2>편집할 템플릿을 선택하세요</h2>
                <p>왼쪽 카탈로그에서 템플릿을 선택하면 상세 설정과 데이터 계약을 확인할 수 있습니다.</p>
                <button className={styles.secondaryButton} type="button" onClick={createTemplate}>새 템플릿 만들기</button>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

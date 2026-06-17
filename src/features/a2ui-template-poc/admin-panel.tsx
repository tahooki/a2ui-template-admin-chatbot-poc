"use client";

import { useState } from "react";
import { IMAGE_CARD_REGISTRATION_PRESET } from "./image-card-registration-preset";
import styles from "./styles.module.css";
import type { A2UITemplateRegistration } from "./template-types";

function stringify(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseObject(value: string, label: string) {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function compactList(values?: string[]) {
  if (!values?.length) return "-";
  return values.slice(0, 4).join(", ");
}

export function AdminPanel({
  templates,
  onSave,
  isLoading = false,
  catalogError = null,
}: {
  templates: A2UITemplateRegistration[];
  onSave: (template: A2UITemplateRegistration) => Promise<void>;
  isLoading?: boolean;
  catalogError?: string | null;
}) {
  const [editingTemplate, setEditingTemplate] = useState<A2UITemplateRegistration | null>(null);
  const selected = editingTemplate;
  const [componentId, setComponentId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectionGuide, setSelectionGuide] = useState("");
  const [schemaJson, setSchemaJson] = useState("{}");
  const [inputSchemaJson, setInputSchemaJson] = useState("{}");
  const [surfaceJson, setSurfaceJson] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function loadTemplate(template: A2UITemplateRegistration) {
    setEditingTemplate(template);
    setComponentId(template.componentId);
    setTitle(template.title);
    setDescription(template.description);
    setSelectionGuide(template.selectionGuide);
    setSchemaJson(stringify(template.schemaSpec));
    setInputSchemaJson(stringify(template.inputSchema ?? {}));
    setSurfaceJson(stringify(template.surfaceConfig));
    setError(null);
    setIsDetailOpen(true);
  }

  function openTemplate(template: A2UITemplateRegistration) {
    loadTemplate(template);
  }

  async function handleSave() {
    try {
      setIsSaving(true);
      const schemaSpec = parseObject(schemaJson, "Schema Spec") as A2UITemplateRegistration["schemaSpec"];
      const parsedInputSchema = parseObject(inputSchemaJson, "Input Schema");
      const inputSchema = Object.keys(parsedInputSchema).length
        ? (parsedInputSchema as A2UITemplateRegistration["inputSchema"])
        : undefined;
      const surfaceConfig = parseObject(surfaceJson, "Surface Config") as A2UITemplateRegistration["surfaceConfig"];
      if (!componentId.trim() || !title.trim()) {
        throw new Error("Component ID and title are required");
      }
      await onSave({
        componentId: componentId.trim(),
        title: title.trim(),
        description: description.trim(),
        selectionGuide: selectionGuide.trim(),
        schemaSpec,
        inputSchema,
        surfaceConfig,
        status: "registered",
        updatedAt: new Date().toISOString(),
      });
      setEditingTemplate(null);
      setError(null);
      setIsDetailOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  if (isDetailOpen && selected) {
    return (
      <section className={styles.adminPanel} aria-label="A2UI template admin">
        <button
          className={styles.backButton}
          type="button"
          onClick={() => {
            setEditingTemplate(null);
            setIsDetailOpen(false);
          }}
        >
          템플릿으로 돌아가기
        </button>

        <div className={styles.detailHeader}>
          <p className={styles.eyebrow}>A2UI template</p>
          <h2>{selected.title}</h2>
          <span>{selected.componentId}</span>
        </div>

        <div className={styles.compactForm}>
          <label className={styles.fieldLabel}>
            이름
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            설명
            <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>

        <details className={styles.specDisclosure}>
          <summary>매칭 규칙</summary>
          <div className={styles.readOnlyLines}>
            <span>Roles</span>
            <strong>{selected.schemaSpec.requiredRoles.join(", ")}</strong>
            <span>Intent</span>
            <strong>{compactList(selected.schemaSpec.intentKeywords)}</strong>
            <span>Input</span>
            <strong>{selected.inputSchema ? selected.inputSchema.accepts.shape.join(", ") : "schema adapter"}</strong>
          </div>
        </details>

        <details className={styles.specDisclosure}>
          <summary>스키마</summary>
          <div className={styles.advancedStack}>
            <label className={styles.fieldLabel}>
              Component ID
              <input value={componentId} onChange={(event) => setComponentId(event.target.value)} />
            </label>
            <label className={styles.fieldLabel}>
              Schema spec
              <textarea
                className={styles.codeTextarea}
                rows={9}
                spellCheck={false}
                value={schemaJson}
                onChange={(event) => setSchemaJson(event.target.value)}
              />
            </label>
            <label className={styles.fieldLabel}>
              Surface config
              <textarea
                className={styles.codeTextarea}
                rows={9}
                spellCheck={false}
                value={surfaceJson}
                onChange={(event) => setSurfaceJson(event.target.value)}
              />
            </label>
            <label className={styles.fieldLabel}>
              Input schema
              <textarea
                className={styles.codeTextarea}
                rows={11}
                spellCheck={false}
                value={inputSchemaJson}
                onChange={(event) => setInputSchemaJson(event.target.value)}
              />
            </label>
          </div>
        </details>

        {error ? <div className={styles.errorBox}>{error}</div> : null}
        <div className={styles.editorActions}>
          <button className={styles.primaryButton} disabled={isSaving} type="button" onClick={() => void handleSave()}>
            {isSaving ? "저장 중" : "저장"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.adminPanel} aria-label="A2UI template admin">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Admin</p>
          <h2>Templates</h2>
        </div>
        <span className={styles.countText}>{templates.length}</span>
      </div>

      <div className={styles.templateList} aria-label="Registered A2UI templates">
        <div className={styles.templateItems}>
          {catalogError ? <div className={styles.errorBox}>Catalog 서버를 불러오지 못했습니다. {catalogError}</div> : null}
          {isLoading ? <div className={styles.emptyState}>서버 catalog를 불러오는 중입니다.</div> : null}
          {!isLoading && !catalogError && !templates.length ? (
            <div className={styles.emptyState}>등록된 템플릿이 없습니다.</div>
          ) : null}
          {!isLoading && !catalogError
            ? templates.map((template) => (
                <article className={styles.templateItem} key={template.componentId}>
                  <button className={styles.templateRow} type="button" onClick={() => openTemplate(template)}>
                    <span>
                      <strong className={styles.templateTitle}>{template.title}</strong>
                      <span className={styles.templateDescription}>{template.description}</span>
                    </span>
                  </button>
                </article>
              ))
            : null}
        </div>
        <button
          className={styles.addTemplateButton}
          type="button"
          onClick={() => {
            loadTemplate(IMAGE_CARD_REGISTRATION_PRESET);
          }}
        >
          템플릿 추가
        </button>
      </div>
    </section>
  );
}

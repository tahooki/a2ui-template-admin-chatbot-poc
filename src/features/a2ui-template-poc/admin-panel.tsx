"use client";

import { useEffect, useState } from "react";
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
  selectedId,
  onSelect,
  onSave,
}: {
  templates: A2UITemplateRegistration[];
  selectedId: string;
  onSelect: (componentId: string) => void;
  onSave: (template: A2UITemplateRegistration) => void;
}) {
  const selected = templates.find((template) => template.componentId === selectedId) ?? templates[0];
  const [componentId, setComponentId] = useState(selected.componentId);
  const [title, setTitle] = useState(selected.title);
  const [description, setDescription] = useState(selected.description);
  const [selectionGuide, setSelectionGuide] = useState(selected.selectionGuide);
  const [schemaJson, setSchemaJson] = useState(stringify(selected.schemaSpec));
  const [surfaceJson, setSurfaceJson] = useState(stringify(selected.surfaceConfig));
  const [error, setError] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    setComponentId(selected.componentId);
    setTitle(selected.title);
    setDescription(selected.description);
    setSelectionGuide(selected.selectionGuide);
    setSchemaJson(stringify(selected.schemaSpec));
    setSurfaceJson(stringify(selected.surfaceConfig));
    setError(null);
  }, [selected]);

  const imageCardRegistered = templates.some((template) => template.componentId === "equipment.imageCardList");

  function openTemplate(componentId: string) {
    onSelect(componentId);
    setIsDetailOpen(true);
  }

  function handleSave() {
    try {
      const schemaSpec = parseObject(schemaJson, "Schema Spec") as A2UITemplateRegistration["schemaSpec"];
      const surfaceConfig = parseObject(surfaceJson, "Surface Config") as A2UITemplateRegistration["surfaceConfig"];
      if (!componentId.trim() || !title.trim()) {
        throw new Error("Component ID and title are required");
      }
      onSave({
        componentId: componentId.trim(),
        title: title.trim(),
        description: description.trim(),
        selectionGuide: selectionGuide.trim(),
        schemaSpec,
        surfaceConfig,
        status: "registered",
        updatedAt: new Date().toISOString(),
      });
      onSelect(componentId.trim());
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    }
  }

  if (isDetailOpen) {
    return (
      <section className={styles.adminPanel} aria-label="A2UI template admin">
        <button className={styles.backButton} type="button" onClick={() => setIsDetailOpen(false)}>
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
          <label className={styles.fieldLabel}>
            판단 기준
            <textarea rows={4} value={selectionGuide} onChange={(event) => setSelectionGuide(event.target.value)} />
          </label>
        </div>

        <details className={styles.specDisclosure}>
          <summary>매칭 규칙</summary>
          <div className={styles.readOnlyLines}>
            <span>Roles</span>
            <strong>{selected.schemaSpec.requiredRoles.join(", ")}</strong>
            <span>Intent</span>
            <strong>{compactList(selected.schemaSpec.intentKeywords)}</strong>
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
          </div>
        </details>

        {error ? <div className={styles.errorBox}>{error}</div> : null}
        <div className={styles.editorActions}>
          <button className={styles.primaryButton} type="button" onClick={handleSave}>
            저장
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
          {templates.map((template) => (
            <article className={styles.templateItem} key={template.componentId}>
              <button className={styles.templateRow} type="button" onClick={() => openTemplate(template.componentId)}>
                <span>
                  <strong className={styles.templateTitle}>{template.title}</strong>
                  <span className={styles.templateDescription}>{template.description}</span>
                </span>
              </button>
            </article>
          ))}
        </div>
        <button
          className={styles.addTemplateButton}
          disabled={imageCardRegistered}
          type="button"
          onClick={() => {
            onSave(IMAGE_CARD_REGISTRATION_PRESET);
            onSelect(IMAGE_CARD_REGISTRATION_PRESET.componentId);
            setIsDetailOpen(true);
          }}
        >
          템플릿 추가
        </button>
      </div>
    </section>
  );
}

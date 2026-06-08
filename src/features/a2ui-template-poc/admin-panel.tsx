"use client";

import { useEffect, useMemo, useState } from "react";
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

export function AdminPanel({
  templates,
  selectedId,
  onSelect,
  onSave,
  onReset,
}: {
  templates: A2UITemplateRegistration[];
  selectedId: string;
  onSelect: (componentId: string) => void;
  onSave: (template: A2UITemplateRegistration) => void;
  onReset: () => void;
}) {
  const selected = templates.find((template) => template.componentId === selectedId) ?? templates[0];
  const [componentId, setComponentId] = useState(selected.componentId);
  const [title, setTitle] = useState(selected.title);
  const [description, setDescription] = useState(selected.description);
  const [selectionGuide, setSelectionGuide] = useState(selected.selectionGuide);
  const [schemaJson, setSchemaJson] = useState(stringify(selected.schemaSpec));
  const [surfaceJson, setSurfaceJson] = useState(stringify(selected.surfaceConfig));
  const [error, setError] = useState<string | null>(null);

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

  const fieldBadges = useMemo(() => {
    const roles = selected.schemaSpec.requiredRoles.join(", ");
    return [selected.surfaceConfig.viewType, roles, selected.status];
  }, [selected]);

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

  return (
    <section className={styles.adminPanel} aria-label="A2UI template admin">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Admin Registry</p>
          <h2>A2UI Templates</h2>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className={styles.adminGrid}>
        <div className={styles.templateList}>
          <div className={styles.listToolbar}>
            <span>{templates.length} templates</span>
            <button
              className={styles.primaryButton}
              disabled={imageCardRegistered}
              type="button"
              onClick={() => {
                onSave(IMAGE_CARD_REGISTRATION_PRESET);
                onSelect(IMAGE_CARD_REGISTRATION_PRESET.componentId);
              }}
            >
              Add image card
            </button>
          </div>
          {templates.map((template) => (
            <button
              className={`${styles.templateItem} ${template.componentId === selected.componentId ? styles.templateItemActive : ""}`}
              key={template.componentId}
              type="button"
              onClick={() => onSelect(template.componentId)}
            >
              <span className={styles.templateTitle}>{template.title}</span>
              <span className={styles.templateDescription}>{template.description}</span>
              <span className={styles.templateBadgeRow}>
                <span>{template.surfaceConfig.viewType}</span>
                <span>{template.schemaSpec.requiredRoles.join(", ")}</span>
                <span>{template.status}</span>
              </span>
              <span className={styles.templateMeta}>{template.componentId}</span>
            </button>
          ))}
        </div>

        <div className={styles.editorPane}>
          <div className={styles.editorHeader}>
            <div>
              <p className={styles.eyebrow}>Detail Editor</p>
              <h3>{selected.title}</h3>
            </div>
            <div className={styles.badgeRow}>
              {fieldBadges.map((badge) => (
                <span className={styles.softBadge} key={badge}>
                  {badge}
                </span>
              ))}
            </div>
          </div>

          <label className={styles.fieldLabel}>
            A2UI 컴포넌트 ID
            <input value={componentId} onChange={(event) => setComponentId(event.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            Description
            <textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            Selection Guide
            <textarea rows={3} value={selectionGuide} onChange={(event) => setSelectionGuide(event.target.value)} />
          </label>

          <div className={styles.editorSplit}>
            <label className={styles.fieldLabel}>
              Schema Spec
              <textarea
                className={styles.codeTextarea}
                rows={12}
                spellCheck={false}
                value={schemaJson}
                onChange={(event) => setSchemaJson(event.target.value)}
              />
            </label>
            <label className={styles.fieldLabel}>
              Surface Config
              <textarea
                className={styles.codeTextarea}
                rows={12}
                spellCheck={false}
                value={surfaceJson}
                onChange={(event) => setSurfaceJson(event.target.value)}
              />
            </label>
          </div>

          {error ? <div className={styles.errorBox}>{error}</div> : null}
          <div className={styles.editorActions}>
            <button className={styles.primaryButton} type="button" onClick={handleSave}>
              Save template
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

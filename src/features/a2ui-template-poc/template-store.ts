"use client";

import { useEffect, useMemo, useState } from "react";
import { INITIAL_TEMPLATES } from "./initial-templates";
import type { A2UITemplateRegistration } from "./template-types";

const storageKey = "a2ui-template-admin-chatbot-poc:registry";

type PersistedRegistry = {
  templates: A2UITemplateRegistration[];
  version: number;
};

function cloneInitial(): A2UITemplateRegistration[] {
  return INITIAL_TEMPLATES.map((template) => ({ ...template }));
}

function withoutDeprecatedTemplates(templates: A2UITemplateRegistration[]) {
  return templates.filter((template) => template.componentId !== "simpleTextList");
}

function parseRegistry(value: string | null): PersistedRegistry | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PersistedRegistry;
    if (!Array.isArray(parsed.templates) || typeof parsed.version !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useTemplateRegistry() {
  const [templates, setTemplates] = useState<A2UITemplateRegistration[]>(cloneInitial);
  const [version, setVersion] = useState(1);
  const [lastSavedComponentId, setLastSavedComponentId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persisted = parseRegistry(window.localStorage.getItem(storageKey));
    if (persisted) {
      const templates = withoutDeprecatedTemplates(persisted.templates);
      setTemplates(templates.length ? templates : cloneInitial());
      setVersion(persisted.version);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ templates, version }));
  }, [hydrated, templates, version]);

  function saveTemplate(template: A2UITemplateRegistration) {
    const nextTemplate = { ...template, updatedAt: new Date().toISOString() };
    setTemplates((current) => {
      const exists = current.some((item) => item.componentId === nextTemplate.componentId);
      if (!exists) return [...current, nextTemplate];
      return current.map((item) => (item.componentId === nextTemplate.componentId ? nextTemplate : item));
    });
    setVersion((current) => current + 1);
    setLastSavedComponentId(nextTemplate.componentId);
  }

  function resetRegistry() {
    setTemplates(cloneInitial());
    setVersion(1);
    setLastSavedComponentId(null);
  }

  const registeredCount = useMemo(
    () => templates.filter((template) => template.status === "registered").length,
    [templates],
  );

  return {
    templates,
    version,
    registeredCount,
    lastSavedComponentId,
    saveTemplate,
    resetRegistry,
  };
}

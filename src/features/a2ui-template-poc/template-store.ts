"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { A2UITemplateRegistration } from "./template-types";

type TemplateCatalogResponse = {
  templates: A2UITemplateRegistration[];
  version: number;
  updatedAt?: string;
  error?: string;
};

function normalizeCatalog(value: TemplateCatalogResponse): TemplateCatalogResponse {
  return {
    ...value,
    templates: value.templates.filter((template) => template.componentId !== "simpleTextList" && template.componentId !== "equipment.commonStatusTable"),
    version: typeof value.version === "number" ? value.version : 1,
  };
}

async function readCatalog() {
  const response = await fetch("/api/admin/templates", { cache: "no-store" });
  if (!response.ok) throw new Error(`/api/admin/templates failed with ${response.status}`);
  return normalizeCatalog((await response.json()) as TemplateCatalogResponse);
}

export function useTemplateRegistry() {
  const [templates, setTemplates] = useState<A2UITemplateRegistration[]>([]);
  const [version, setVersion] = useState(0);
  const [lastSavedComponentId, setLastSavedComponentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshRegistry = useCallback(async () => {
    setIsLoading(true);
    try {
      const catalog = await readCatalog();
      setTemplates(catalog.templates);
      setVersion(catalog.version);
      setError(null);
      return catalog;
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Template catalog refresh failed");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialCatalog() {
      try {
        const catalog = await readCatalog();
        if (!active) return;
        setTemplates(catalog.templates);
        setVersion(catalog.version);
        setError(null);
      } catch (refreshError) {
        if (!active) return;
        setError(refreshError instanceof Error ? refreshError.message : "Template catalog refresh failed");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadInitialCatalog();

    return () => {
      active = false;
    };
  }, []);

  const saveTemplate = useCallback(async (template: A2UITemplateRegistration) => {
    const response = await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template }),
    });
    const catalog = (await response.json()) as TemplateCatalogResponse;
    if (!response.ok) {
      throw new Error(catalog.error ?? `Template save failed with ${response.status}`);
    }

    const normalized = normalizeCatalog(catalog);
    setTemplates(normalized.templates);
    setVersion(normalized.version);
    setLastSavedComponentId(template.componentId);
    setError(null);
  }, []);

  const resetRegistry = useCallback(async () => {
    const response = await fetch("/api/admin/templates/reset", { method: "POST" });
    const catalog = (await response.json()) as TemplateCatalogResponse;
    if (!response.ok) {
      throw new Error(catalog.error ?? `Template reset failed with ${response.status}`);
    }

    const normalized = normalizeCatalog(catalog);
    setTemplates(normalized.templates);
    setVersion(normalized.version);
    setLastSavedComponentId(null);
    setError(null);
  }, []);

  const registeredCount = useMemo(
    () => templates.filter((template) => template.status === "registered").length,
    [templates],
  );

  return {
    templates,
    version,
    registeredCount,
    lastSavedComponentId,
    error,
    isLoading,
    saveTemplate,
    resetRegistry,
    refreshRegistry,
  };
}

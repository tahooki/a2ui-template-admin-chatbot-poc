import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { COMMON_STATUS_TEMPLATE_ID, INITIAL_TEMPLATES, TELEMETRY_STATUS_TEMPLATE_ID } from "@/features/a2ui-template-poc/initial-templates";
import type { A2UITemplateRegistration } from "@/features/a2ui-template-poc/template-types";
import { normalizeTemplateInputSchema } from "./schema-matcher/template-input-schema-adapter";

export type A2UITemplateCatalog = {
  version: number;
  updatedAt: string;
  templates: A2UITemplateRegistration[];
};

const catalogPath = path.join(process.cwd(), "data", "a2ui-template-catalog.json");

function cloneInitialTemplates() {
  return INITIAL_TEMPLATES.map((template) => ({
    ...normalizeTemplateInputSchema(template),
    updatedAt: "2026-06-09T00:00:00.000Z",
  }));
}

function initialCatalog(): A2UITemplateCatalog {
  return {
    version: 1,
    updatedAt: "2026-06-09T00:00:00.000Z",
    templates: cloneInitialTemplates(),
  };
}

function withoutDeprecatedTemplates(templates: A2UITemplateRegistration[]) {
  return templates.filter((template) => template.componentId !== "simpleTextList");
}

function withRequiredInitialTemplates(templates: A2UITemplateRegistration[]) {
  const normalizedTemplates = templates.map(normalizeTemplateInputSchema);
  const initialTemplates = cloneInitialTemplates();
  const requiredIds = [COMMON_STATUS_TEMPLATE_ID, TELEMETRY_STATUS_TEMPLATE_ID];
  const withRequired = [...normalizedTemplates];

  for (const componentId of requiredIds) {
    if (withRequired.some((template) => template.componentId === componentId)) continue;
    const fixedTemplate = initialTemplates.find((template) => template.componentId === componentId);
    if (fixedTemplate) withRequired.unshift(fixedTemplate);
  }

  return withRequired.map((template) =>
    template.componentId === "equipment.statusBooleanList"
      ? {
          ...template,
          status: "draft" as const,
          description: template.description || "레거시 상태 목록 템플릿이다. 공용 상태 템플릿과 거의 같아 AI 선택 검증에서는 제외한다.",
        }
      : template,
  );
}

function isTemplate(value: unknown): value is A2UITemplateRegistration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const template = value as Partial<A2UITemplateRegistration>;
  return (
    typeof template.componentId === "string" &&
    typeof template.title === "string" &&
    typeof template.description === "string" &&
    typeof template.selectionGuide === "string" &&
    Boolean(template.schemaSpec) &&
    typeof template.schemaSpec === "object" &&
    Boolean(template.surfaceConfig) &&
    typeof template.surfaceConfig === "object"
  );
}

function normalizeCatalog(value: unknown): A2UITemplateCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) return initialCatalog();
  const record = value as Partial<A2UITemplateCatalog>;
  const templates = Array.isArray(record.templates)
    ? withoutDeprecatedTemplates(record.templates.filter(isTemplate))
    : cloneInitialTemplates();

  return {
    version: typeof record.version === "number" ? record.version : 1,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    templates: templates.length ? withRequiredInitialTemplates(templates) : cloneInitialTemplates(),
  };
}

async function ensureCatalogFile() {
  await mkdir(path.dirname(catalogPath), { recursive: true });
  try {
    await readFile(catalogPath, "utf8");
  } catch {
    await writeCatalog(initialCatalog());
  }
}

async function writeCatalog(catalog: A2UITemplateCatalog) {
  await mkdir(path.dirname(catalogPath), { recursive: true });
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

export async function readTemplateCatalog(): Promise<A2UITemplateCatalog> {
  await ensureCatalogFile();
  try {
    const raw = await readFile(catalogPath, "utf8");
    return normalizeCatalog(JSON.parse(raw));
  } catch {
    const fallback = initialCatalog();
    await writeCatalog(fallback);
    return fallback;
  }
}

export async function listTemplates() {
  const catalog = await readTemplateCatalog();
  return catalog.templates;
}

export async function getTemplate(componentId: string) {
  const catalog = await readTemplateCatalog();
  return catalog.templates.find((template) => template.componentId === componentId) ?? null;
}

export async function saveTemplate(template: A2UITemplateRegistration): Promise<A2UITemplateCatalog> {
  const catalog = await readTemplateCatalog();
  const updatedAt = new Date().toISOString();
  const nextTemplate = {
    ...normalizeTemplateInputSchema(template),
    componentId: template.componentId.trim(),
    title: template.title.trim(),
    description: template.description.trim(),
    selectionGuide: template.selectionGuide.trim(),
    status: template.status ?? "registered",
    updatedAt,
  };
  const exists = catalog.templates.some((item) => item.componentId === nextTemplate.componentId);
  const templates = exists
    ? catalog.templates.map((item) => (item.componentId === nextTemplate.componentId ? nextTemplate : item))
    : [...catalog.templates, nextTemplate];
  const nextCatalog = {
    version: catalog.version + 1,
    updatedAt,
    templates: withoutDeprecatedTemplates(templates),
  };
  await writeCatalog(nextCatalog);
  return nextCatalog;
}

export async function deleteTemplate(componentId: string): Promise<A2UITemplateCatalog> {
  const catalog = await readTemplateCatalog();
  const updatedAt = new Date().toISOString();
  const nextCatalog = {
    version: catalog.version + 1,
    updatedAt,
    templates: catalog.templates.filter((template) => template.componentId !== componentId),
  };
  await writeCatalog(nextCatalog);
  return nextCatalog;
}

export async function resetTemplateCatalog(): Promise<A2UITemplateCatalog> {
  const catalog = initialCatalog();
  await writeCatalog(catalog);
  return catalog;
}

export async function templateSummary() {
  const catalog = await readTemplateCatalog();
  return {
    version: catalog.version,
    updatedAt: catalog.updatedAt,
    templates: catalog.templates.map((template) => ({
      componentId: template.componentId,
      title: template.title,
      description: template.description,
      status: template.status,
      schemaSpec: template.schemaSpec,
      surfaceConfig: template.surfaceConfig,
      selectionGuide: template.selectionGuide,
      updatedAt: template.updatedAt,
    })),
  };
}

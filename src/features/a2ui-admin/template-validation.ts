import type { A2UITemplateRegistration } from "@/features/a2ui-core/template-types";

export type TemplateDraft = {
  originalComponentId: string | null;
  componentId: string;
  title: string;
  description: string;
  selectionGuide: string;
  status: A2UITemplateRegistration["status"];
  schemaJson: string;
  inputSchemaJson: string;
  surfaceJson: string;
};

export type TemplateValidation = {
  template: A2UITemplateRegistration | null;
  errors: string[];
};

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(value: string, label: string, errors: string[]) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push(`${label}은 JSON 객체여야 합니다.`);
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    errors.push(`${label} JSON 문법 오류: ${error instanceof Error ? error.message : "확인할 수 없는 오류"}`);
    return null;
  }
}

export function draftFromTemplate(template: A2UITemplateRegistration): TemplateDraft {
  return {
    originalComponentId: template.componentId,
    componentId: template.componentId,
    title: template.title,
    description: template.description,
    selectionGuide: template.selectionGuide,
    status: template.status,
    schemaJson: pretty(template.schemaSpec),
    inputSchemaJson: pretty(template.inputSchema ?? {}),
    surfaceJson: pretty(template.surfaceConfig),
  };
}

export function createTemplateDraft(existingIds: string[]): TemplateDraft {
  let suffix = existingIds.length + 1;
  let componentId = `custom.template-${suffix}`;
  while (existingIds.includes(componentId)) {
    suffix += 1;
    componentId = `custom.template-${suffix}`;
  }

  return {
    originalComponentId: null,
    componentId,
    title: "새 템플릿",
    description: "새 A2UI Surface 템플릿입니다.",
    selectionGuide: "목록 형태의 데이터를 간결하게 표시할 때 사용합니다.",
    status: "draft",
    schemaJson: pretty({
      dataShape: "array<object>",
      listPath: "items",
      requiredRoles: ["title"],
      intentKeywords: ["목록"],
    }),
    inputSchemaJson: pretty({
      schemaVersion: "2026-06-11",
      accepts: { shape: ["array<object>"], minRows: 1 },
      requiredSlots: [
        {
          slot: "items[].title",
          acceptsTypes: ["string"],
          acceptsRoles: ["title", "label"],
          required: true,
        },
      ],
    }),
    surfaceJson: pretty({
      viewType: "collection.list",
      titleBinding: "title",
      maxItems: 12,
    }),
  };
}

export function validateTemplateDraft(
  draft: TemplateDraft,
  existingTemplates: A2UITemplateRegistration[],
): TemplateValidation {
  const errors: string[] = [];
  const componentId = draft.componentId.trim();
  const title = draft.title.trim();
  const description = draft.description.trim();
  const selectionGuide = draft.selectionGuide.trim();

  if (!componentId) errors.push("Component ID가 필요합니다.");
  if (!title) errors.push("템플릿 이름이 필요합니다.");
  if (!description) errors.push("설명이 필요합니다.");
  if (!selectionGuide) errors.push("Selection Guide가 필요합니다.");
  if (existingTemplates.some((template) => (
    template.componentId === componentId && template.componentId !== draft.originalComponentId
  ))) {
    errors.push("같은 Component ID가 이미 Catalog에 있습니다.");
  }

  const schemaSpec = parseJsonObject(draft.schemaJson, "Schema Spec", errors);
  const inputSchemaRecord = parseJsonObject(draft.inputSchemaJson, "Input Schema", errors);
  const surfaceConfig = parseJsonObject(draft.surfaceJson, "Surface Config", errors);

  if (schemaSpec && !Array.isArray(schemaSpec.requiredRoles)) {
    errors.push("Schema Spec의 requiredRoles는 배열이어야 합니다.");
  }
  if (surfaceConfig && typeof surfaceConfig.viewType !== "string") {
    errors.push("Surface Config에 viewType이 필요합니다.");
  }
  if (surfaceConfig && typeof surfaceConfig.titleBinding !== "string") {
    errors.push("Surface Config에 titleBinding이 필요합니다.");
  }

  const hasInputSchema = Boolean(inputSchemaRecord && Object.keys(inputSchemaRecord).length);
  if (hasInputSchema && inputSchemaRecord) {
    if (inputSchemaRecord.schemaVersion !== "2026-06-11") {
      errors.push("Input Schema 버전은 2026-06-11이어야 합니다.");
    }
    const accepts = inputSchemaRecord.accepts;
    if (!accepts || typeof accepts !== "object" || Array.isArray(accepts)) {
      errors.push("Input Schema에 accepts 객체가 필요합니다.");
    } else if (!Array.isArray((accepts as Record<string, unknown>).shape)) {
      errors.push("Input Schema accepts.shape은 배열이어야 합니다.");
    }
    if (!Array.isArray(inputSchemaRecord.requiredSlots)) {
      errors.push("Input Schema requiredSlots는 배열이어야 합니다.");
    }
  }

  if (errors.length || !schemaSpec || !surfaceConfig) return { template: null, errors };

  return {
    errors,
    template: {
      componentId,
      title,
      description,
      selectionGuide,
      status: draft.status,
      schemaSpec: schemaSpec as A2UITemplateRegistration["schemaSpec"],
      inputSchema: hasInputSchema
        ? inputSchemaRecord as A2UITemplateRegistration["inputSchema"]
        : undefined,
      surfaceConfig: surfaceConfig as A2UITemplateRegistration["surfaceConfig"],
      updatedAt: new Date().toISOString(),
    },
  };
}

import type {
  A2UIDataProfile,
  A2UIRenderPlan,
  A2UIRole,
  A2UITemplateRegistration,
  FieldMapping,
} from "./template-types";

const roleOrder: A2UIRole[] = ["title", "content", "description", "image", "booleanFlag", "status"];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]/gi, "");
}

function queryMatches(query: string, terms: string[] = []) {
  const normalizedQuery = normalize(query);
  return terms.filter((term) => normalizedQuery.includes(normalize(term))).length;
}

function fieldForRole(profile: A2UIDataProfile, role: A2UIRole, hints: string[] = []) {
  const exactHint = profile.fields.find((field) => hints.some((hint) => normalize(hint) === normalize(field.key)));
  if (exactHint) return exactHint;
  const looseHint = profile.fields.find((field) => hints.some((hint) => normalize(field.key).includes(normalize(hint))));
  if (looseHint) return looseHint;
  return profile.fields.find((field) => field.roleCandidates.includes(role));
}

function buildMapping(template: A2UITemplateRegistration, profile: A2UIDataProfile): FieldMapping {
  const hints = template.schemaSpec.fieldHints ?? {};
  const title = fieldForRole(profile, "title", hints.title);
  const content =
    fieldForRole(profile, "content", hints.content ?? hints.description) ??
    fieldForRole(profile, "description", hints.description);
  const image = fieldForRole(profile, "image", hints.image);
  const booleanFlags =
    template.surfaceConfig.statusBindings?.length && template.surfaceConfig.viewType === "statusBooleanList"
      ? template.surfaceConfig.statusBindings
      : profile.fields
          .filter((field) => field.type === "boolean" || field.roleCandidates.includes("booleanFlag"))
          .map((field) => field.path);

  return {
    title: template.surfaceConfig.titleBinding || title?.path,
    content: template.surfaceConfig.contentBinding || template.surfaceConfig.descriptionBinding || content?.path,
    image: template.surfaceConfig.imageBinding || image?.path,
    booleanFlags,
  };
}

function hasRequiredRoles(template: A2UITemplateRegistration, profile: A2UIDataProfile) {
  const hints = template.schemaSpec.fieldHints ?? {};
  return template.schemaSpec.requiredRoles.every((role) => {
    if (role === "booleanFlag") return profile.booleanFieldCount >= (template.schemaSpec.minBooleanFields ?? 1);
    return Boolean(fieldForRole(profile, role, hints[role]));
  });
}

export function selectA2UIComponent({
  query,
  profile,
  templates,
  registryVersion,
}: {
  query: string;
  profile: A2UIDataProfile;
  templates: A2UITemplateRegistration[];
  registryVersion: number;
}): A2UIRenderPlan {
  const candidates = templates
    .filter((template) => template.status === "registered" && template.componentId !== "simpleTextList")
    .map((template) => {
      const roleFit = hasRequiredRoles(template, profile);
      if (!roleFit) return null;
      if (template.schemaSpec.dataShape !== profile.shape) return null;
      if (template.schemaSpec.listPath && template.schemaSpec.listPath !== profile.listPath) return null;
      if (template.schemaSpec.minRows && profile.rowCount < template.schemaSpec.minRows) return null;
      if (template.schemaSpec.maxRows && profile.rowCount > template.schemaSpec.maxRows) return null;

      const hints = template.schemaSpec.fieldHints ?? {};
      const hintMatches = roleOrder.reduce((count, role) => {
        const field = fieldForRole(profile, role, hints[role]);
        return count + (field ? 1 : 0);
      }, 0);
      const intentScore = queryMatches(query, template.schemaSpec.intentKeywords) * 12;
      const guideScore = queryMatches(query, template.selectionGuide.split(/[,\s]+/).filter(Boolean)) * 2;
      const specificity = template.schemaSpec.requiredRoles.length * 8;
      const viewBonus =
        template.surfaceConfig.viewType === "imageCardList" && profile.hasImageField
          ? 18
          : template.surfaceConfig.viewType === "statusBooleanList" && profile.booleanFieldCount > 0
            ? 16
            : 0;

      return {
        template,
        score: 35 + hintMatches * 9 + intentScore + guideScore + specificity + viewBonus,
      };
    })
    .filter((candidate): candidate is { template: A2UITemplateRegistration; score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score);

  const selected = candidates[0];
  if (selected) {
    return {
      selectedComponentId: selected.template.componentId,
      viewType: selected.template.surfaceConfig.viewType,
      score: selected.score,
      reason: `${selected.template.title} 스펙이 데이터 프로파일의 required role을 만족했고, 사용자 질문과 selection guide가 맞았습니다.`,
      fieldMapping: buildMapping(selected.template, profile),
      isFallback: false,
      registryVersion,
      maxItems: selected.template.surfaceConfig.maxItems,
    };
  }

  const fallback = templates.find((template) => template.componentId === "simpleTextList") ?? templates[0];
  return {
    selectedComponentId: fallback?.componentId ?? "simpleTextList",
    viewType: "simpleTextList",
    score: 12,
    reason: profile.hasImageField
      ? "이미지 필드가 있는 데이터를 찾았지만, 이미지 표시를 지원하는 등록 A2UI 컴포넌트가 없어 텍스트 fallback을 사용했습니다."
      : "등록된 A2UI 컴포넌트 중 데이터 스펙을 만족하는 항목이 없어 텍스트 fallback을 사용했습니다.",
    fieldMapping: fallback ? buildMapping(fallback, profile) : {},
    isFallback: true,
    registryVersion,
    maxItems: fallback?.surfaceConfig.maxItems,
  };
}

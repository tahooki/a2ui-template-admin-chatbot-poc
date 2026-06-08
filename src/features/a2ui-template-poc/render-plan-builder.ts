import { selectA2UIComponent } from "./component-selector";
import { buildA2UIDataProfile } from "./schema-profiler";
import type { A2UITemplateRegistration } from "./template-types";

export function buildA2UIRenderPlan({
  query,
  data,
  templates,
  registryVersion,
}: {
  query: string;
  data: unknown;
  templates: A2UITemplateRegistration[];
  registryVersion: number;
}) {
  const profile = buildA2UIDataProfile(data);
  const renderPlan = selectA2UIComponent({ query, profile, templates, registryVersion });
  return { profile, renderPlan };
}

import type { A2UIMappingDecision } from "@/features/a2ui-template-poc/template-types";
import type { DerivedSchema } from "./derived-schema-types";
import { hasMappedPath } from "./template-mapping-builder";

export function validateTemplateMapping(mapping: A2UIMappingDecision, derivedSchema: DerivedSchema) {
  const errors: string[] = [];
  if (mapping.missingSlots.length) {
    errors.push(`Missing required slots: ${mapping.missingSlots.join(", ")}`);
  }

  for (const item of mapping.mappings) {
    if (!hasMappedPath(derivedSchema, item.sourcePath)) {
      errors.push(`Unknown source path: ${item.sourcePath}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

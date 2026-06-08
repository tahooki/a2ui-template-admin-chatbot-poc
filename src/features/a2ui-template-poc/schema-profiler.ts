import type { A2UIDataProfile, A2UIRole, FieldProfile } from "./template-types";

function getRows(data: unknown): { rows: Record<string, unknown>[]; listPath?: string } {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      return {
        rows: record.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))),
        listPath: "items",
      };
    }
    return { rows: [record] };
  }

  if (Array.isArray(data)) {
    return {
      rows: data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))),
    };
  }

  return { rows: [] };
}

function inferFieldType(key: string, examples: unknown[]): FieldProfile["type"] {
  const first = examples.find((value) => value !== null && value !== undefined);
  if (typeof first === "boolean") return "boolean";
  if (typeof first === "number") return "number";
  if (typeof first === "string") {
    if (/image|photo|thumbnail/i.test(key) || /\.(png|jpe?g|webp|gif|svg)$/i.test(first) || first.startsWith("/images/")) {
      return "image-url";
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(first)) return "date";
    return "string";
  }
  return "unknown";
}

function roleCandidates(key: string, type: FieldProfile["type"]): A2UIRole[] {
  const roles: A2UIRole[] = [];
  if (/^id$|Id$/.test(key)) roles.push("id");
  if (/name|title|equipmentName/i.test(key)) roles.push("title");
  if (/description|content|summary/i.test(key)) roles.push("content", "description");
  if (type === "image-url" || /image|photo|thumbnail/i.test(key)) roles.push("image");
  if (type === "boolean") roles.push("booleanFlag", "status");
  if (/category|type/i.test(key)) roles.push("category");
  if (/location|zone|site/i.test(key)) roles.push("location");
  if (/updatedAt|date/i.test(key)) roles.push("updatedAt");
  return roles;
}

export function buildA2UIDataProfile(data: unknown): A2UIDataProfile {
  const { rows, listPath } = getRows(data);
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const fields = keys.map((key) => {
    const examples = rows.slice(0, 5).map((row) => row[key]).filter((value) => value !== undefined);
    const type = inferFieldType(key, examples);
    return {
      path: listPath ? `${listPath}[].${key}` : key,
      key,
      type,
      roleCandidates: roleCandidates(key, type),
      examples,
    };
  });

  return {
    shape: rows.length > 0 ? (listPath ? "array<object>" : "object") : "unknown",
    rowCount: rows.length,
    listPath,
    fields,
    booleanFieldCount: fields.filter((field) => field.type === "boolean").length,
    hasImageField: fields.some((field) => field.roleCandidates.includes("image")),
    hasContentField: fields.some((field) => field.roleCandidates.includes("content")),
    hasDescriptionField: fields.some((field) => field.roleCandidates.includes("description")),
  };
}

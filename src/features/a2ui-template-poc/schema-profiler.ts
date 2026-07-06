import type { A2UIDataProfile, A2UIRole, FieldProfile } from "./template-types";
import { preprocessUnknownApiResponse } from "@/server/a2ui-admin/schema-matcher/unknown-api-response-preprocessor";

function roleCandidates(key: string, type: FieldProfile["type"]): A2UIRole[] {
  const roles: A2UIRole[] = [];
  if (/^id$|Id$/.test(key)) roles.push("id");
  if (/name|title|label|equipmentName|명칭|제목/i.test(key)) roles.push("title", "label");
  if (/description|content|summary|설명|요약/i.test(key)) roles.push("content", "description");
  if (type === "image-url" || /image|photo|thumbnail|이미지|사진/i.test(key)) roles.push("image");
  if (type === "boolean") roles.push("booleanFlag", "status");
  if (/status|state|stage|phase|상태|여부/i.test(key)) roles.push("status");
  if (/category|type|분류/i.test(key)) roles.push("category");
  if (/location|zone|site/i.test(key)) roles.push("location");
  if (/startAt|start_at|startedAt|started_at|begin|began|fromDate|startDate|시작|착수/i.test(key)) roles.push("startAt", "time");
  if (/endAt|end_at|endedAt|ended_at|finish|finished|toDate|endDate|완료일|종료|마감/i.test(key)) roles.push("endAt", "time");
  if (/duration|elapsed|leadTime|기간|소요/i.test(key)) roles.push("duration", "metric");
  if (/lane|track|swimlane|team|group|stream|라인|레인|팀|그룹/i.test(key)) roles.push("lane", "category");
  if (/updatedAt|date|time|timestamp|일시|날짜/i.test(key)) roles.push("updatedAt", "time");
  if (type === "number" && /count|total|rate|score|metric|value|amount|avg|average/i.test(key)) roles.push("metric");
  if (type === "number" && /progress|percent|percentage|completion|completeRate|completionRate|doneRatio|done_rate|진행률|완료율|달성률/i.test(key)) roles.push("progress", "metric");
  if (/priority|severity|urgency|rank|우선순위/i.test(key)) roles.push("priority");
  if (/assignee|owner|manager|담당|담당자|responsible|operator/i.test(key)) roles.push("assignee");
  if (/due|deadline|targetDate|target_at|dueAt|due_at|마감일/i.test(key)) roles.push("dueAt", "time");
  if (/actor|author|createdBy|created_by|user|requester/i.test(key)) roles.push("actor");
  if (/^(parentId|parent_id|parent|pid)$/i.test(key)) roles.push("parentId");
  if (/children|childNodes|nodes/i.test(key)) roles.push("children");
  if (/delta|change|diff|variance|growth/i.test(key)) roles.push("delta", "metric");
  if (/unit|currency|uom/i.test(key)) roles.push("unit");
  return Array.from(new Set(roles));
}

export function buildA2UIDataProfile(data: unknown): A2UIDataProfile {
  const observedSource = preprocessUnknownApiResponse({ rawData: data });
  const selected = observedSource.selectedDataset;
  const listPath = selected?.plannerPath;
  const fields: FieldProfile[] = observedSource.fields.map((field) => {
    const type = field.format === "image-url"
      ? "image-url"
      : field.type === "date" || field.type === "datetime"
        ? "date"
        : field.type === "string" || field.type === "number" || field.type === "boolean"
          ? field.type
          : "unknown";
    return {
      path: field.sourcePath,
      key: field.key,
      type,
      roleCandidates: field.roleCandidates.length ? field.roleCandidates : roleCandidates(field.key, type),
      examples: field.examples,
    };
  });
  const shape = selected
    ? selected.kind === "single_object"
      ? "object"
      : selected.itemType === "object"
        ? "array<object>"
        : "unknown"
    : "unknown";

  return {
    shape,
    rowCount: selected?.rowCount ?? 0,
    listPath,
    fields,
    booleanFieldCount: fields.filter((field) => field.type === "boolean").length,
    hasImageField: fields.some((field) => field.roleCandidates.includes("image")),
    hasContentField: fields.some((field) => field.roleCandidates.includes("content")),
    hasDescriptionField: fields.some((field) => field.roleCandidates.includes("description")),
  };
}

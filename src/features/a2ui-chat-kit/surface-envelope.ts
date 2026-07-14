import type {
  A2UIChatSurface,
  A2UIDataProfile,
  A2UIDisplayOption,
  A2UIDisplaySelectionState,
  A2UIRenderPlan,
  A2UISurfaceEnvelope,
} from "./contracts";

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function surfaceFromA2UIEnvelope(value: unknown): A2UIChatSurface | null {
  const eventData = recordValue(value);
  if (!eventData) return null;
  const envelopeRecord = recordValue(eventData.surface) ?? eventData;
  const payload = recordValue(envelopeRecord.payload);
  if (!payload || !("data" in payload)) return null;

  const profile = recordValue(payload.profile);
  const renderPlan = recordValue(payload.renderPlan);
  const fieldMapping = recordValue(renderPlan?.fieldMapping);
  if (!profile || !renderPlan || !fieldMapping) return null;
  if (typeof profile.rowCount !== "number" || typeof renderPlan.viewType !== "string") return null;

  const envelope = envelopeRecord as A2UISurfaceEnvelope;
  return {
    apiTitle: typeof payload.apiTitle === "string" ? payload.apiTitle : "A2UI API",
    apiId: typeof payload.apiId === "string" ? payload.apiId : envelope.templateId ?? "a2ui",
    templateId: envelope.templateId,
    data: payload.data,
    profile: profile as A2UIDataProfile,
    renderPlan: renderPlan as A2UIRenderPlan,
  };
}

export function displaySelectionFromA2UIEvent(value: unknown): A2UIDisplaySelectionState | null {
  const data = recordValue(value);
  if (!data) return null;
  const selectionId = typeof data.selectionId === "string" ? data.selectionId : "";
  const rawOptions = Array.isArray(data.options) ? data.options : [];
  const options = rawOptions.flatMap((rawOption): A2UIDisplayOption[] => {
    const option = recordValue(rawOption);
    if (!option || typeof option.templateId !== "string" || typeof option.label !== "string") return [];
    return [{
      templateId: option.templateId,
      label: option.label,
      score: numberValue(option.score),
      recommended: option.recommended === true,
    }];
  });

  if (!selectionId || !options.length) return null;
  return {
    selectionId,
    message: typeof data.message === "string" ? data.message : "어떤 방식으로 보시겠습니까?",
    options,
    status: "idle",
  };
}

export function a2uiErrorMessage(value: unknown) {
  const data = recordValue(value) ?? {};
  const message = typeof data.message === "string" ? data.message : "A2UI 응답을 처리하는 중 오류가 발생했습니다.";
  const details = typeof data.details === "string" ? data.details : "";
  const errorType = typeof data.errorType === "string" ? data.errorType : "";
  const reason = [errorType, details].filter(Boolean).join(": ");
  return reason && reason !== message ? `${message}\n원인: ${reason}` : message;
}

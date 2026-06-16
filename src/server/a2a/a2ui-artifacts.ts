import type {
  A2AArtifact,
  A2AMessage,
  A2ARole,
  A2ATask,
  A2ATaskState,
  A2ATraceArtifactData,
  A2UIDecisionArtifactData,
} from "./a2a-types";
import { A2A_SURFACE, A2A_TRACE } from "./a2a-types";

export function newA2AId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function message(role: A2ARole, text: string, contextId?: string): A2AMessage {
  return {
    messageId: newA2AId("msg"),
    contextId,
    role,
    parts: [{ text }],
  };
}

export function surfaceArtifact(data: A2UIDecisionArtifactData): A2AArtifact {
  return {
    artifactId: newA2AId("surface"),
    name: "A2UI SurfaceEnvelope",
    description: "Validated A2UI surface selected by the A2UI Agent.",
    parts: [
      {
        data,
        mediaType: A2A_SURFACE,
      },
    ],
  };
}

export function traceArtifact(data: A2ATraceArtifactData): A2AArtifact {
  return {
    artifactId: newA2AId("trace"),
    name: "A2UI matcher trace",
    description: "A2UI template matcher decision trace.",
    parts: [
      {
        data,
        mediaType: A2A_TRACE,
      },
    ],
  };
}

export function task({
  id = newA2AId("task"),
  contextId,
  state,
  text,
  artifacts,
  metadata,
}: {
  id?: string;
  contextId?: string;
  state: A2ATaskState;
  text?: string;
  artifacts?: A2AArtifact[];
  metadata?: Record<string, unknown>;
}): A2ATask {
  return {
    id,
    contextId,
    status: {
      state,
      message: text ? message("ROLE_AGENT", text, contextId) : undefined,
    },
    artifacts,
    metadata,
  };
}

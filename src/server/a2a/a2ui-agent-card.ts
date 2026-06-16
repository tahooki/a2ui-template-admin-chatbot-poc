import { A2A_ACTION, A2A_RENDER_REQUEST, A2A_SURFACE, A2A_VERSION } from "./a2a-types";

export function buildA2UIAgentCard(origin: string) {
  return {
    name: "A2UI Agent",
    description: "Selects registered A2UI templates and returns validated SurfaceEnvelope artifacts.",
    version: "0.1.0",
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    supportedInterfaces: [
      {
        url: new URL("/api/a2a", origin).toString().replace(/\/$/, ""),
        protocolBinding: "HTTP+JSON",
        protocolVersion: A2A_VERSION,
      },
    ],
    defaultInputModes: ["text/plain", A2A_RENDER_REQUEST, A2A_ACTION],
    defaultOutputModes: ["text/plain", A2A_SURFACE],
    skills: [
      {
        id: "a2ui.render-surface",
        name: "Render A2UI surface",
        description: "Selects the best registered template from derived schema and returns a SurfaceEnvelope artifact.",
        inputModes: ["text/plain", A2A_RENDER_REQUEST],
        outputModes: ["text/plain", A2A_SURFACE],
      },
      {
        id: "a2ui.execute-action",
        name: "Execute A2UI action",
        description: "Handles A2UI action requests and may return an updated surface artifact.",
        inputModes: [A2A_ACTION],
        outputModes: ["text/plain", A2A_SURFACE],
      },
    ],
  };
}

# A2UI Template Python Agent

This package is the demo agent backend for the A2UI template admin/chatbot POC.

It receives a chat request, calls the equipment API from the Next app, asks the A2UI Agent which template to use, and streams text plus an optional `SurfaceEnvelope`.

The default local path uses the Next-hosted A2A facade.

The agent routes API intent with deterministic regex rules. OpenAI-compatible chat completions are only used for general/non-surface fallback text generation in the Python agent, while A2UI template matching has its own LLM-backed flow. The Python agent reads these values from process env, the repo root `.env.local`, or this package's `.env.local`:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

For an internal company gateway, point `OPENAI_BASE_URL` at the internal OpenAI-compatible `/v1` endpoint. The API key value is never required in source code.

The Python Agent calls the Next app equipment routes at `http://localhost:3001` by default. Override `A2UI_NEXT_API_BASE_URL` only if the Next app runs on a different host or port.

For external-source testing, run the standalone equipment data source server from the repo root and set the override env values:

```bash
npm run equipment-source:dev
A2UI_EQUIPMENT_STATUS_API_URL=http://localhost:8100/equipment-status
A2UI_EQUIPMENT_CATALOG_API_URL=http://localhost:8100/equipment-catalog
```

## Run

```bash
npm run setup:agent
npm run main-agent:dev
```

Keep the Next app running at `http://localhost:3001`. The A2A URL defaults to `http://localhost:3001/api/a2a`.

The Next chat route proxies to `http://localhost:8000` by default. Set `MAIN_AGENT_URL` only when the agent is not running on the default port:

```bash
MAIN_AGENT_URL=http://localhost:8000
```

If the Python agent is unavailable, `/api/chat` streams an `error` event instead of rendering a local deterministic fallback. The POC should show real Agent/A2A wiring, so a missing agent must be visible during verification.

Main-agent API selection is rule-based for demos. Check `/health` for `intentRouter: "regex"`, then confirm a chat stream emits intent state with `source: "regex"` before presenting A2UI's matcher steps as the LLM-backed part of the flow.

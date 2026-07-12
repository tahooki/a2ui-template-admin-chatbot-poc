# Main Agent

This package is the business Main Agent for the A2UI template admin/chatbot POC.

It receives a chat request, calls the equipment API from the Next app, and streams user-facing text plus a structured `data_result` containing the raw business data and source metadata.

The active Chatbot path does not call A2UI from this package. `packages/a2ui-proxy-agent` receives `data_result` and calls the Next-hosted A2A facade.

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

Keep the Next app running at `http://localhost:3001`; the Main Agent uses its fixture/business API routes.

The A2UI Proxy Agent calls the Main Agent at `http://localhost:8000` by default. Set `MAIN_AGENT_URL` only when the Main Agent is not running on the default port:

```bash
MAIN_AGENT_URL=http://localhost:8000
```

If the Main Agent is unavailable, the Proxy Agent streams an `error` event instead of generating local business data.

Main Agent API selection is rule-based for demos. Check `/health` for `intentRouter: "regex"`, then confirm its chat stream emits intent state with `source: "regex"` followed by a `data_result` event.

# A2UI Template Python Agent

This package is the demo agent backend for the A2UI template admin/chatbot POC.

It receives a chat request, calls the equipment API from the Next app, asks the A2UI Agent which template to use, and streams text plus an optional `SurfaceEnvelope`.

The default compatibility path still uses the Admin MCP endpoint. Set `A2UI_A2A_ENABLED=true` to use the Next-hosted A2A facade first.

The agent requires OpenAI-compatible chat completions for intent routing and non-surface text generation. It reads these values from process env, the repo root `.env.local`, or this package's `.env.local`:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

For an internal company gateway, point `OPENAI_BASE_URL` at the internal OpenAI-compatible `/v1` endpoint. The API key value is never required in source code.

Equipment data must come from configured API sources. The Next equipment routes do not generate mock rows internally:

```bash
A2UI_EQUIPMENT_STATUS_API_URL=https://example.internal/equipment-status
A2UI_EQUIPMENT_CATALOG_API_URL=https://example.internal/equipment-catalog
```

For local development, run the equipment data source server from the repo root:

```bash
npm run equipment-source:dev
```

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
A2UI_MCP_URL=http://localhost:4100/mcp \
A2UI_A2A_ENABLED=true \
A2UI_A2A_URL=http://localhost:3000/api/a2a \
A2UI_A2A_FALLBACK_TO_MCP=true \
A2UI_NEXT_API_BASE_URL=http://localhost:3000 \
OPENAI_API_KEY=... \
OPENAI_MODEL=gpt-4.1-mini \
OPENAI_BASE_URL=https://api.openai.com/v1 \
python -m uvicorn app.main:app --reload --port 8000
```

For the lightweight Admin MCP proxy:

```bash
npm run mcp:dev
```

For direct Next-hosted MCP without the proxy, set:

```bash
A2UI_MCP_URL=http://localhost:3000/api/mcp
```

For the A2A path, keep the Next app running and set:

```bash
A2UI_A2A_ENABLED=true
A2UI_A2A_URL=http://localhost:3000/api/a2a
```

If `A2UI_A2A_FALLBACK_TO_MCP=true`, transport failures in the A2A call fall back to the legacy MCP client. A completed A2A text fallback does not call MCP again.

The Next chat route proxies to this agent by default. Set the URL in the Next app process when the agent is not running on the default port:

```bash
PYTHON_AGENT_URL=http://localhost:8000
```

If the Python agent is unavailable, `/api/chat` streams an `error` event instead of rendering a local deterministic fallback. The POC should show real Agent/MCP wiring, so a missing agent must be visible during verification.

If `OPENAI_API_KEY` is unavailable or the LLM request fails, `/api/chat` streams an `error` event. There is no rule-based intent fallback. Check `/health` for `llmConfigured: true`, then confirm a chat stream emits intent state with `source: "llm"` before presenting this as a real LLM-backed Agent demo.

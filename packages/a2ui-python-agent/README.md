# Main Agent

This package is the business Main Agent for the A2UI template admin/chatbot POC.

It receives a chat request and streams user-facing text plus a structured `data_result` containing business data and source metadata.

The active Chatbot path does not call an external business API, MCP, template Admin, or A2A server from this package. The nine demo datasets are generated inside the Main Agent by `app/local_business_data.py`. `packages/a2ui-proxy-agent` receives `data_result` and builds one of its three static Surfaces directly.

The dataset IDs such as `equipment-status` and `work-items` remain part of the response contract, but they no longer represent an HTTP request.

The agent routes data intent with deterministic regex rules. OpenAI-compatible chat completions are only used for general questions and text summaries. A2UI data mode works without an LLM call. The Python agent reads these values from process env, the repo root `.env.local`, or this package's `.env.local`:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

For an internal company gateway, point `OPENAI_BASE_URL` at the internal OpenAI-compatible `/v1` endpoint. The API key value is never required in source code.

## Run

```bash
npm run setup:agent
npm run main-agent:dev
```

The Main Agent runs at `http://localhost:8000`. The Next app does not need to be running when the Main Agent API is called directly.

The A2UI Proxy Agent calls the Main Agent at `http://localhost:8000` by default. Set `MAIN_AGENT_URL` only when the Main Agent is not running on the default port:

```bash
MAIN_AGENT_URL=http://localhost:8000
```

If the Main Agent is unavailable, the Proxy Agent streams an `error` event instead of generating local business data.

Main Agent dataset selection is rule-based for demos. Check `/health` for `intentRouter: "regex"` and `businessDataSource: "local"`, then confirm its chat stream emits an intent state with `source: "regex"` followed by a `data_result` event.

The Next app is still needed when using the repository's browser Chatbot UI because it serves the frontend. The browser calls the A2UI Proxy Agent directly; there is no Next `/api/chat` facade. The Next app is not a business-data dependency of the Main Agent.

# A2UI Proxy Agent

The Proxy Agent sits between the Chatbot and Main Agent.

```text
Chatbot -> A2UI Proxy Agent -> Main Agent -> business data
                    |
                    +-> derived schema
                    +-> OpenAI template comparison
                    +-> display options
                    +-> OpenAI field mapping -> selected Surface
```

It relays Main Agent text events, keeps `data_result` server-side, and exposes exactly three display options:

- `collection.list`
- `collection.cardGrid`
- `matrix.table`

The Proxy creates a bounded and masked data preview plus a derived schema, then calls an OpenAI-compatible Chat Completions endpoint. The prompt includes the required JSON schema, and the Proxy validates every response before using it. The first AI stage evaluates all three template contracts and recommends one. After the user selects any option, the second AI stage maps exact source paths to that template's slots. The Proxy validates the mapping, converts only the visible source rows into the selected template schema, and returns the Surface directly.

The AI planner is part of this Python Proxy process. It does not call an MCP server, A2A Agent, template Admin, or a separate surface-planner server. A missing or failed OpenAI configuration is returned as an error; the Proxy does not silently replace the main AI behavior with field-name heuristics.

## Standalone copy and run

This directory is self-contained. Copy the entire `a2ui-proxy-agent` directory into another repository, then run:

```bash
cd a2ui-proxy-agent
cp .env.example .env.local
python3 run.py
```

`run.py` automatically:

1. creates `./.venv` when it does not exist;
2. installs `requirements.txt` when dependencies have not been installed or the file changed;
3. starts Uvicorn on `0.0.0.0:8200`.

Set the Main Agent address and the OpenAI key used by the Proxy-owned A2UI planner:

```env
MAIN_AGENT_URL=http://main-agent-host:8000
OPENAI_API_KEY=...
```

The Main Agent must expose `POST /chat/stream` as an SSE endpoint. Redis, MCP, the template Admin, and the A2A server are not required by this Proxy.

The browser calls this service directly. For a deployed Chatbot, set the exact
browser origin:

```env
A2UI_PROXY_ALLOWED_ORIGINS=https://chatbot.example.com
```

Do not treat CORS as authentication. Put the Proxy behind an API gateway that
validates the user's access token and limits request rates. When the Main Agent
accepts the same user token, set `A2UI_FORWARD_AUTHORIZATION=true`. When it
uses one service credential instead, set `MAIN_AGENT_BEARER_TOKEN`.

Available runtime settings:

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `MAIN_AGENT_URL` | `http://localhost:8000` | Main Agent base URL |
| `MAIN_AGENT_TIMEOUT_SECONDS` | `45` | Main Agent response timeout |
| `MAIN_AGENT_BEARER_TOKEN` | none | Optional service credential for Main Agent |
| `A2UI_FORWARD_AUTHORIZATION` | `false` | Forward the browser Authorization header to Main Agent |
| `A2UI_SELECTION_TTL_SECONDS` | `300` | In-memory selection lifetime |
| `A2UI_SELECTION_MAX_ENTRIES` | `100` | Maximum in-memory pending selections |
| `OPENAI_API_KEY` | none | Required Proxy A2UI planner credential |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Template selection and field-mapping model |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `A2UI_AI_TIMEOUT_SECONDS` | `100` | Timeout for each AI planning call |
| `A2UI_FLOW_LOG_MAX_CHARS` | `50000` | Maximum characters per structured flow log |
| `A2UI_FLOW_LOG_INCLUDE_PAYLOADS` | `false` | Include request, business data, and AI payloads in logs |
| `A2UI_EXPOSE_ERROR_DETAILS` | `false` | Return internal exception details to the browser |
| `A2UI_PROXY_ALLOWED_ORIGINS` | local ports 3000/3001 | Comma-separated browser origins |
| `A2UI_PROXY_ALLOW_CREDENTIALS` | `false` | Allow cross-origin browser credentials |
| `A2UI_PROXY_HOST` | `0.0.0.0` | Proxy bind host |
| `A2UI_PROXY_PORT` or `PORT` | `8200` | Proxy bind port |
| `A2UI_PROXY_RELOAD` | unset | Enable development reload |

Environment variables supplied by the process take priority over `.env.local`.

For a prebuilt container or virtualenv where dependencies are installed during the build, use:

```bash
python3 run.py --no-install
```

The repository-level `npm run proxy-agent:dev` command delegates to this same standalone runner with reload enabled.
`npm run proxy-agent:test` also prepares and uses the Proxy-owned `.venv`; neither command depends on the Main Agent virtualenv.

## Runtime limits

- Chat messages and each history item are limited to 8,000 characters.
- A request may include at most 30 history items.
- Pending selections are bounded by `A2UI_SELECTION_MAX_ENTRIES`.
- Only one field-mapping operation may use a selection at a time.
- The returned Surface includes at most the selected template's `maxItems`;
  `data.total` and `profile.rowCount` still describe the full source row count.
- The in-memory Selection Store requires one Proxy worker or sticky routing.
  Restarts invalidate pending selections. Use a shared store before running
  multiple workers or replicas.

## Health checks

`GET /health` is a liveness and configuration summary that does not expose
internal service addresses. `GET /ready` returns `503` until `OPENAI_API_KEY`
is configured.

## Flow logs

Every A2UI request writes ordered flow logs to the Proxy server output. Each line starts with `[a2ui-proxy-agent][flow]` and includes a `step`, `turnId` or `selectionId`, and either `previousResult` or `result`.

```text
00_proxy_request_received
01_before_main_agent_call
02_main_agent_event_received
03_before_schema_derivation
04_schema_derived
05_before_ai_template_selection
openai_structured_request_sent
openai_structured_response_received
06_ai_template_selection_completed
07_display_options_ready
08_display_selection_request_received
09_before_ai_slot_mapping
openai_structured_request_sent
openai_structured_response_received
10_ai_slot_mapping_completed
11_before_surface_build
12_surface_built
```

Request bodies are not logged. Flow payloads are summarized by default, and
sensitive key names such as token, password, authorization, email, phone, and
API key are masked. Set `A2UI_FLOW_LOG_INCLUDE_PAYLOADS=true` only in a
controlled debugging environment. Exceptionally large lines are marked with
`<truncated ... chars>`.

# A2UI Proxy Agent

The Proxy Agent accepts browser chat requests and can use either one
replaceable mock JSON file or a remote Main Agent as its data source.

```text
Chatbot -> A2UI Proxy Agent -> work-items JSON (mock mode)
                    or -> Main Agent (remote mode)
                    |
                    +-> current-request routing / OpenAI general chat
                    +-> OpenAI data summary (text mode)
                    +-> derived schema
                    +-> OpenAI template comparison
                    +-> display options
                    +-> OpenAI field mapping -> selected Surface
```

It converts either source into the same internal `data_result`, keeps that raw
data server-side, and exposes exactly three display options:

- `collection.list`
- `collection.cardGrid`
- `matrix.table`

The Proxy creates a bounded and masked data preview plus a derived schema, then calls an OpenAI-compatible Chat Completions endpoint. The prompt includes the required JSON schema, and the Proxy validates every response before using it. After chat routing, the template-selection AI stage evaluates all three template contracts and recommends one. After the user selects any option, the field-mapping AI stage maps exact source paths to that template's slots. The Proxy validates the mapping, converts only the visible source rows into the selected template schema, and returns the Surface directly.

In mock mode, chat routing runs before the work-items JSON is read and returns
`intent`, `shouldUseA2UI`, `reason`, and `responseText`. Clear data wording in
the current message is handled deterministically so older general or text-mode
history cannot cancel the new request. Ambiguous and general conversation is
handled by the LLM:

- General conversation returns the LLM's `responseText` and never enters the
  A2UI planner, even when `presentationMode` is `a2ui`.
- A work-items request reads the mock JSON. It enters the A2UI planner only
  when `presentationMode` is `a2ui` and `shouldUseA2UI` is `true`.
- A work-items request in `text` mode sends a bounded and masked data preview
  to the Proxy LLM and returns its Korean summary without template selection
  or field mapping. The old fixed "data loaded" message is not user-facing.

The Proxy derives `shouldUseA2UI` from the resolved intent and the current
request's `presentationMode`. History may clarify a short follow-up such as
"표로 보여줘", but it cannot override an explicit current data request.

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

The included `.env.example` runs without a Main Agent. Set the OpenAI key used
by the Proxy-owned A2UI planner:

```env
MAIN_AGENT_MODE=mock
MOCK_MAIN_AGENT_DATA_FILE=mock-data/work-items.json
OPENAI_API_KEY=...
```

In mock mode the Proxy reads `mock-data/work-items.json` for every chat
request. It does not call a Main Agent. Redis, MCP, the template Admin, and the
A2A server are not required.

## Replace the work-items JSON

Only one mock scenario is supported: `work-items`. Replace the configured JSON
file while keeping this contract:

```json
{
  "apiId": "work-items",
  "sourceToolName": "mock_work_items",
  "data": {
    "items": [
      {
        "id": "WORK-001",
        "title": "Example work item",
        "description": "Example description",
        "status": "queued",
        "priority": "high"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 1
  },
  "metadata": {
    "sourceRowCount": 1
  }
}
```

The Proxy reloads the file on the next request, so replacing valid JSON does
not require a restart. The file must be UTF-8 JSON, no larger than 5 MiB, and
must contain `apiId`, `data`, and a non-empty `data.items` array for an A2UI
surface. The Proxy creates the request query, mock result ID, row count, and
SHA-256 data hash at runtime.

For containers, mount the file outside the image and use an absolute path:

```env
MOCK_MAIN_AGENT_DATA_FILE=/data/a2ui/work-items.json
```

To restore the real upstream flow, use:

```env
MAIN_AGENT_MODE=remote
MAIN_AGENT_URL=http://main-agent-host:8000
```

The remote Main Agent must expose `POST /chat/stream` as an SSE endpoint.

The browser calls this service directly. For a deployed Chatbot, set the exact
browser origin:

```env
A2UI_PROXY_ALLOWED_ORIGINS=https://chatbot.example.com
```

Do not treat CORS as authentication. Put the Proxy behind an API gateway that
validates the user's access token and limits request rates. Remote mode can
forward the user token with `A2UI_FORWARD_AUTHORIZATION=true`, or use the
service credential in `MAIN_AGENT_BEARER_TOKEN`.

Available runtime settings:

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `MAIN_AGENT_MODE` | `mock` | `mock` reads the work-items JSON; `remote` calls Main Agent |
| `MOCK_MAIN_AGENT_DATA_FILE` | `mock-data/work-items.json` | Replaceable work-items JSON path |
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
- Mock JSON files are limited to 5 MiB and reloaded for every request.
- Pending selections are bounded by `A2UI_SELECTION_MAX_ENTRIES`.
- Only one field-mapping operation may use a selection at a time.
- The returned Surface includes at most the selected template's `maxItems`;
  `data.total` and `profile.rowCount` still describe the full source row count.
- The in-memory Selection Store requires one Proxy worker or sticky routing.
  Restarts invalidate pending selections. Use a shared store before running
  multiple workers or replicas.

## Health checks

`GET /health` is a liveness and configuration summary that includes
`mainAgentMode` but does not expose internal service addresses. `GET /ready`
returns `503` until `OPENAI_API_KEY` is configured and the selected Main Agent
source is valid. In mock mode that includes reading and validating the JSON.

## Flow logs

Every A2UI request writes ordered flow logs to the Proxy server output. Each line starts with `[a2ui-proxy-agent][flow]` and includes a `step`, `turnId` or `selectionId`, and either `previousResult` or `result`.

```text
00_proxy_request_received
01_before_proxy_chat_routing        # mock mode
02_proxy_chat_routing_completed     # mock mode
01_before_main_agent_call
02_main_agent_event_received
03_before_ai_text_summary          # mock text mode
04_ai_text_summary_completed       # mock text mode
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

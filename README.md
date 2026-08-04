# A2UI Template Admin Chatbot POC

This project is a local A2UI admin/chatbot proof of concept.

Runtime flow:

```text
Chat UI (browser)
  -> A2UI Proxy Agent(:8200)
  -> work-items JSON (mock mode, no Main Agent)
     or Main Agent(:8000) (remote mode)
  -> internal data_result
  -> A2UI Proxy Agent
  -> Proxy-owned AI planner / three static template candidates
  -> user display selection
  -> selected A2UI Surface
  -> browser renderer
```

In mock mode the Proxy first resolves `intent` and `shouldUseA2UI`. A clear
data request in the current message always wins over older chat history, and
the request's current `presentationMode` decides whether A2UI is used. General
conversation returns a normal LLM text response without reading the mock JSON.
A data request in `text` mode is summarized by the Proxy LLM; the same request
in `a2ui` mode enters template selection and field mapping.

The Next app serves the Chat UI only. It does not provide a chat BFF; the
browser calls the Proxy Agent's SSE endpoints directly.

## Getting Started

Install Node dependencies:

```bash
npm install
```

Create the Python virtual environment used by the agent services:

```bash
npm run setup:agent
```

The setup command works on macOS, Linux, and Windows. It creates `packages/a2ui-python-agent/.venv` and installs `packages/a2ui-python-agent/requirements.txt`.

Start all local services:

```bash
npm run dev:all
```

If the combined command does not work in your local environment, start the required services in separate terminals:

```bash
npm run web:dev
npm run main-agent:dev
npm run proxy-agent:dev
```

The combined dev command starts:

```text
Next app:              http://localhost:3001
Main Agent:            http://localhost:8000
A2UI Proxy Agent:      http://localhost:8200
```

Open [http://localhost:3001](http://localhost:3001) in the browser.

To run the work-items mock without calling Main Agent, set these values and
start only the web and Proxy processes:

```env
MAIN_AGENT_MODE=mock
MOCK_MAIN_AGENT_DATA_FILE=mock-data/work-items.json
```

```bash
npm run web:dev
npm run proxy-agent:dev
```

## Internal LLM Setup

Create a local `.env.local` file in the repo root. Do not commit real keys.

```bash
OPENAI_API_KEY=사내_게이트웨이_키
OPENAI_MODEL=사내모델명
OPENAI_BASE_URL=https://사내-llm-gateway.example.com/v1
```

Local service URLs default to `http://localhost:3001` for Next/A2A, `http://localhost:8000` for the Main Agent, and `http://localhost:8200` for the A2UI Proxy Agent. You only need URL env overrides if you change those ports.

When the browser must reach a Proxy Agent at another address, set the public
URL before starting or building the Next app:

```bash
NEXT_PUBLIC_A2UI_PROXY_AGENT_URL=https://a2ui-proxy.example.com
```

Next.js embeds this value into the browser bundle at build time. The Proxy
must allow the Chat UI origin through CORS and must use HTTPS when the Chat UI
is served over HTTPS.

Configure the Proxy server with the same browser origin:

```bash
A2UI_PROXY_ALLOWED_ORIGINS=https://chatbot.example.com
```

The Next equipment API routes work without equipment-source env variables. They serve local fixture data by default:

```text
GET http://localhost:3001/api/equipment-status
GET http://localhost:3001/api/equipment-catalog
GET http://localhost:3001/api/equipment-status-wide-columns
GET http://localhost:3001/api/equipment-status-large-rows
```

To proxy status/catalog to an external equipment source instead, set `A2UI_EQUIPMENT_STATUS_API_URL` and `A2UI_EQUIPMENT_CATALOG_API_URL`. If those env values point at a local source such as `localhost:8100` and that source is not running, the routes fall back to the local fixtures.

The Main Agent and Proxy-owned A2UI planner expect an OpenAI-compatible chat completions endpoint:

```text
POST {OPENAI_BASE_URL}/chat/completions
```

If the internal LLM gateway is not OpenAI-compatible, adapt the request and response handling in `packages/a2ui-python-agent/app/ai/llm_client.py`.

## Health Checks

Check that the Main Agent can read the LLM settings:

```bash
curl http://localhost:8000/health
```

Expected signals:

```json
{
  "ok": true,
  "llmConfigured": true,
  "openaiModel": "사내모델명"
}
```

Check the Proxy Agent:

```bash
curl http://localhost:8200/health
```

The response should include `mainAgentMode`, `selectionTtlSeconds`,
`selectionMaxEntries`, `aiConfigured`, and `templateIds`. Readiness can be
checked separately:

```bash
curl http://localhost:8200/ready
```

## Proxy Agent Responsibilities

In remote mode, the Main Agent no longer calls A2UI directly. For a data
request it emits:

```text
state -> text -> data_result -> done
```

In mock mode, the Proxy creates the same internal `data_result` from the single
replaceable `packages/a2ui-proxy-agent/mock-data/work-items.json` file and does
not call Main Agent. Before reading that file, the Proxy separates general
conversation from data requests. Explicit data wording in the current message
has priority over history, so switching from text or general conversation to
A2UI works within the same chat. General conversation returns text; only a data
request in A2UI mode continues to the three static templates. The Proxy keeps
raw data server-side and exposes only `display_options` to the browser. After
the user chooses a template, the Proxy returns the selected `surface` event.

Chat requests also accept `presentationMode: "a2ui" | "text"` and default to
`a2ui`. In mock `text` mode the Proxy LLM summarizes a bounded, masked preview
of the work-items JSON and does not run template selection or field mapping.
In remote `text` mode the Main Agent supplies the text response. See
`src/features/a2ui-chat-kit/README.md` for the direct browser integration.

For local development the selection context is stored in Proxy Agent memory for five minutes. Restarting the Proxy invalidates pending choices. Run one Proxy worker unless a shared selection store or sticky routing is added.

Check the Next app:

```bash
curl -I http://localhost:3001/
```

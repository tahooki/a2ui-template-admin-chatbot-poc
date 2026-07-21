# A2UI Template Admin Chatbot POC

This project is a local A2UI admin/chatbot proof of concept.

Runtime flow:

```text
Chat UI
  -> Next /api/chat
  -> A2UI Proxy Agent(:8200)
  -> Main Agent(:8000)
  -> business API data_result
  -> A2UI Proxy Agent
  -> A2A A2UI Agent / template candidates
  -> user display selection
  -> selected A2UI Surface
  -> browser renderer
```

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

## Internal LLM Setup

Create a local `.env.local` file in the repo root. Do not commit real keys.

```bash
OPENAI_API_KEY=사내_게이트웨이_키
OPENAI_MODEL=사내모델명
OPENAI_BASE_URL=https://사내-llm-gateway.example.com/v1
```

Local service URLs default to `http://localhost:3001` for Next/A2A, `http://localhost:8000` for the Main Agent, and `http://localhost:8200` for the A2UI Proxy Agent. You only need URL env overrides if you change those ports.

The Next equipment API routes work without equipment-source env variables. They serve local fixture data by default:

```text
GET http://localhost:3001/api/equipment-status
GET http://localhost:3001/api/equipment-catalog
GET http://localhost:3001/api/equipment-status-wide-columns
GET http://localhost:3001/api/equipment-status-large-rows
```

To proxy status/catalog to an external equipment source instead, set `A2UI_EQUIPMENT_STATUS_API_URL` and `A2UI_EQUIPMENT_CATALOG_API_URL`. If those env values point at a local source such as `localhost:8100` and that source is not running, the routes fall back to the local fixtures.

The Main Agent and Next-hosted A2UI planner expect an OpenAI-compatible chat completions endpoint:

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

The response should include `mainAgentUrl`, `a2aUrl`, and `selectionTtlSeconds`.

## Proxy Agent Responsibilities

The Main Agent no longer calls A2UI directly. For a data request it emits:

```text
state -> text -> data_result -> done
```

`data_result` contains the raw business data and source integrity metadata. The Proxy Agent keeps that event server-side, sends the data to the A2UI Agent, and exposes only `display_options` to the browser. After the user chooses a template, the Proxy returns the selected `surface` event.

Chat requests also accept `presentationMode: "a2ui" | "text"` and default to `a2ui`. In `text` mode the Main Agent returns a bounded, masked data summary and the Proxy does not call the A2UI Agent. See `docs/20260721_external-chatbot-a2ui-text-toggle-guide.md` for the external chatbot integration steps.

For local development the selection context is stored in Proxy Agent memory for five minutes. Restarting the Proxy invalidates pending choices.

Check the Next app:

```bash
curl -I http://localhost:3001/
```

# A2UI Template Admin Chatbot POC

This project is a local A2UI admin/chatbot proof of concept.

Runtime flow:

```text
Chat UI -> Next /api/chat -> Python Agent(:8000) -> LLM / equipment APIs -> A2UI template layer -> SSE -> browser
```

## Getting Started

Install Node dependencies:

```bash
npm install
```

Create the Python virtual environment used by the agent services:

```bash
python3 -m venv packages/a2ui-python-agent/.venv
packages/a2ui-python-agent/.venv/bin/pip install -r packages/a2ui-python-agent/requirements.txt
```

Start all local services:

```bash
npm run dev:all
```

If the combined command does not work in your local environment, start the required services in separate terminals:

```bash
npm run web:dev
npm run main-agent:dev
```

The combined dev command starts:

```text
Next app:              http://localhost:3001
Python Agent:          http://localhost:8000
```

Open [http://localhost:3001](http://localhost:3001) in the browser.

## Internal LLM Setup

Create a local `.env.local` file in the repo root. Do not commit real keys.

```bash
OPENAI_API_KEY=사내_게이트웨이_키
OPENAI_MODEL=사내모델명
OPENAI_BASE_URL=https://사내-llm-gateway.example.com/v1
```

Local service URLs default to `http://localhost:3001` for Next/A2A and `http://localhost:8000` for the Python Agent. You only need URL env overrides if you change those ports.

The Next equipment API routes work without equipment-source env variables. They serve local fixture data by default:

```text
GET http://localhost:3001/api/equipment-status
GET http://localhost:3001/api/equipment-catalog
GET http://localhost:3001/api/equipment-status-wide-columns
GET http://localhost:3001/api/equipment-status-large-rows
```

To proxy status/catalog to an external equipment source instead, set `A2UI_EQUIPMENT_STATUS_API_URL` and `A2UI_EQUIPMENT_CATALOG_API_URL`. If those env values point at a local source such as `localhost:8100` and that source is not running, the routes fall back to the local fixtures.

The Python Agent expects an OpenAI-compatible chat completions endpoint:

```text
POST {OPENAI_BASE_URL}/chat/completions
```

If the internal LLM gateway is not OpenAI-compatible, adapt the request and response handling in `packages/a2ui-python-agent/app/ai/llm_client.py`.

## Health Checks

Check that the Python Agent can read the LLM settings:

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

Check the Next app:

```bash
curl -I http://localhost:3001/
```

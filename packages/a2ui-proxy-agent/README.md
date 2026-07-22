# A2UI Proxy Agent

The Proxy Agent sits between the Chatbot and Main Agent.

```text
Chatbot -> A2UI Proxy Agent -> Main Agent -> business data
                    |
                    +-> static templates -> display options -> selected Surface
```

It relays Main Agent text events, keeps `data_result` server-side, and exposes exactly three display options:

- `collection.list`
- `collection.cardGrid`
- `matrix.table`

After the user selects an option, the Proxy normalizes the business data, builds the field mapping, and returns the Surface directly. It does not call an MCP server, A2A Agent, template Admin, or external surface planner.

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

The only environment value that normally needs to change is the Main Agent address:

```env
MAIN_AGENT_URL=http://main-agent-host:8000
```

The Main Agent must expose `POST /chat/stream` as an SSE endpoint. Redis, MCP, the template Admin, and the A2A server are not required by this Proxy.

Available runtime settings:

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `MAIN_AGENT_URL` | `http://localhost:8000` | Main Agent base URL |
| `MAIN_AGENT_TIMEOUT_SECONDS` | `45` | Main Agent response timeout |
| `A2UI_SELECTION_TTL_SECONDS` | `300` | In-memory selection lifetime |
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

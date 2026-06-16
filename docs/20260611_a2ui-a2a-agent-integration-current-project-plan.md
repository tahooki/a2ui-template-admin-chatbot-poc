# A2UI A2A Agent 전환 현재 프로젝트 적용 계획

Date: 2026-06-11

Source reference:

- `/Users/tahooki/Documents/git/a2ui-poc-rt-new-3/docs/20260610_a2ui-a2a-agent-integration-plan.md`
- `docs/20260609_real-agent-mcp-python-integration-plan.md`
- `docs/20260611_derived-schema-a2ui-template-matcher-current-project-plan.md`
- A2A official specification: `https://a2a-protocol.org/latest/specification/`
- A2A and MCP guide: `https://a2a-protocol.org/latest/topics/a2a-and-mcp/`

Review note:

- 원본 문서는 독립 `a2ui-runtime`, `a2ui-a2a-agent`, `demo-agent-server` 분리를 전제로 한다.
- 현재 repo는 이미 `src/server/a2ui-admin/a2ui-runtime.ts`에 matcher/resolver runtime이 있고, Python Host Agent는 `packages/a2ui-python-agent`에 있다.
- 따라서 이 문서는 대규모 workspace 분리보다 `Next-hosted A2A facade -> Python Host Agent A2A client -> 이후 standalone A2UI Agent 분리` 순서로 좁힌다.
- A2A v1 기준으로 protocol-level `kind` discriminator는 새 응답에 넣지 않는다. `kind: "a2ui.render.request"` 같은 값은 A2UI application payload의 `data.kind`로만 사용한다.
- 2026-06-11 구현에서 Next-hosted A2A facade, Agent Card, `message:send`, `message:stream`, in-memory task lookup/subscribe replay, Python A2A client, A2A-first/MCP-fallback switch, action no-op을 반영했다.
- 2026-06-12 검수에서 task lookup/subscribe도 token 설정 시 인증을 타도록 맞췄고, body 없는 subscribe replay, surface decision reason 전달을 보정했다.

## 1. 목적

현재 프로젝트의 대화 흐름은 다음과 같다.

```text
Chat UI
-> Next /api/chat
-> Python Agent /chat/stream
-> equipment API
-> A2UI MCP JSON-RPC endpoint
-> a2ui.recommendTemplate
-> a2ui.resolveTemplateData
-> SurfaceEnvelope
-> Chat UI render
```

이번 계획의 목표는 "MCP를 제거"가 아니다. 목표는 Chatbot/Host Agent가 A2UI MCP tool을 직접 호출하지 않게 하고, A2UI 선택과 surface 생성 책임을 A2A remote agent boundary 뒤로 숨기는 것이다.

목표 흐름:

```text
Chat UI
-> Next /api/chat
-> Python Host Agent
-> A2A client
-> A2UI Agent over HTTP+JSON
-> current A2UI runtime
-> A2A Task artifact(application/vnd.a2ui.surface+json)
-> Python Host Agent SSE
-> Chat UI render
```

이 구조가 되면 Host Agent는 "사용자 의도 이해, 장비 데이터 조회, 필요한 preview/schema 구성"만 맡고, A2UI Agent는 "템플릿 catalog 조회, matcher, mapping validation, SurfaceEnvelope 생성"을 맡는다.

## 2. 현재 프로젝트 기준선

| 영역 | 현재 파일 | 상태 |
| --- | --- | --- |
| Next Chat proxy | `src/app/api/chat/route.ts` | Python `/chat/stream`을 SSE proxy |
| Python Host Agent | `packages/a2ui-python-agent/app/orchestrate.py` | 장비 API 호출, preview/schema 생성, MCP 호출 |
| Python MCP client | `packages/a2ui-python-agent/app/a2ui_agent.py` | `A2UIMcpClient`, `render_or_fallback()` |
| A2UI runtime | `src/server/a2ui-admin/a2ui-runtime.ts` | `recommendTemplate`, `resolveTemplateData`, `toolResult` |
| schema matcher | `src/server/a2ui-admin/schema-matcher/*` | `DerivedSchema`, candidates, mapping trace |
| MCP endpoint | `src/app/api/mcp/route.ts` | JSON-RPC-compatible tool endpoint |
| MCP proxy | `packages/a2ui-admin-mcp-server/server.mjs` | `4100/mcp` proxy |
| Catalog | `data/a2ui-template-catalog.json` | Admin REST와 runtime이 공유 |
| Renderer | `src/features/a2ui-template-poc/a2ui-demo-renderer.tsx` | SurfaceEnvelope 렌더 |

이미 derivedSchema matcher가 들어갔기 때문에 A2A Agent는 처음부터 새 matcher를 만들 필요가 없다. 첫 구현은 기존 `recommendTemplate()`와 `resolveTemplateData()`를 직접 호출하는 A2A facade로 시작한다.

## 3. 프로토콜 적용 원칙

### 3.1 A2A와 MCP의 역할

| 구분 | MCP | A2A |
| --- | --- | --- |
| 현재 용도 | A2UI tool 직접 호출 | 없음 |
| 전환 후 용도 | A2UI Agent 내부 legacy/debug 또는 Admin tool boundary | Host Agent와 A2UI Agent 사이의 공식 agent boundary |
| 호출 주체 | Python Host Agent | Python Host Agent |
| 응답 모델 | tool result JSON | Task, Message, Artifact |

전환 후에도 `/api/mcp`와 `npm run mcp:dev`는 바로 삭제하지 않는다. Admin/debug/compatibility 용도로 남기되, 기본 Chat path는 A2A를 사용한다.

### 3.2 A2A HTTP+JSON binding

이 POC는 JSON-RPC binding이 아니라 HTTP+JSON/REST binding으로 시작한다.

지원 endpoint:

```text
GET  /.well-known/agent-card.json
GET  /.well-known/agent.json
POST /api/a2a/message:send
POST /api/a2a/message:stream
GET  /api/a2a/tasks/{id}
POST /api/a2a/tasks/{id}:subscribe
```

Headers:

```http
Content-Type: application/a2a+json
Accept: application/a2a+json
A2A-Version: 1.0
Authorization: Bearer <optional-local-token>
```

주의:

- `A2A-Version`은 `Major.Minor`만 보낸다.
- Agent Card의 `supportedInterfaces[].protocolVersion`과 request header가 일치해야 한다.
- v1 protocol object의 `Part`는 `{ "text": "..." }`, `{ "data": {...}, "mediaType": "..." }` 형태를 사용한다.
- source plan의 legacy-style `kind` discriminator는 protocol object에 넣지 않는다.
- A2UI application payload 안의 `data.kind`는 유지한다.

## 4. 현재 프로젝트용 목표 아키텍처

### 4.1 Phase 1 아키텍처

```text
Next app :3000
  - Admin UI
  - /api/admin/templates
  - /api/mcp                 legacy/debug
  - /.well-known/agent-card.json
  - /api/a2a/*               A2UI A2A facade
  - src/server/a2ui-admin/*  current runtime

Python Host Agent :8000
  - /chat/stream
  - equipment_tools.py
  - schema/derived_schema.py
  - a2a_client.py            new
```

이 단계에서는 A2UI Agent가 Next route handler 안에 있다. 이유는 현재 A2UI runtime이 TypeScript 서버 모듈에 있고, 이를 Python으로 복제하면 matcher/source of truth가 둘로 갈라지기 때문이다.

### 4.2 Phase 2 아키텍처

```text
Python Host Agent
-> http://localhost:3200/a2a/message:send

Standalone A2UI Agent :3200
  - same A2A contract
  - same runtime modules or extracted package
  - catalog bundle reader
```

Phase 2에서만 `packages/a2ui-a2a-agent` 또는 `packages/a2ui-runtime` 분리를 검토한다. Phase 1에서 A2A contract와 Host Agent 전환이 먼저 증명되어야 한다.

## 5. A2A request/response contract

### 5.1 Render request

Host Agent는 장비 API raw response 전체를 A2A에 무제한으로 싣지 않는다. 현재 구현처럼 bounded `sampleDataPreview`와 `derivedSchema`를 만든 뒤 전송한다.

다만 Phase 1의 현재 runtime은 `resolveTemplateData()`에서 renderer payload용 `data`를 요구한다. 그래서 Host Agent는 선택 기준으로는 `sampleDataPreview`/`derivedSchema`를 쓰고, 렌더에 필요한 현재 장비 API 응답은 크기 제한을 둔 `facts.data`로 함께 전달한다. 이후 resolver chain이나 data reference 방식이 생기면 `facts.data`를 더 줄인다.

```json
{
  "configuration": {
    "acceptedOutputModes": [
      "application/vnd.a2ui.surface+json",
      "text/plain"
    ],
    "returnImmediately": false
  },
  "message": {
    "messageId": "msg-uuid",
    "contextId": "conversation-uuid",
    "role": "ROLE_USER",
    "parts": [
      {
        "text": "장비 상태 보여줘"
      },
      {
        "data": {
          "kind": "a2ui.render.request",
          "query": "장비 상태 보여줘",
          "intentKey": "equipment.status.lookup",
          "facts": {
            "apiId": "equipment-status",
            "data": {
              "items": [
                {
                  "id": "cnc-01",
                  "name": "CNC-01",
                  "isOnline": true,
                  "isRunning": true,
                  "hasAlarm": false,
                  "needsInspection": false,
                  "isReserved": true
                }
              ],
              "total": 1,
              "page": 1,
              "pageSize": 1
            }
          },
          "sampleDataPreview": {},
          "derivedSchema": {},
          "a2uiOptions": {
            "includeTrace": true,
            "allowLegacyIntentFallback": true
          }
        },
        "mediaType": "application/vnd.a2ui.render-request+json"
      }
    ]
  }
}
```

### 5.2 Surface artifact response

A2UI Agent는 surface를 status message text에 섞지 않고 artifact로 반환한다.

```json
{
  "task": {
    "id": "task-uuid",
    "contextId": "conversation-uuid",
    "status": {
      "state": "TASK_STATE_COMPLETED",
      "message": {
        "role": "ROLE_AGENT",
        "parts": [
          {
            "text": "장비 목록을 이미지 카드 A2UI로 준비했습니다."
          }
        ],
        "messageId": "msg-agent-uuid"
      }
    },
    "artifacts": [
      {
        "artifactId": "surface-uuid",
        "name": "A2UI SurfaceEnvelope",
        "parts": [
          {
            "data": {
              "kind": "a2ui.surface.response",
              "surface": {},
              "decision": {
                "mode": "render_surface",
                "strategy": "derived_schema",
                "score": 0.86,
                "templateId": "equipment.imageCardList",
                "candidates": [],
                "mapping": {}
              }
            },
            "mediaType": "application/vnd.a2ui.surface+json"
          }
        ]
      }
    ]
  }
}
```

### 5.3 Fallback response

Template match가 실패하면 completed task와 text message를 반환한다. Host Agent는 이 값을 기존 deterministic/LLM fallback text와 병합할 수 있다.

```json
{
  "task": {
    "id": "task-uuid",
    "status": {
      "state": "TASK_STATE_COMPLETED",
      "message": {
        "role": "ROLE_AGENT",
        "parts": [
          {
            "text": "- CNC-01: 정밀 가공 메인 장비, 상태 ready"
          }
        ]
      }
    },
    "metadata": {
      "a2uiTaskKind": "text_fallback",
      "reason": "No registered template matched image data."
    }
  }
}
```

### 5.4 Streaming response

`message:stream`은 SSE로 다음 이벤트를 보낸다.

```text
data: {"task":{"id":"task-uuid","status":{"state":"TASK_STATE_WORKING"}}}

data: {"statusUpdate":{"taskId":"task-uuid","status":{"state":"TASK_STATE_WORKING","message":{"role":"ROLE_AGENT","parts":[{"text":"데이터 스키마를 분석하고 있습니다."}]}}}}

data: {"artifactUpdate":{"taskId":"task-uuid","artifact":{"artifactId":"trace-uuid","parts":[{"data":{"matcherStrategy":"derived_schema","candidateCount":3},"mediaType":"application/json"}]}}}

data: {"artifactUpdate":{"taskId":"task-uuid","artifact":{"artifactId":"surface-uuid","parts":[{"data":{"kind":"a2ui.surface.response","surface":{}},"mediaType":"application/vnd.a2ui.surface+json"}]}}}

data: {"statusUpdate":{"taskId":"task-uuid","status":{"state":"TASK_STATE_COMPLETED"}}}
```

Python Host Agent는 이 stream을 받아 현재 Next Chat SSE로 변환한다.

```text
A2A statusUpdate text -> event:text
A2A trace artifact    -> event:state { status: "matcher" }
A2A surface artifact  -> event:surface
terminal state        -> event:done
```

## 6. 구현 파일 계획

### 6.1 Next A2A facade

신규 파일:

| 파일 | 역할 |
| --- | --- |
| `src/server/a2a/a2a-types.ts` | 현재 POC에서 필요한 최소 A2A DTO와 parser |
| `src/server/a2a/a2ui-agent-card.ts` | Agent Card builder |
| `src/server/a2a/a2ui-message-handler.ts` | render/action request 처리 |
| `src/server/a2a/a2ui-task-store.ts` | in-memory task store |
| `src/server/a2a/a2ui-artifacts.ts` | surface/text/failure artifact builder |
| `src/app/api/a2a/[...operation]/route.ts` | `message:send`, `message:stream`, `tasks/*` dispatch |
| `src/app/.well-known/agent-card.json/route.ts` | public Agent Card |
| `src/app/.well-known/agent.json/route.ts` | compatibility alias |

핵심 구현 규칙:

- A2A route는 `executeA2UITool()`을 우회하고 `recommendTemplate()`/`resolveTemplateData()`를 직접 호출한다.
- MCP JSON-RPC shape를 A2A 내부에 끌고 오지 않는다.
- `application/vnd.a2ui.render-request+json` data part가 없으면 text fallback 또는 validation error로 처리한다.
- `sampleDataPreview.rowCount`, `derivedSchema.rowCount`, matcher candidates를 response metadata/artifact에 보존한다.
- route handler는 `nodejs` runtime과 `force-dynamic`을 사용한다.

### 6.2 Python Host Agent

신규/수정 파일:

| 파일 | 역할 |
| --- | --- |
| `packages/a2ui-python-agent/app/a2a_client.py` | HTTP+JSON A2A client |
| `packages/a2ui-python-agent/app/a2ui_agent.py` | MCP client fallback을 유지하면서 A2A 우선 호출 |
| `packages/a2ui-python-agent/app/config.py` | `A2UI_A2A_URL`, `A2UI_A2A_ENABLED`, `A2UI_A2A_TOKEN` |
| `packages/a2ui-python-agent/app/orchestrate.py` | state label을 `mcp`에서 `a2a`로 전환 |
| `packages/a2ui-python-agent/tests/test_a2a_client.py` | artifact extraction test |

전환 규칙:

```text
if A2UI_A2A_ENABLED=true:
  render_or_fallback() -> A2UIA2AClient
else:
  render_or_fallback() -> legacy A2UIMcpClient
```

기본값은 검증이 끝날 때까지 `false`로 둘 수 있다. A2A path가 검증되면 `.env.local`/README에서 기본 데모 path를 A2A로 바꾼다.

### 6.3 UI/Chat

수정 대상:

- `src/features/a2ui-template-poc/chatbot-panel.tsx`
- `src/features/a2ui-template-poc/a2ui-demo-renderer.tsx`
- 필요 시 `src/features/a2ui-template-poc/template-types.ts`

기존 Chat UI가 이미 `event:state`, `event:text`, `event:surface`, `event:done`을 받으므로 UI 변경은 최소화한다. 단, matcher trace label은 `mcp`가 아니라 `a2a` 또는 `a2ui-agent`로 보여야 한다.

## 7. Agent Card 계획

`GET /.well-known/agent-card.json` 응답은 다음 의도를 가진다.

```json
{
  "name": "A2UI Agent",
  "description": "Selects registered A2UI templates and returns validated SurfaceEnvelope artifacts.",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "extendedAgentCard": false
  },
  "supportedInterfaces": [
    {
      "url": "http://localhost:3000/api/a2a",
      "protocolBinding": "HTTP+JSON",
      "protocolVersion": "1.0"
    }
  ],
  "defaultInputModes": [
    "text/plain",
    "application/vnd.a2ui.render-request+json",
    "application/vnd.a2ui.action+json"
  ],
  "defaultOutputModes": [
    "text/plain",
    "application/vnd.a2ui.surface+json"
  ],
  "skills": [
    {
      "id": "a2ui.render-surface",
      "name": "Render A2UI surface",
      "description": "Selects the best registered template from derived schema and returns a SurfaceEnvelope artifact."
    },
    {
      "id": "a2ui.execute-action",
      "name": "Execute A2UI action",
      "description": "Handles A2UI action requests and may return an updated surface artifact."
    }
  ]
}
```

운영 전환 전까지 localhost HTTP URL은 POC 전용이다. production Agent Card는 HTTPS absolute URL을 사용한다.

## 8. Action 흐름

Phase 1에서는 action을 read-only 또는 no-op으로 둔다. Phase 2에서 다음 흐름을 추가한다.

```text
User clicks A2UI action
-> Chat UI action endpoint
-> Python Host Agent or Next action proxy
-> A2UI Agent POST /message:send with message.taskId
-> A2UI Agent validates action
-> returns text result or refreshed surface artifact
```

Action request part:

```json
{
  "data": {
    "kind": "a2ui.action.request",
    "templateId": "equipment.statusBooleanList",
    "actionId": "refresh",
    "params": {},
    "surfaceMeta": {
      "matcherStrategy": "derived_schema"
    }
  },
  "mediaType": "application/vnd.a2ui.action+json"
}
```

## 9. 실패와 fallback

| 상황 | A2UI Agent 응답 | Host Agent 처리 |
| --- | --- | --- |
| template match 성공 | `TASK_STATE_COMPLETED` + surface artifact | `event:surface` |
| template 없음 | `TASK_STATE_COMPLETED` + text fallback | 기존 fallback text 또는 agent text |
| 추가 정보 필요 | `TASK_STATE_INPUT_REQUIRED` + message | follow-up 질문 |
| request validation 실패 | HTTP 400 problem/error JSON | text fallback + internal log |
| A2A version mismatch | HTTP 400 version error | Agent Card 재조회 후 fallback |
| A2UI Agent down | timeout/HTTP error | legacy MCP 또는 text fallback |
| surface validation 실패 | failed task 또는 text fallback | surface 렌더 금지 |

Fallback 정책:

1. A2A enabled이고 성공하면 A2A 결과를 사용한다.
2. A2A transport error면 `A2UI_A2A_FALLBACK_TO_MCP=true`일 때만 legacy MCP를 호출한다.
3. A2A 결과가 text fallback이면 legacy MCP를 다시 호출하지 않는다.
4. 최종적으로 surface가 없으면 현재 Python deterministic/LLM fallback text를 사용한다.

## 10. 보안과 데이터 원칙

- Agent Card에는 secret, 내부 token, 민감한 path를 넣지 않는다.
- local POC에서는 token optional로 시작한다.
- `A2UI_A2A_TOKEN`이 있으면 Python client가 `Authorization: Bearer`를 보낸다.
- A2A route는 token 설정 시 bearer token을 검증한다.
- `sampleDataPreview`는 bounded/masked 상태로만 전송한다.
- raw 대용량 API response를 artifact/task history에 저장하지 않는다.
- `data/a2ui-template-catalog.json`은 template catalog source of truth로 유지한다.
- task store는 Phase 1에서 in-memory이며 재시작 시 사라져도 된다.

## 11. 구현 단계

### Phase 0. Contract 보정

- [x] A2A v1 current JSON shape를 기준으로 `kind` discriminator 없는 DTO를 확정한다.
- [x] `ROLE_USER`, `ROLE_AGENT`, `TASK_STATE_*` boundary enum과 내부 lowercase enum normalize 함수를 만든다.
- [x] A2UI payload `data.kind` 값 목록을 확정한다.
- [x] `application/vnd.a2ui.render-request+json`, `application/vnd.a2ui.surface+json`, `application/vnd.a2ui.action+json` media type을 상수화한다.

### Phase 1. Next-hosted A2UI A2A facade

- [x] `src/server/a2a/*` 최소 모듈을 만든다.
- [x] `/.well-known/agent-card.json` endpoint를 만든다.
- [x] `/.well-known/agent.json` alias endpoint를 만든다.
- [x] `/api/a2a/[...operation]` route에서 `message:send`를 처리한다.
- [x] render request data part를 찾아 `recommendTemplate()`를 호출한다.
- [x] render_surface 결정이면 `resolveTemplateData()`를 호출한다.
- [x] SurfaceEnvelope을 `application/vnd.a2ui.surface+json` artifact로 감싼다.
- [x] text fallback, input-required, failed response builder를 만든다.
- [x] `GET /api/a2a/tasks/{id}`가 in-memory task를 반환하게 한다.

### Phase 2. A2A streaming

- [x] `/api/a2a/message:stream` SSE route를 만든다.
- [x] working task event를 먼저 보낸다.
- [x] schema/profile 분석 statusUpdate를 보낸다.
- [x] matcher candidates trace를 artifactUpdate로 보낸다.
- [x] surface artifactUpdate를 보낸다.
- [x] terminal statusUpdate를 보낸다.
- [x] `tasks/{id}:subscribe`는 Phase 1 stream 재구독 수준으로만 구현하거나 명시적으로 unsupported를 반환한다.

### Phase 3. Python Host Agent 전환

- [x] `A2UI_A2A_URL` 기본값을 `http://localhost:3000/api/a2a`로 추가한다.
- [x] `A2UI_A2A_ENABLED` feature flag를 추가한다.
- [x] `A2UIA2AClient.send_message()`를 구현한다.
- [x] `A2UIA2AClient.stream_message()`를 구현한다.
- [x] `application/vnd.a2ui.surface+json` artifact 추출 helper를 만든다.
- [x] `render_or_fallback()`이 A2A 우선, MCP fallback 선택 구조를 갖게 한다.
- [x] `stream_chat_turn()` state label을 `a2a`로 바꾸고 matcher trace를 유지한다.

### Phase 4. UI trace 정리

- [x] Chat state에서 `mcp` label을 `a2ui-agent` 또는 `a2a`로 바꾼다.
- [x] matcher trace에 `strategy`, `score`, `candidateCount`, `candidates`, `mapping`이 계속 표시되는지 확인한다.
- [x] A2A surface artifact가 기존 `A2UIDemoRenderer`에 그대로 들어가는지 확인한다.
- [x] fallback 응답에서는 surface panel이 남지 않는지 확인한다.

### Phase 5. Standalone 분리 검토

- [ ] Phase 1/2가 끝난 뒤 `packages/a2ui-a2a-agent` 분리 필요성을 판단한다.
- [ ] 분리 시 `src/server/a2ui-admin` runtime을 `packages/a2ui-runtime`으로 추출할지 결정한다.
- [ ] catalog bundle 파일(`data/a2ui-catalog.bundle.json`)이 필요한지, 현재 catalog JSON으로 충분한지 결정한다.
- [ ] standalone port는 `3200`, base URL은 `http://localhost:3200`으로 둔다.

## 12. 검증 계획

기본 실행:

```bash
npm run dev
npm run python-agent:dev
```

MCP fallback 검증이 필요할 때만:

```bash
npm run mcp:dev
```

Agent Card:

```bash
curl -s http://localhost:3000/.well-known/agent-card.json | jq
curl -s http://localhost:3000/.well-known/agent.json | jq
```

Sync render:

```bash
cat <<'JSON' | curl -s http://localhost:3000/api/a2a/message:send \
  -H 'Content-Type: application/a2a+json' \
  -H 'A2A-Version: 1.0' \
  -d @- | jq
{
  "configuration": {
    "acceptedOutputModes": ["application/vnd.a2ui.surface+json", "text/plain"],
    "returnImmediately": false
  },
  "message": {
    "messageId": "msg-status-smoke",
    "role": "ROLE_USER",
    "parts": [
      { "text": "장비 상태 보여줘" },
      {
        "mediaType": "application/vnd.a2ui.render-request+json",
        "data": {
          "kind": "a2ui.render.request",
          "query": "장비 상태 보여줘",
          "intentKey": "equipment.status.lookup",
          "facts": {
            "apiId": "equipment-status",
            "data": {
              "items": [
                {
                  "id": "cnc-01",
                  "name": "CNC-01",
                  "isOnline": true,
                  "isRunning": true,
                  "hasAlarm": false,
                  "needsInspection": false,
                  "isReserved": true
                }
              ],
              "total": 1,
              "page": 1,
              "pageSize": 1
            }
          },
          "sampleDataPreview": {
            "sourceId": "equipment-status",
            "sourceKind": "api_response",
            "shape": "array<object>",
            "primaryArrayPath": "items",
            "rowCount": 1,
            "sampleSize": 1,
            "truncated": false,
            "byteLength": 180,
            "maskedFields": [],
            "data": {
              "items": [
                {
                  "id": "cnc-01",
                  "name": "CNC-01",
                  "isOnline": true,
                  "isRunning": true,
                  "hasAlarm": false,
                  "needsInspection": false,
                  "isReserved": true
                }
              ],
              "total": 1,
              "page": 1,
              "pageSize": 1
            }
          },
          "derivedSchema": {
            "sourceId": "equipment-status",
            "sourceKind": "api_response",
            "shape": "array<object>",
            "primaryArrayPath": "items",
            "rowCount": 1,
            "sampleSize": 1,
            "fields": [
              { "path": "items.name", "key": "name", "type": "string", "role": "title", "roles": ["title", "label"], "examples": ["CNC-01"] },
              { "path": "items.isOnline", "key": "isOnline", "type": "boolean", "role": "booleanFlag", "roles": ["booleanFlag", "status"], "examples": [true] },
              { "path": "items.isRunning", "key": "isRunning", "type": "boolean", "role": "booleanFlag", "roles": ["booleanFlag", "status"], "examples": [true] },
              { "path": "items.hasAlarm", "key": "hasAlarm", "type": "boolean", "role": "booleanFlag", "roles": ["booleanFlag", "status"], "examples": [false] }
            ],
            "capabilities": {
              "hasImages": false,
              "hasBooleans": true,
              "hasStatus": true,
              "hasTimeField": false,
              "hasNumericMetrics": false,
              "hasCategories": false,
              "hasNestedObjects": false,
              "hasActions": false
            }
          },
          "a2uiOptions": {
            "includeTrace": true,
            "allowLegacyIntentFallback": true
          }
        }
      }
    ]
  }
}
JSON
```

Streaming render:

```bash
cat <<'JSON' | curl -N http://localhost:3000/api/a2a/message:stream \
  -H 'Content-Type: application/a2a+json' \
  -H 'Accept: text/event-stream' \
  -H 'A2A-Version: 1.0' \
  -d @-
{
  "configuration": {
    "acceptedOutputModes": ["application/vnd.a2ui.surface+json", "text/plain"]
  },
  "message": {
    "messageId": "msg-status-stream-smoke",
    "role": "ROLE_USER",
    "parts": [
      { "text": "장비 상태 보여줘" },
      {
        "mediaType": "application/vnd.a2ui.render-request+json",
        "data": {
          "kind": "a2ui.render.request",
          "query": "장비 상태 보여줘",
          "intentKey": "equipment.status.lookup",
          "facts": {
            "apiId": "equipment-status",
            "data": {
              "items": [
                {
                  "id": "cnc-01",
                  "name": "CNC-01",
                  "isOnline": true,
                  "isRunning": true,
                  "hasAlarm": false,
                  "needsInspection": false,
                  "isReserved": true
                }
              ],
              "total": 1,
              "page": 1,
              "pageSize": 1
            }
          },
          "sampleDataPreview": {
            "sourceId": "equipment-status",
            "sourceKind": "api_response",
            "shape": "array<object>",
            "primaryArrayPath": "items",
            "rowCount": 1,
            "sampleSize": 1,
            "truncated": false,
            "byteLength": 180,
            "maskedFields": [],
            "data": {
              "items": [
                {
                  "id": "cnc-01",
                  "name": "CNC-01",
                  "isOnline": true,
                  "isRunning": true,
                  "hasAlarm": false,
                  "needsInspection": false,
                  "isReserved": true
                }
              ],
              "total": 1,
              "page": 1,
              "pageSize": 1
            }
          },
          "derivedSchema": {
            "sourceId": "equipment-status",
            "sourceKind": "api_response",
            "shape": "array<object>",
            "primaryArrayPath": "items",
            "rowCount": 1,
            "sampleSize": 1,
            "fields": [
              { "path": "items.name", "key": "name", "type": "string", "role": "title", "roles": ["title", "label"], "examples": ["CNC-01"] },
              { "path": "items.isOnline", "key": "isOnline", "type": "boolean", "role": "booleanFlag", "roles": ["booleanFlag", "status"], "examples": [true] },
              { "path": "items.isRunning", "key": "isRunning", "type": "boolean", "role": "booleanFlag", "roles": ["booleanFlag", "status"], "examples": [true] },
              { "path": "items.hasAlarm", "key": "hasAlarm", "type": "boolean", "role": "booleanFlag", "roles": ["booleanFlag", "status"], "examples": [false] }
            ],
            "capabilities": {
              "hasImages": false,
              "hasBooleans": true,
              "hasStatus": true,
              "hasTimeField": false,
              "hasNumericMetrics": false,
              "hasCategories": false,
              "hasNestedObjects": false,
              "hasActions": false
            }
          },
          "a2uiOptions": {
            "includeTrace": true,
            "allowLegacyIntentFallback": true
          }
        }
      }
    ]
  }
}
JSON
```

Python Host Agent:

```bash
A2UI_A2A_ENABLED=true \
A2UI_A2A_URL=http://localhost:3000/api/a2a \
npm run python-agent:dev
```

Regression:

```bash
npm run python-agent:test
npm run lint
npm run build
```

성공 기준:

- Agent Card가 `supportedInterfaces`와 `a2ui.render-surface` skill을 반환한다.
- `/api/a2a/message:send`가 current catalog를 읽고 surface artifact를 반환한다.
- `/api/a2a/message:stream`이 statusUpdate, trace artifactUpdate, surface artifactUpdate를 순서대로 보낸다.
- Python `/chat/stream`이 MCP tool 직접 호출 없이 A2A surface를 Chat UI까지 전달한다.
- `sampleDataPreview.rowCount`, matcher `candidates`, `mapping`이 trace에서 사라지지 않는다.
- A2A 장애 시 legacy MCP 또는 text fallback이 동작한다.

## 13. 이번 단계에서 하지 않을 것

- `/api/mcp` 삭제
- `packages/a2ui-admin-mcp-server` 삭제
- production auth/mTLS 완성
- push notification config 구현
- persistent task DB 구현
- catalog bundle/object storage 분리
- 모든 UI action의 실제 mutation 구현
- A2A official SDK 도입 강제

## 14. 최종 성공 기준

- Host Agent 코드에서 기본 A2UI 호출 path가 MCP 직접 호출에서 A2A 호출로 바뀐다.
- A2UI Agent boundary는 Agent Card, `message:send`, `message:stream`, task artifact를 제공한다.
- 기존 Admin catalog와 derivedSchema matcher는 그대로 재사용한다.
- A2UI 결과는 A2A Task artifact의 `application/vnd.a2ui.surface+json` data part로 전달된다.
- Chat UI는 기존 renderer를 유지하면서 A2A surface를 렌더한다.
- MCP는 compatibility/debug path로 남지만 기본 데모 설명은 `Host Agent -> A2UI Agent` 구조로 바뀐다.

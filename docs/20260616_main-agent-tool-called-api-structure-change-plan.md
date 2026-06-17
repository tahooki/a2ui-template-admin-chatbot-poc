# Main Agent A2UI Runtime Reference

## 1. 문서 목적

이 문서는 현재 프로젝트에서 Main Agent가 업무 API tool을 실행하고, 그 결과를 `a2ui_render` tool로 전달해 A2UI Agent가 surface를 만드는 흐름을 설명한다.

핵심은 하나다.

```text
Main Agent가 먼저 business API tool을 실행한다.
business tool result가 나오면 그 원본 data와 metadata를 a2ui_render에 전달한다.
A2UI Agent는 전달받은 data를 검증하고 template matching 후 SurfaceEnvelope를 만든다.
```

A2UI Agent는 업무 API를 직접 호출하지 않는다. A2UI Agent는 이미 조회된 business data를 받아 화면 계약으로 해석하는 역할만 담당한다.

## 2. 현재 실행 흐름

현재 프로젝트의 chat runtime은 다음 순서로 실행된다.

```text
Chat UI
  -> Next /api/chat
  -> Main Agent /chat/stream
  -> LLM intent classification
  -> business_tool_for_api(api_id)
  -> run_business_tool(get_equipment_status|get_equipment_catalog)
  -> BusinessToolResult 생성
  -> run_a2ui_render_tool(a2ui_render)
  -> render_business_tool_result(...)
  -> A2A 또는 MCP A2UI runtime 호출
  -> A2A handler에서 source/received fingerprint 비교
  -> SurfaceEnvelope 또는 text fallback
  -> SSE event
  -> browser renderer
```

현재 프로젝트에는 외부 Main Agent가 별도로 붙어 있지 않다. 대신 `[Main Agent package]`의 FastAPI service가 Main Agent 역할을 수행한다. 즉 사용자 메시지를 받고, LLM으로 business intent를 판단하고, business tool을 실행하고, 그 결과를 `a2ui_render` tool로 넘긴다.

## 3. 책임 분리

### 3.1 Main Agent

Main Agent의 책임은 다음이다.

```text
1. 사용자 메시지를 받는다.
2. LLM으로 business intent를 판단한다.
3. 어떤 business API tool을 실행할지 고른다.
4. business API tool을 실행한다.
5. business tool result를 보존한다.
6. business tool result를 그대로 a2ui_render tool에 전달한다.
7. A2UI 결과를 text/surface SSE로 stream한다.
```

Main Agent가 판단하는 intent는 business intent다.

예:

```text
사용자: 장비 상태 보여줘
business intent: equipment.status.lookup
business tool: get_equipment_status
```

### 3.2 Business API Tool

Business API tool의 책임은 업무 데이터를 조회하는 것이다.

현재 등록된 business tool은 다음 두 개다.

```text
get_equipment_status
  apiId: equipment-status
  data: 장비 상태 목록

get_equipment_catalog
  apiId: equipment-catalog
  data: 장비 catalog 목록
```

Business API tool은 화면을 판단하지 않는다. 원본 API response와 source metadata를 `BusinessToolResult`로 반환한다.

### 3.3 a2ui_render Tool

`a2ui_render`는 Main Agent 관점의 tool이다. 이 tool은 업무 API를 호출하지 않는다.

`a2ui_render`의 input은 이미 실행된 business tool result다.

```text
input:
  query
  business_tool_result
  context

output:
  A2UIRenderToolResult
    - surface 또는 text fallback
    - matcher strategy/score/candidates/mapping
    - sourceTool metadata
    - dataIntegrity report
```

`a2ui_render`는 항상 business tool result 이후 deterministic하게 실행된다. LLM에게 다시 `a2ui_render` 호출 여부를 맡기지 않는다.

### 3.4 A2UI Agent

A2UI Agent의 책임은 display intent와 data contract 판단이다.

```text
1. 전달받은 data의 profile을 만든다.
2. sampleDataPreview를 만든다.
3. derivedSchema를 만든다.
4. template inputSchema와 비교한다.
5. 적합한 template을 고른다.
6. renderer가 사용할 SurfaceEnvelope를 만든다.
7. source data와 received data의 fingerprint를 비교한다.
```

A2UI Agent는 business API URL을 몰라도 된다. 현재 POC에서는 A2A primary path를 통해 Next-hosted A2UI runtime이 이 역할을 한다.

## 4. 주요 파일

```text
src/app/api/chat/route.ts
  Browser chat request를 Main Agent /chat/stream으로 proxy한다.

[Main Agent package]/app/orchestrate.py
  전체 chat turn을 orchestration한다.
  LLM intent -> business tool -> a2ui_render tool 순서를 보장한다.

[Main Agent package]/app/tool_router.py
  api_id와 business tool name을 매핑한다.

[Main Agent package]/app/business_tools.py
  get_equipment_status, get_equipment_catalog tool을 실행한다.
  source data fingerprint와 sourceTool metadata를 만든다.

[Main Agent package]/app/a2ui_render_tool.py
  a2ui_render tool wrapper다.
  business tool result를 render boundary로 전달한다.

[Main Agent package]/app/render_boundary.py
  profile, sampleDataPreview, derivedSchema, fallback text를 만들고
  A2A/MCP A2UI runtime을 호출한다.

[Main Agent package]/app/a2a_client.py
  A2A render request envelope를 만든다.
  facts, toolMetadata, a2uiOptions를 전달한다.

[Main Agent package]/app/data_integrity.py
  canonical hash, byteLength, rowCount, shape을 계산한다.

src/server/a2a/a2ui-message-handler.ts
  A2A render request를 처리한다.
  sourceTool metadata를 읽고 received data fingerprint를 다시 계산한다.

src/server/a2ui-admin/a2ui-runtime.ts
  template recommendation과 SurfaceEnvelope resolution을 수행한다.

src/features/a2ui-template-poc/sequence-board.tsx
src/features/a2ui-template-poc/agent-flow-adapter.ts
  UI에서 Main Agent, business tool, a2ui_render, A2UI Agent 단계를 분리해서 보여준다.
```

## 5. BusinessToolResult 형식

Business API tool 실행 결과는 `BusinessToolResult`로 표현된다.

```py
@dataclass(frozen=True)
class BusinessToolResult:
    tool_name: BusinessToolName
    api_id: EquipmentApiId
    data: dict[str, Any]
    metadata: dict[str, Any]
```

예시:

```json
{
  "tool_name": "get_equipment_status",
  "api_id": "equipment-status",
  "data": {
    "items": [
      {
        "id": "EQ-001",
        "name": "CNC 가공기 01",
        "isRunning": true,
        "hasAlarm": false,
        "needsInspection": false,
        "isReserved": true
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 1
  },
  "metadata": {
    "source": "main_agent_business_tool",
    "operation": "get_equipment_status",
    "sourceToolName": "get_equipment_status",
    "sourceToolResultId": "tool-result-...",
    "sourceApiId": "equipment-status",
    "sourceDataHash": "sha256...",
    "sourceDataByteLength": 166,
    "sourceRowCount": 1,
    "sourceDataShape": "object{items:array<object>}",
    "sourceTopLevelKeys": ["items", "page", "pageSize", "total"]
  }
}
```

중요한 점은 `data`가 A2UI로 전달되는 원본 업무 데이터라는 것이다. A2UI 비교 검증은 이 원본 data를 기준으로 한다.

## 6. a2ui_render Tool Input

`a2ui_render`는 다음 input을 받는다.

```py
@dataclass(frozen=True)
class A2UIRenderToolInput:
    query: str
    business_tool_result: BusinessToolResult
    context: dict[str, Any]
```

현재 Main Agent는 business tool result가 나오면 다음 순서로 `a2ui_render`를 실행한다.

```py
business_tool_name = business_tool_for_api(api_id)
business_tool_result = await run_business_tool(business_tool_name)
a2ui_tool_result = await run_a2ui_render_tool(
    A2UIRenderToolInput(
        query=message,
        business_tool_result=business_tool_result,
        context={"intentSource": intent_source},
    )
)
```

여기서 `query`는 DB query가 아니다. 사용자가 이 데이터를 어떻게 보고 싶어 했는지를 나타내는 display request다.

예:

```text
장비 상태 한눈에 보여줘
사진 있는 장비 목록 보여줘
알람 난 설비만 보여줘
```

## 7. A2A Render Request

Main Agent가 A2A primary path를 사용할 때 A2A envelope는 다음 구조를 갖는다.

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
    "messageId": "msg-...",
    "contextId": "ctx-...",
    "role": "ROLE_USER",
    "parts": [
      {
        "text": "장비 상태 목록 보여줘"
      },
      {
        "mediaType": "application/vnd.a2ui.render-request+json",
        "data": {
          "kind": "a2ui.render.request",
          "query": "장비 상태 목록 보여줘",
          "intentKey": "equipment.status.lookup",
          "facts": {
            "apiId": "equipment-status",
            "data": {
              "items": []
            },
            "profile": {},
            "fallbackText": "...",
            "sourceToolName": "get_equipment_status",
            "sourceToolResultId": "tool-result-...",
            "sourceDataHash": "sha256..."
          },
          "sampleDataPreview": {},
          "derivedSchema": {},
          "fallbackText": "...",
          "toolMetadata": {
            "sourceToolName": "get_equipment_status",
            "renderToolName": "a2ui_render",
            "renderToolCallPolicy": "deterministic_after_business_tool_result"
          },
          "a2uiOptions": {
            "includeTrace": true,
            "allowIntentFallback": true
          }
        }
      }
    ]
  }
}
```

A2A handler는 `renderData.data` 또는 `facts.data`에서 업무 데이터를 읽는다. 현재 happy path는 `items` 배열을 가진 equipment API response다.

## 8. Data Integrity

현재 프로젝트는 source data와 A2A handler가 받은 received data를 같은 방식으로 fingerprint한다.

비교 항목:

```text
sourceDataHash        <-> receivedHash
sourceRowCount        <-> receivedRowCount
sourceDataByteLength  <-> receivedByteLength
sourceDataShape       <-> receivedShape
sourceTopLevelKeys    <-> receivedTopLevelKeys
```

Python side source snapshot은 `[Main Agent package]/app/data_integrity.py`에서 만든다.

```py
{
    "dataHash": sha256(canonical_json),
    "byteLength": len(canonical_json_bytes),
    "rowCount": data_row_count(data),
    "shape": data_shape(data),
    "topLevelKeys": sorted(data.keys())
}
```

Next A2A handler는 `src/server/a2a/a2ui-message-handler.ts`에서 received snapshot을 다시 계산한다.

```ts
{
  expectedHash,
  receivedHash,
  hashMatched,
  expectedRowCount,
  receivedRowCount,
  rowCountMatched,
  expectedByteLength,
  receivedByteLength,
  byteLengthMatched,
  receivedShape,
  receivedTopLevelKeys,
  matched
}
```

이 결과는 A2A task metadata, matcher trace artifact, surface decision metadata에 들어간다.

## 9. SSE / Flow Board 이벤트

현재 Main Agent는 sequence board가 추적할 수 있도록 state event를 stream한다.

주요 event 순서:

```text
planning
intent
business_tool_selected
business_tool_call
business_tool_result
a2ui_tool_selected
a2ui_tool_call
profile
a2a 또는 mcp
registry_loaded
matcher
a2ui_tool_result
surface 또는 text fallback
done
```

Flow Board의 주요 lane:

```text
Chat UI
Next /api/chat
Main Agent
A2UI Agent
LLM
Business DB/API
a2ui_render Tool
A2UI Registry
```

이 board에서 반드시 보여야 하는 메시지는 다음이다.

```text
Business API tool call과 a2ui_render tool call은 별도 단계다.
업무 데이터 조회는 Main Agent/business tool 쪽에서 끝난다.
A2UI Agent는 받은 data를 template contract와 비교한다.
source data와 received data의 integrity 비교 결과가 trace된다.
```

## 10. Runtime Contract

현재 프로젝트에서 지켜야 하는 contract는 다음이다.

```text
1. business API tool이 먼저 실행된다.
2. business tool result의 data는 LLM에게 다시 요약/재구성시키지 않는다.
3. business tool result의 원본 data를 a2ui_render에 전달한다.
4. a2ui_render는 business API를 호출하지 않는다.
5. a2ui_render는 A2UI Agent render boundary만 호출한다.
6. A2UI Agent는 받은 data 기준으로 profile/preview/schema/matching을 수행한다.
7. source fingerprint와 received fingerprint를 비교한다.
8. 비교 결과를 task metadata와 trace artifact에 남긴다.
```

## 11. 실행과 검증

개발 실행:

```sh
npm run dev:all
```

Main Agent 테스트:

```sh
npm run main-agent:test
```

전체 검증:

```sh
npm run main-agent:test
npm run lint
npm run build
```

현재 테스트에서 확인하는 핵심:

```text
business tool result가 sourceTool metadata를 만든다.
a2ui_render request가 tool metadata를 facts와 toolMetadata에 싣는다.
allowIntentFallback 옵션을 사용한다.
A2A response에서 sourceTool/dataIntegrity를 추출한다.
render boundary가 profile, preview, derivedSchema, fallback text를 만든다.
data integrity snapshot이 hash/rowCount/shape을 만든다.
```

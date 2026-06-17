# A2UI Main Agent Integration and Data Integrity Guide

## 1. 핵심 원칙

현재 프로젝트에서 검증하는 핵심 원칙은 다음이다.

```text
Main Agent가 업무 API tool을 먼저 실행한다.
그 tool result를 그대로 a2ui_render tool에 전달한다.
A2UI Agent는 전달받은 data를 기준으로 화면 계약과 데이터 무결성을 판단한다.
```

A2UI Agent는 업무 API를 먼저 호출하지 않는다. A2UI Agent는 Main Agent가 이미 조회한 업무 데이터를 입력으로 받아 `SurfaceEnvelope`를 만들거나 text fallback을 반환한다.

따라서 이 POC가 보여줘야 하는 것은 화면 자체보다 다음 질문에 대한 답이다.

```text
Main Agent가 넘긴 업무 데이터가 A2UI Agent 경계까지 손실 없이 전달되는가?
전달된 data shape, row count, hash가 source와 received 사이에서 일치하는가?
A2UI Agent가 derivedSchema와 template inputSchema를 비교해 적절한 surface를 고르는가?
비교 판단 결과와 데이터 무결성 결과가 trace로 남는가?
```

## 2. 현재 프로젝트 구조

현재 프로젝트에는 외부 Main Agent가 별도로 붙어 있지 않다. `[Main Agent package]`의 FastAPI service가 Main Agent 역할을 수행한다.

현재 runtime 구성:

```text
Browser Chat UI
  -> Next /api/chat
  -> Main Agent /chat/stream
  -> Business API Tool
  -> a2ui_render Tool
  -> A2A A2UI Agent facade
  -> A2UI runtime / template matcher
  -> SurfaceEnvelope
  -> Chat UI renderer
```

역할별 책임:

```text
Chat UI
  사용자 메시지 입력, SSE 수신, text/surface rendering을 담당한다.

Next /api/chat
  Browser와 Main Agent 사이의 SSE proxy다.

Main Agent
  LLM으로 business intent를 판단하고 business API tool을 실행한다.
  business tool result가 있으면 a2ui_render tool을 deterministic하게 실행한다.

Business API Tool
  업무 API를 호출하고 raw data와 source metadata를 반환한다.

a2ui_render Tool
  business tool result를 A2UI render boundary로 전달한다.
  업무 API를 호출하지 않는다.

A2UI Agent
  받은 data를 profile/preview/schema로 분석하고 template을 match한다.
  source data와 received data의 fingerprint를 비교한다.

A2UI Registry
  template inputSchema, surfaceConfig, selection hint를 제공한다.
```

## 3. 현재 Sequence

현재 chat turn의 data task sequence는 다음과 같다.

```text
1. User -> Chat UI
   "장비 상태 보여줘"

2. Chat UI -> Next /api/chat
   POST /api/chat

3. Next /api/chat -> Main Agent
   /chat/stream으로 proxy

4. Main Agent -> LLM
   business intent classification

5. Main Agent
   api_id를 business tool name으로 변환
   business_tool_for_api("equipment-status") -> "get_equipment_status"

6. Main Agent -> Business API Tool
   run_business_tool("get_equipment_status")

7. Business API Tool -> Main Agent
   BusinessToolResult(data, metadata)

8. Main Agent -> a2ui_render Tool
   run_a2ui_render_tool(query, business_tool_result)

9. a2ui_render Tool -> Render Boundary
   profile, sampleDataPreview, derivedSchema, fallbackText 생성

10. Render Boundary -> A2A A2UI Agent facade
    A2A render request 전송

11. A2A handler
    data, sourceTool metadata, derivedSchema, sampleDataPreview 읽기
    received data fingerprint 계산

12. A2UI runtime
    recommendTemplate -> resolveTemplateData

13. A2A handler -> Main Agent
    task metadata, trace artifact, surface artifact 반환

14. Main Agent -> Chat UI
    text, surface, done SSE event 반환
```

General chat은 business API tool을 실행하지 않는다. LLM intent classification 결과가 equipment API id를 반환하지 않으면 text fallback branch로 끝난다.

## 4. Business Intent와 Display Intent

현재 프로젝트는 intent를 두 단계로 나눠 본다.

```text
Business intent
  어떤 업무 데이터를 조회할지 결정한다.
  Main Agent가 판단한다.

Display intent
  조회된 데이터를 어떤 surface로 보여줄지 결정한다.
  A2UI Agent가 판단한다.
```

예:

```text
사용자 메시지:
  장비 상태 한눈에 보여줘

Business intent:
  equipment.status.lookup

Business API tool:
  get_equipment_status

Display 판단:
  data shape = object{items:array<object>}
  fields = name + boolean/status fields
  matched template = equipment.statusBooleanList
```

A2UI Agent는 Main Agent의 business intent 판단을 대체하지 않는다. A2UI Agent는 이미 조회된 데이터를 어떤 화면 계약으로 표현할지 판단한다.

## 5. Main Agent가 보내는 데이터

`a2ui_render`로 넘어가는 핵심 데이터는 다음이다.

```text
query
  사용자 원문 또는 display request다.

data
  business API tool이 반환한 raw data다.

profile
  data의 rowCount, fieldCount, booleanFieldCount 등 요약 정보다.

sampleDataPreview
  matcher가 안전하게 볼 수 있는 bounded preview다.

derivedSchema
  data에서 추론한 schema, field paths, roles, capabilities다.

toolMetadata
  source tool name, result id, source hash, source row count 등 추적 정보다.

fallbackText
  surface를 만들 수 없을 때 사용할 text answer다.
```

현재 A2A render request의 핵심 payload:

```json
{
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
    "sourceDataHash": "sha256...",
    "sourceRowCount": 5,
    "sourceDataByteLength": 1200
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
```

## 6. Query 생성 기준

`query`는 SQL query나 API query가 아니다. `query`는 A2UI Agent가 display intent를 이해하기 위한 사용자 표현이다.

현재 우선순위:

```text
1. 사용자 원문
   "장비 상태 한눈에 보여줘"
   "사진 있는 장비 목록 보여줘"

2. business intent
   "equipment.status.lookup"
   "equipment.catalog.lookup"

3. operation/tool name
   "get_equipment_status"
   "get_equipment_catalog"

4. fallback display request
   "render this business data"
```

현재 Main Agent에서는 사용자 메시지를 그대로 `query`로 전달한다.

## 7. Data Integrity 검증

현재 프로젝트는 데이터가 전달 중에 줄거나 바뀌는지 확인하기 위해 source snapshot과 received snapshot을 비교한다.

### 7.1 Source Snapshot

Business API tool 실행 직후 Python side에서 source snapshot을 만든다.

```json
{
  "sourceDataHash": "sha256...",
  "sourceDataByteLength": 1200,
  "sourceRowCount": 5,
  "sourceDataShape": "object{items:array<object>}",
  "sourceTopLevelKeys": ["items", "page", "pageSize", "total"]
}
```

계산 기준:

```text
hash
  canonical JSON을 sha256으로 계산한다.

byteLength
  canonical JSON의 UTF-8 byte length다.

rowCount
  data.items가 있으면 total 또는 items.length다.
  array payload면 array.length다.

shape
  object{items:array<object>}
  object{items:array}
  array<object>
  array
  object
```

### 7.2 Received Snapshot

A2A handler는 받은 raw data를 다시 fingerprint한다.

```json
{
  "receivedHash": "sha256...",
  "receivedByteLength": 1200,
  "receivedRowCount": 5,
  "receivedShape": "object{items:array<object>}",
  "receivedTopLevelKeys": ["items", "page", "pageSize", "total"]
}
```

### 7.3 Comparison Report

최종 비교 결과는 다음 구조로 남는다.

```json
{
  "expectedHash": "sha256...",
  "receivedHash": "sha256...",
  "hashMatched": true,
  "expectedRowCount": 5,
  "receivedRowCount": 5,
  "rowCountMatched": true,
  "expectedByteLength": 1200,
  "receivedByteLength": 1200,
  "byteLengthMatched": true,
  "receivedShape": "object{items:array<object>}",
  "receivedTopLevelKeys": ["items", "page", "pageSize", "total"],
  "matched": true
}
```

`matched`가 true면 source side에서 만든 fingerprint와 A2A handler가 받은 data fingerprint가 일치한다는 뜻이다.

## 8. A2UI Agent의 판단 기준

A2UI Agent는 다음 정보를 함께 본다.

```text
query
  사용자가 어떤 식으로 보고 싶어 했는지에 대한 hint다.

apiId
  어떤 업무 데이터인지 알려주는 hint다.

data
  실제 renderer payload의 원천이다.

sampleDataPreview
  matcher가 볼 수 있는 bounded sample이다.

derivedSchema
  field path, type, role, capability를 담은 schema다.

template inputSchema
  각 A2UI template이 받을 수 있는 data contract다.
```

현재 matching 흐름:

```text
1. canonicalDerivedSchema 생성
2. matchA2UITemplate 실행
3. candidate score 계산
4. required slot mapping 확인
5. threshold 이상이면 render_surface
6. match 실패 또는 data 부족이면 text_fallback
```

현재 strategy:

```text
derived_schema
  derivedSchema와 template inputSchema 비교로 선택된 경우

template_schema_spec
  template schema spec 기반 fallback matcher를 사용한 경우

fallback
  surface를 만들지 않고 text fallback으로 끝난 경우
```

## 9. SurfaceEnvelope 생성

Template이 선택되면 A2UI runtime은 `resolveTemplateData()`로 renderer payload를 만든다.

Surface response artifact의 핵심 구조:

```json
{
  "schemaVersion": "2026-06-11",
  "kind": "a2ui.surface.response",
  "surface": {
    "templateId": "equipment.statusBooleanList",
    "version": "1.0.0",
    "payload": {
      "apiTitle": "장비 상태",
      "apiId": "equipment-status",
      "data": {
        "items": []
      },
      "profile": {},
      "renderPlan": {}
    },
    "surfaceConfig": {},
    "sourceIntent": "equipment.status.lookup",
    "updatedAt": "..."
  },
  "decision": {
    "mode": "render_surface",
    "reason": "...",
    "strategy": "derived_schema",
    "score": 0.91,
    "templateId": "equipment.statusBooleanList",
    "candidates": [],
    "mapping": {},
    "sourceTool": {},
    "dataIntegrity": {}
  }
}
```

Renderer는 `surface`를 사용해 화면을 그린다. `decision`은 사람이 검증할 수 있는 판단 trace다.

## 10. 지원되는 현재 Payload

현재 A2A handler의 `readEquipmentData()`는 다음 payload를 처리한다.

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

현재 직접 처리되는 조건:

```text
payload가 object다.
payload.items가 array다.
total/page/pageSize는 없으면 기본값을 채운다.
```

현재 검증하기 좋은 happy path:

```text
equipment-status
  items array
  boolean/status fields
  statusBooleanList template

equipment-catalog
  items array
  imageUrl/title/description/category fields
  imageCardList template
```

## 11. 다양한 데이터 형식 검증 기준

POC가 궁극적으로 확인해야 하는 데이터 형식은 다음 범주다.

```text
1. standard items payload
   { items: [...], total, page, pageSize }

2. direct array payload
   [...]

3. nested rows payload
   { result: { rows: [...] } }

4. list payload
   { data: { list: [...] } }

5. alias-heavy payload
   eqpNm, opYn, alarmYn 같은 업무 필드명을 포함

6. invalid payload
   primary array를 찾을 수 없는 payload
```

현재 runtime happy path는 `items` payload다. 다른 payload 형식까지 자동 수용하려면 A2UI ingest/canonicalization 계층이 필요하다.

그 계층이 추가될 때의 기준은 다음이다.

```text
raw payload는 보존한다.
canonical payload를 별도로 만든다.
어떤 path에서 primary array를 찾았는지 기록한다.
어떤 field alias가 canonical field로 매핑되었는지 기록한다.
row count와 hash 비교 기준을 명시한다.
허용된 변환과 허용되지 않은 손실을 구분한다.
```

## 12. 허용되는 변환과 허용되지 않는 손실

허용되는 변환:

```text
field alias mapping
  eqpNm -> name
  opYn -> isRunning

boolean normalization
  "Y" -> true
  "N" -> false

bounded preview 생성
  원본 전체 data는 보존하고 sampleDataPreview만 줄인다.

derivedSchema 생성
  data를 분석해 field metadata를 만든다.
```

허용되지 않는 손실:

```text
원본 data row가 사라지는 것
원본 data field가 이유 없이 drop되는 것
hash 비교 대상이 명시 없이 바뀌는 것
LLM 요약 text를 data 대신 A2UI에 전달하는 것
business tool result 이후 a2ui_render가 누락되는 것
```

## 13. Trace에서 확인할 것

Surface가 만들어진 경우 확인할 trace:

```text
task.metadata.sourceTool
task.metadata.dataIntegrity
traceArtifact.data.sourceTool
traceArtifact.data.dataIntegrity
surfaceArtifact.data.decision.sourceTool
surfaceArtifact.data.decision.dataIntegrity
surfaceArtifact.data.decision.candidates
surfaceArtifact.data.decision.mapping
```

확인 기준:

```text
sourceToolName이 business tool 이름과 일치한다.
renderToolName이 a2ui_render다.
renderToolCallPolicy가 deterministic_after_business_tool_result다.
sourceDataHash와 receivedHash가 일치한다.
sourceRowCount와 receivedRowCount가 일치한다.
matched가 true다.
templateId가 기대한 surface와 일치한다.
mapping이 required slot을 채운다.
```

## 14. Tool 등록 방식으로 붙일 때의 규칙

Main Agent가 tool calling 기반이면 `a2ui_render`를 tool registry에 등록할 수 있다.

이때 규칙은 동일하다.

```text
1. 업무 API tool이 먼저 실행된다.
2. 업무 API tool result가 tool state에 저장된다.
3. a2ui_render는 그 tool result를 input으로 받는다.
4. a2ui_render는 업무 API를 다시 호출하지 않는다.
5. a2ui_render 호출 여부를 LLM의 자유 선택에 맡기지 않는다.
6. tool execution hook, graph edge, code post-processing 중 하나로 실행을 보장한다.
```

Tool schema 예시:

```json
{
  "name": "a2ui_render",
  "description": "Render already-fetched business data as an A2UI surface.",
  "input_schema": {
    "type": "object",
    "required": ["query", "data"],
    "properties": {
      "query": {
        "type": "string"
      },
      "data": {
        "type": "object"
      },
      "context": {
        "type": "object"
      }
    }
  }
}
```

Guard 예시:

```ts
if (!businessToolResult) {
  throw new Error("a2ui_render requires a completed business tool result.");
}

return a2uiRender({
  query: userMessage,
  data: businessToolResult.data,
  context: {
    sourceToolName: businessToolResult.toolName,
    sourceToolResultId: businessToolResult.id,
  },
});
```

## 15. 코드 후처리 방식으로 붙일 때의 규칙

Main Agent 코드에서 업무 API 호출 직후 A2UI Agent를 호출해도 된다.

```ts
const businessResult = await getEquipmentStatus();

const a2ui = await a2uiRender({
  query: userMessage,
  data: businessResult.data,
  context: {
    sourceToolName: "getEquipmentStatus",
    sourceToolResultId: businessResult.id,
  },
});

return {
  text: textAnswer,
  a2ui,
};
```

이 방식도 원칙은 같다.

```text
업무 API 호출은 Main Agent가 한다.
A2UI 호출은 업무 API 결과 이후에 한다.
A2UI에는 원본 business data를 전달한다.
```

## 16. 현재 테스트 기준

현재 프로젝트에서 바로 실행 가능한 검증:

```sh
npm run main-agent:test
npm run lint
npm run build
```

`main-agent:test`에서 확인하는 내용:

```text
business_tools
  business tool이 data와 sourceTool metadata를 반환한다.

data_integrity
  canonical hash, rowCount, byteLength, shape을 계산한다.

a2a_client
  A2A render request가 facts/toolMetadata/a2uiOptions를 포함한다.
  allowIntentFallback 옵션을 사용한다.
  A2A response에서 sourceTool/dataIntegrity를 추출한다.

render_boundary
  business tool result를 profile, sampleDataPreview, derivedSchema로 변환한다.
  A2UI runtime 호출에 tool metadata를 전달한다.

a2ui_render_tool
  a2ui_render tool result가 renderToolName과 renderToolCallPolicy를 보존한다.
```

## 17. 성공 기준

현재 POC가 성공했다고 말하려면 다음이 보여야 한다.

```text
1. Main Agent가 business API tool을 먼저 실행한다.
2. business tool result가 a2ui_render tool로 전달된다.
3. A2UI Agent가 business API를 직접 호출하지 않는다.
4. sourceTool metadata가 A2A boundary까지 보존된다.
5. source data hash와 received data hash가 비교된다.
6. row count와 byte length가 비교된다.
7. derivedSchema와 template inputSchema 비교 결과가 trace된다.
8. matched template, candidates, mapping이 확인 가능하다.
9. SurfaceEnvelope가 renderer에 전달된다.
10. 실패 시 text fallback과 실패 reason이 남는다.
```

요약하면, 이 프로젝트의 A2UI 통합은 다음 한 문장으로 설명할 수 있다.

```text
Main Agent는 업무 데이터를 조회하고, A2UI Agent는 그 데이터를 손실 없이 받아 어떤 surface로 표현할지 검증한다.
```

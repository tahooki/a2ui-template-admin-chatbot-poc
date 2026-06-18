# A2UI Tool-Registered Large Data Demo Realignment Plan

Date: 2026-06-17

## 0. 검수 결과

이 문서의 방향은 맞다.

다만 개발 전에 다음 네 가지를 명확히 해야 한다.

```text
1. 기존 API는 상태 목록 / 장비 목록 두 개다.
2. 새로 추가할 API는 컬럼 많은 상태 / 데이터 많은 상태 두 개다.
3. 새 테스트 API도 화면 fixture가 아니라 Main Agent business tool registry에 등록된 tool이어야 한다.
4. 공통 template 렌더링 검증 대상은 상태 계열 세 개다.
   - 상태 목록
   - 컬럼 많은 상태
   - 데이터 많은 상태
```

`장비 목록`은 기준 API로 화면에 남기지만, 상태 boolean table 공통 template 검증 대상은 아니다. 장비 목록은 `equipment.imageCardList` template이 등록되어 있으면 image card로 렌더링되고, 등록되어 있지 않으면 fallback이 나오는 것이 현재 프로젝트 흐름과 맞다.

## 1. 목적

현재 Data Boundary Lab은 `Standard`, `Alias`, `Wide`, `Mutated` 네 가지 테이블 시나리오를 보여준다.

하지만 이번 시연 목표는 단순히 테이블 fixture를 보여주는 것이 아니다. 목표는 다음이다.

```text
Main Agent가 실제 업무 API tool을 호출한다.
그 business tool result를 a2ui_render tool에 그대로 넘긴다.
A2UI는 데이터가 크거나 컬럼이 많아도 이미 등록된 공통 A2UI template으로 그린다.
```

따라서 `Wide`, `Large Rows` 같은 테스트 케이스도 화면 전용 fixture가 아니라 Main Agent의 business tool registry에 등록된 실제 호출 대상으로 만들어야 한다.

## 2. 현재 정정해야 할 점

### 2.1 이미 존재하는 업무 API

현재 프로젝트에는 이미 두 개의 업무 API 흐름이 있다.

```text
장비 상태 목록
  route: /api/equipment-status
  business tool: get_equipment_status

장비 목록
  route: /api/equipment-catalog
  business tool: get_equipment_catalog
```

이 둘은 새로 추가되는 테스트 API가 아니다. 기존 시연의 기준 API다.

### 2.2 현재 DB Table 탭의 문제

현재 DB Table 탭은 다음 네 개를 보여준다.

```text
Standard
Alias
Wide
Mutated
```

이 구조는 이번 시연 메시지와 다르다.

이번 시연에서 필요한 것은 다음 네 개다.

```text
상태 목록
장비 목록
컬럼 많은 상태 목록
데이터 많은 상태 목록
```

`Alias`와 `Mutated`는 이번 화면 시연의 중심에서 제거한다.

`Alias`는 컬럼명이 다른 API 판단 실험으로 남길 수 있지만, 이번 시연 범위에서는 빼는 것이 낫다.

`Mutated`는 데이터 무결성 실패 검증용 negative test로는 의미가 있지만, 사용자가 보는 기본 DB Table 탭에는 두지 않는다. 실패 케이스는 별도 테스트나 문서에서 다룬다.

## 3. 목표 상태

### 3.1 화면 탭 구성

DB Table 탭은 다음 네 개만 보여준다.

| UI label | 성격 | route | business tool | A2UI template 기대값 |
| --- | --- | --- | --- | --- |
| 상태 목록 | 기존 API | `/api/equipment-status` | `get_equipment_status` | `equipment.commonStatusTable` |
| 장비 목록 | 기존 API | `/api/equipment-catalog` | `get_equipment_catalog` | `equipment.imageCardList` 등록 시 image card, 미등록 시 fallback |
| 컬럼 많은 상태 | 테스트 API | `/api/equipment-status-wide-columns` | `get_equipment_status_wide_columns` | `equipment.commonStatusTable` |
| 데이터 많은 상태 | 테스트 API | `/api/equipment-status-large-rows` | `get_equipment_status_large_rows` | `equipment.commonStatusTable` |

핵심 검증 대상은 `컬럼 많은 상태`, `데이터 많은 상태` 두 개다.

이 두 API는 장비 상태 목록과 의미적으로 같은 데이터를 반환하되 데이터 양이나 컬럼 수만 다르다. 따라서 A2UI는 기존에 등록된 상태 목록 template으로 렌더링해야 한다.

### 3.2 공통 template 기준

새 renderer를 만들지 않는다.

MVP에서는 다음 고정 template을 공통 상태 template로 등록해서 사용한다.

```text
componentId: equipment.commonStatusTable
viewType: statusBooleanList
```

`equipment.commonStatusTable`은 새 renderer viewType이 아니라 새 고정 template id다. 실제 화면 렌더러는 기존 `statusBooleanList` viewType을 재사용한다.

필요하면 title/description/selectionGuide만 다음 의미로 다듬는다.

```text
장비 상태 목록 계열 API를 공통으로 렌더링하는 template
기본 상태 API, 컬럼 많은 상태 API, 데이터 많은 상태 API 모두 같은 template으로 렌더링한다.
```

주의:

```text
장비 목록 / equipment catalog는 상태 boolean table과 데이터 성격이 다르다.
이번 핵심 E2E의 "같은 공통 template으로 잘 그려진다" 검증 대상은
상태 목록, 컬럼 많은 상태, 데이터 많은 상태다.
```

## 4. 추가할 업무 API와 tool

### 4.1 컬럼 많은 상태 목록

목적:

```text
row 수는 일반 상태 목록과 비슷하지만 column 수가 매우 많아도
preview / derivedSchema / matcher / renderer가 깨지지 않는지 확인한다.
```

추가 대상:

```text
route: src/app/api/equipment-status-wide-columns/route.ts
apiId: equipment-status-wide-columns
business tool: get_equipment_status_wide_columns
```

데이터 형태:

```text
items: 6 rows
기본 status fields:
  id
  name
  isOnline
  isRunning
  hasAlarm
  needsInspection
  isReserved
  updatedAt
  location

extra fields:
  metric_000 ... metric_119
```

기대 결과:

```text
sourceRowCount = 6
derivedSchema.fields >= 120
sampleDataPreview.truncated may be true
templateId = equipment.commonStatusTable
surface payload rows <= template maxItems
dataIntegrity.matched = true
```

### 4.2 데이터 많은 상태 목록

목적:

```text
row 수가 많아도 raw data 전달 무결성은 전체 기준으로 검증하고,
A2UI 판단은 bounded preview / derivedSchema 기준으로 안정적으로 동작하는지 확인한다.
```

추가 대상:

```text
route: src/app/api/equipment-status-large-rows/route.ts
apiId: equipment-status-large-rows
business tool: get_equipment_status_large_rows
```

데이터 형태:

```text
items: 1000 rows
기본 status fields:
  id
  name
  isOnline
  isRunning
  hasAlarm
  needsInspection
  isReserved
  updatedAt
  location
```

기대 결과:

```text
sourceRowCount = 1000
sampleDataPreview.sampleSize는 제한된다.
sampleDataPreview.rowCount는 1000을 유지한다.
derivedSchema.rowCount는 1000을 유지한다.
templateId = equipment.commonStatusTable
surface payload rows <= template maxItems
dataIntegrity.matched = true
```

## 5. 구현 대상 파일

### 5.1 Next API route

추가:

```text
src/app/api/equipment-status-wide-columns/route.ts
src/app/api/equipment-status-large-rows/route.ts
src/server/equipment/equipment-test-data.ts
```

`equipment-test-data.ts`에는 deterministic generator를 둔다.

```text
buildWideColumnEquipmentStatus()
buildLargeRowsEquipmentStatus()
```

테스트 API는 외부 환경변수에 의존하지 않는다. 이번 POC에서 의도적으로 대량/다컬럼 데이터를 만들기 위한 test-only business API다.

기존 API 두 개는 현재처럼 외부 equipment data source를 바라본다.

```text
/api/equipment-status
/api/equipment-catalog
```

따라서 기존 API까지 포함한 smoke test는 `npm run dev:all` 또는 동일한 환경 구성이 필요하다. 반면 새 테스트 API 두 개는 자체 deterministic data를 반환해야 하므로 외부 source가 없어도 동작해야 한다.

### 5.2 Python Main Agent business tool registry

수정:

```text
packages/a2ui-python-agent/app/equipment_tools.py
packages/a2ui-python-agent/app/tool_router.py
packages/a2ui-python-agent/app/business_tools.py
packages/a2ui-python-agent/app/ai/llm_client.py
```

`EquipmentApiId`에 다음을 추가한다.

```python
"equipment-status-wide-columns"
"equipment-status-large-rows"
```

`BusinessToolName`에 다음을 추가한다.

```python
"get_equipment_status_wide_columns"
"get_equipment_status_large_rows"
```

tool router는 다음처럼 동작해야 한다.

```text
equipment-status -> get_equipment_status
equipment-catalog -> get_equipment_catalog
equipment-status-wide-columns -> get_equipment_status_wide_columns
equipment-status-large-rows -> get_equipment_status_large_rows
```

`fetch_equipment_data(api_id)`는 그대로 `/api/{api_id}`를 호출하면 된다.

business tool registry는 최소한 다음 정보를 코드에서 한 곳에 모아야 한다.

```text
name
  예: get_equipment_status_wide_columns

apiId
  예: equipment-status-wide-columns

description
  LLM/tool trace/UI에서 사람이 이해할 수 있는 설명

inputSchema
  이번 API는 입력이 없거나 pageSize 정도만 허용

outputShape
  items/total/page/pageSize를 반환하는 business API result

executor
  fetch_equipment_data(apiId)
```

현재 코드는 `tool_router.py`의 typed map이 사실상 registry 역할을 하고 있다.

이번 수정에서는 최소 구현으로 typed map을 확장해도 되지만, Flow Board와 DB Table에서 tool 설명을 보여주려면 다음과 같은 명시 registry로 바꾸는 편이 더 좋다.

```python
BUSINESS_TOOLS = {
    "get_equipment_status": {
        "api_id": "equipment-status",
        "description": "기존 장비 상태 목록 API",
    },
    "get_equipment_catalog": {
        "api_id": "equipment-catalog",
        "description": "기존 장비 목록 API",
    },
    "get_equipment_status_wide_columns": {
        "api_id": "equipment-status-wide-columns",
        "description": "컬럼 수가 많은 장비 상태 테스트 API",
    },
    "get_equipment_status_large_rows": {
        "api_id": "equipment-status-large-rows",
        "description": "row 수가 많은 장비 상태 테스트 API",
    },
}
```

중요한 원칙:

```text
LLM이 직접 a2ui_render를 고르는 것이 아니다.
LLM은 어떤 business API/tool을 쓸지 분류한다.
Main Agent는 business tool result가 나온 뒤 deterministic하게 a2ui_render tool을 실행한다.
```

### 5.3 A2UI API id 허용 범위

수정 후보:

```text
src/server/a2ui-admin/a2ui-runtime.ts
src/server/a2a/a2ui-message-handler.ts
src/app/api/mcp/route.ts
packages/a2ui-python-agent/app/a2a_client.py
```

현재 `equipment-catalog | equipment-status`만 허용하는 곳이 있다.

새 상태 테스트 API 두 개는 A2UI 입장에서는 `equipment.status.lookup` intent 계열이다. 따라서 다음 원칙으로 처리한다.

```text
equipment-status-wide-columns -> status intent
equipment-status-large-rows -> status intent
```

`a2a_client.render_request()`의 intentKey 계산도 catalog가 아니면 status lookup으로 처리하면 된다.

### 5.4 Chat UI preset label

수정 후보:

```text
src/features/a2ui-template-poc/chatbot-panel.tsx
```

기존 빠른 실행 label처럼 다음을 추가한다.

```text
상태 목록
장비 목록
컬럼 많은 상태
데이터 많은 상태
```

각 label은 자연어 prompt를 전송한다.

```text
상태 목록 -> 장비 상태 목록 보여줘
장비 목록 -> 장비 목록 보여줘
컬럼 많은 상태 -> 컬럼이 많은 장비 상태 목록 보여줘
데이터 많은 상태 -> 데이터가 많은 장비 상태 목록 보여줘
```

LLM classifier prompt에는 이 두 문구를 새 apiId로 분류하라고 명시한다.

```text
컬럼이 많은 / 컬럼 많은 / wide column -> equipment-status-wide-columns
데이터가 많은 / 대량 / 많은 row / large rows -> equipment-status-large-rows
```

현재 프로젝트는 LLM-only routing을 기준으로 한다. 따라서 rule fallback을 새로 추가하지 않는다.

자동 테스트에서는 LLM을 실제 호출하지 말고 classifier 결과를 mock해서 다음 흐름을 검증한다.

```text
message -> mocked apiId -> business tool -> a2ui_render -> SurfaceEnvelope
```

### 5.5 DB Table 탭

수정 후보:

```text
src/features/a2ui-template-poc/data-boundary-lab.ts
src/features/a2ui-template-poc/data-boundary-lab-panel.tsx
```

현재 scenario:

```text
Standard
Alias
Wide
Mutated
```

목표 scenario:

```text
상태 목록
장비 목록
컬럼 많은 상태
데이터 많은 상태
```

DB Table 탭은 화면 fixture 이름이 아니라 실제 business API/tool 이름을 보여준다.

DB Table 탭의 데이터도 독립 fixture를 직접 읽지 않는다. 각 탭은 해당 API route 또는 같은 generator를 공유하는 adapter를 통해 데이터를 가져온다.

권장 우선순위:

```text
1. UI에서는 /api/... route를 fetch해서 보여준다.
2. 테스트에서는 generator를 직접 import해 빠르게 검증한다.
3. UI 전용 별도 fixture는 만들지 않는다.
```

각 탭에서 보여줄 메타:

```text
label
api route
business tool name
row count
column count
expected template
```

테이블은 다음을 만족해야 한다.

```text
상태 목록: 기존 상태 API data table
장비 목록: 기존 catalog API data table
컬럼 많은 상태: 모든 컬럼이 table header로 보이고 horizontal scroll 가능
데이터 많은 상태: row count가 명확히 보이고 bounded table preview 또는 virtualized table로 표시
```

대량 row를 화면에 전부 DOM으로 렌더링할 필요는 없다. 이 탭은 API data 증거 화면이므로 `total`, `preview row count`, `visible row count`를 명확히 보여주면 된다. A2UI 전달 무결성 검증은 화면 table이 아니라 raw tool result fingerprint 기준으로 한다.

## 6. Flow Board / modal에서 보여줄 내용

시퀀스는 기존 원칙을 유지한다.

```text
business API tool call
business tool result
a2ui_render tool call
A2UI profile/schema/matcher
SurfaceEnvelope result
```

단, modal detail에서 다음 이름이 실제 tool registry와 일치해야 한다.

```text
get_equipment_status
get_equipment_catalog
get_equipment_status_wide_columns
get_equipment_status_large_rows
```

`business-tool-call` modal:

```text
query
apiId
route
business tool
```

`business-tool-result` modal:

```text
raw tool result sample
source fingerprint
row count
column count
```

`a2ui-tool-call` modal:

```text
a2ui_render payload
sourceToolName
sourceToolResultId
sourceDataHash
sampleDataPreview
derivedSchema
```

`a2ui-tool-result` modal:

```text
dataIntegrity.matched
hashMatched
rowCountMatched
byteLengthMatched
selected templateId
```

## 7. E2E 테스트 계획

### 7.1 자동 테스트

추가 또는 수정:

```text
packages/a2ui-python-agent/tests/test_business_tools.py
packages/a2ui-python-agent/tests/test_a2a_client.py
packages/a2ui-python-agent/tests/test_render_boundary.py
packages/a2ui-python-agent/tests/test_derived_schema.py
```

필수 검증:

```text
run_business_tool("get_equipment_status_wide_columns")
  -> api_id = equipment-status-wide-columns
  -> sourceToolName = get_equipment_status_wide_columns
  -> sourceRowCount = 6
  -> sourceDataHash exists

run_business_tool("get_equipment_status_large_rows")
  -> api_id = equipment-status-large-rows
  -> sourceToolName = get_equipment_status_large_rows
  -> sourceRowCount = 1000
  -> sourceDataHash exists

wide columns data
  -> derivedSchema.fields >= 120
  -> template matcher selects equipment.commonStatusTable

large rows data
  -> sampleDataPreview.sampleSize is bounded
  -> sampleDataPreview.rowCount = 1000
  -> template matcher selects equipment.commonStatusTable
```

추가로 business tool registration 자체를 검증한다.

```text
business_tool_for_api("equipment-status-wide-columns")
  -> get_equipment_status_wide_columns

api_id_for_business_tool("get_equipment_status_large_rows")
  -> equipment-status-large-rows

tool metadata
  -> sourceToolName이 실행된 business tool name과 같다.
  -> sourceApiId가 실행된 apiId와 같다.
  -> sourceToolResultId가 존재한다.
```

### 7.2 API route smoke test

추가 후보:

```text
scripts/e2e-a2ui-data-boundary.mjs
```

검증:

```text
GET /api/equipment-status
GET /api/equipment-catalog
GET /api/equipment-status-wide-columns
GET /api/equipment-status-large-rows
```

전제:

```text
npm run dev:all
```

또는 다음이 준비되어 있어야 한다.

```text
Next dev server: http://localhost:3001
main-agent server: http://localhost:8000
```

`/api/equipment-status`, `/api/equipment-catalog`, `/api/equipment-status-wide-columns`, `/api/equipment-status-large-rows`는 Next route에서 기본 fixture를 제공한다. 별도 equipment source server나 `A2UI_EQUIPMENT_*_API_URL` env는 필수가 아니다.

외부 장비 source proxy를 테스트할 때만 다음 env를 선택적으로 설정한다.

```text
A2UI_EQUIPMENT_STATUS_API_URL
A2UI_EQUIPMENT_CATALOG_API_URL
```

각 response는 다음 공통 shape를 가져야 한다.

```text
items: array
total: number
page: number
pageSize: number
```

wide route는 첫 row column count가 120 이상이어야 한다.

large route는 `total >= 1000`이어야 한다.

기존 `/api/equipment-status`, `/api/equipment-catalog`도 env 없이 200을 반환해야 한다. 로컬 `localhost:8100` source env가 남아 있는데 source server가 꺼져 있으면 Next route는 기본 fixture로 fallback한다.

### 7.3 UI E2E 시연 체크

브라우저에서 다음 순서로 확인한다.

```text
1. Reset demo
2. DB Table 탭 클릭
3. 탭이 다음 네 개만 있는지 확인
   - 상태 목록
   - 장비 목록
   - 컬럼 많은 상태
   - 데이터 많은 상태
4. 컬럼 많은 상태 탭 클릭
   - business tool = get_equipment_status_wide_columns
   - column count >= 120
5. 데이터 많은 상태 탭 클릭
   - business tool = get_equipment_status_large_rows
   - row count >= 1000
6. Sequence 탭으로 돌아감
7. Chat quick label "컬럼 많은 상태" 실행
8. Flow Board에서 business tool call -> a2ui_render -> SurfaceEnvelope 순서 확인
9. SurfaceEnvelope templateId가 equipment.commonStatusTable인지 확인
10. Chat quick label "데이터 많은 상태"도 같은 방식으로 확인
```

브라우저 E2E에서 확인할 화면 증거:

```text
DB Table 탭
  - 현재 탭의 API route
  - business tool name
  - rows / columns
  - expected template

Sequence 탭
  - business tool call label
  - business tool result modal의 source fingerprint
  - a2ui_render payload modal의 sourceToolName/sourceDataHash
  - a2ui_render result modal의 dataIntegrity.matched

Chat result
  - statusBooleanList viewType surface가 보인다.
  - templateId 또는 matcher trace가 equipment.commonStatusTable을 가리킨다.
```

시연에서 꼭 말해야 하는 결론:

```text
컬럼이 많아도 전체 raw data는 business tool result로 전달된다.
A2UI 판단에는 bounded preview와 derivedSchema를 사용한다.
렌더링은 기존 상태 목록 template으로 성공한다.

데이터가 많아도 전체 raw data fingerprint는 유지된다.
preview는 잘리지만 rowCount는 보존된다.
렌더링은 기존 상태 목록 template으로 성공한다.
```

## 8. 기존 Alias / Mutated 처리

이번 시연에서는 기본 화면에서 제거한다.

하지만 코드를 완전히 버릴 필요는 없다.

권장 처리:

```text
Alias:
  field alias / normalization 검증용 unit test로 유지 가능.
  기본 DB Table 탭에서는 숨긴다.

Mutated:
  dataIntegrity.matched=false negative test로 유지 가능.
  기본 DB Table 탭에서는 숨긴다.
  별도 "failure demo"가 필요할 때 다시 노출한다.
```

이번 목표에서 가장 중요한 화면 메시지는 실패가 아니라 다음이다.

```text
기존 업무 API와 테스트용 대량 업무 API가 모두 business tool로 등록되어 있다.
Main Agent가 그 tool을 먼저 호출한다.
A2UI는 받은 데이터를 기존 공통 template으로 안정적으로 그린다.
```

## 9. 완료 기준

개발 완료는 다음 조건을 모두 만족해야 한다.

```text
1. DB Table 탭이 상태 목록 / 장비 목록 / 컬럼 많은 상태 / 데이터 많은 상태만 보여준다.
2. 컬럼 많은 상태와 데이터 많은 상태가 실제 Next API route로 존재한다.
3. 두 테스트 API가 Python Main Agent business tool registry에 등록되어 있다.
4. Chat quick label로 두 테스트 tool 흐름을 실행할 수 있다.
5. Flow Board에는 실제 business tool name이 표시된다.
6. business tool result 이후 a2ui_render tool이 반드시 실행된다.
7. wide columns 케이스가 equipment.commonStatusTable로 렌더링된다.
8. large rows 케이스가 equipment.commonStatusTable로 렌더링된다.
9. source/received dataIntegrity.matched=true가 trace에 남는다.
10. `npm run main-agent:test`, `npm run lint`, `npm run build`가 통과한다.
```

## 10. 수행 결과

이 문서 기준 작업은 현재 구현에 반영되었다.

완료된 항목:

```text
1. DB Table 탭 scenario를 상태 목록 / 장비 목록 / 컬럼 많은 상태 / 데이터 많은 상태로 정리했다.
2. /api/equipment-status-wide-columns route를 추가했다.
3. /api/equipment-status-large-rows route를 추가했다.
4. 두 테스트 route는 src/server/equipment/equipment-test-data.ts deterministic generator를 사용한다.
5. Python Main Agent business tool registry에 다음 tool을 등록했다.
   - get_equipment_status_wide_columns
   - get_equipment_status_large_rows
6. A2UI runtime / A2A handler / MCP schema가 새 apiId 두 개를 허용한다.
7. Chat quick label에 컬럼 많은 상태 / 데이터 많은 상태를 추가했다.
8. Flow Board trace modal에서 business tool result, a2ui_render payload, derived schema, matcher, dataIntegrity를 새 tool 이름 기준으로 볼 수 있다.
9. scripts/e2e-a2ui-data-boundary.mjs를 추가했다.
10. package.json에 npm run e2e:data-boundary를 추가했다.
```

검증 결과:

```text
npm run main-agent:test
  -> 31 tests passed

npm run lint
  -> passed
  -> 기존 a2ui-demo-renderer.tsx의 <img> warning 1개만 남음

npm run build
  -> passed
  -> route list에 /api/equipment-status-wide-columns, /api/equipment-status-large-rows 포함

npm run e2e:data-boundary
  -> MCP apiId enum includes large-data test APIs
  -> wide columns API rows=6 columns=129
  -> large rows API rows=1000
  -> wide columns selects equipment.commonStatusTable
  -> large rows selects equipment.commonStatusTable
```

브라우저 확인:

```text
DB Table 탭
  - 상태 목록 / 장비 목록 / 컬럼 많은 상태 / 데이터 많은 상태 라벨 확인
  - 컬럼 많은 상태: /api/equipment-status-wide-columns, columns=129, expected template=equipment.commonStatusTable
  - 데이터 많은 상태: /api/equipment-status-large-rows, preview 80/1000, expected template=equipment.commonStatusTable

Sequence 탭
  - Business tool result modal에서 대량 데이터 source fingerprint rows=1000 확인
```

## 11. 검수 후 보완

추가 검수에서 다음 두 가지를 수정했다.

```text
1. A2UI runtime의 prompt fallback에 wide/large keyword rule을 추가하지 않도록 되돌렸다.
   - 새 테스트 API 선택 책임은 문서 원칙대로 Main Agent의 LLM classifier에 둔다.
   - A2UI runtime / A2A / MCP는 새 apiId를 허용하고 렌더링만 담당한다.

2. Flow Board 본문 라벨과 modal detail을 실제 business tool 기준으로 보강했다.
   - 선택된 lab scenario에서는 Call get_equipment_status_large_rows 같은 실제 tool name이 보인다.
   - live chat event에서도 event data의 sourceToolName/label을 읽어 실제 tool name을 표시한다.
   - business-tool-call modal에 query/apiId/route/tool/policy가 모두 표시된다.
   - business-tool-result modal에 column count가 표시된다.
   - a2ui_render payload modal에 sourceToolName/sourceToolResultId/sourceDataHash가 표시된다.
   - a2ui_render result modal에 selected templateId가 표시된다.
```

재검증:

```text
npm run main-agent:test
  -> 31 tests passed

npm run lint
  -> passed
  -> 기존 a2ui-demo-renderer.tsx의 <img> warning 1개만 남음

npm run build
  -> passed

npm run e2e:data-boundary
  -> passed
  -> wide columns / large rows 모두 equipment.commonStatusTable 선택

브라우저 확인
  -> Flow Board 본문에 Call get_equipment_status_large_rows 표시 확인
  -> business-tool-call modal에서 apiId/route/tool 표시 확인
```

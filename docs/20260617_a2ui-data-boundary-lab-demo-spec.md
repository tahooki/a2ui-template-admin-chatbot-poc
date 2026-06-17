# A2UI Data Boundary Lab Demo Spec

Date: 2026-06-17

## 1. 목적

이 문서는 A2UI 전달 무결성, 데이터 변환, matcher 판단 안정성을 사용자가 화면에서 이해할 수 있게 보여주는 시연 UI를 정리한다.

기존 Flow Board는 다음을 보여준다.

```text
누가 누구를 호출했는가?
어떤 순서로 business API tool -> a2ui_render -> A2UI Agent가 실행되는가?
```

새로 필요한 Data Boundary Lab은 다음을 보여준다.

```text
어떤 API data가 들어왔는가?
컬럼명이 달라도 같은 의미의 data로 해석되는가?
원본 data와 A2UI가 받은 data가 같은가?
raw data가 어떤 schema/normalized form으로 변환되었는가?
A2UI template matcher가 어떤 값끼리 비교했고 왜 같은 template을 골랐는가?
```

한마디로, Flow Board가 "호출 흐름"의 시연이라면 Data Boundary Lab은 "데이터가 안전하게 전달되고 판단되는 과정"의 시연이다.

## 2. 핵심 시연 메시지

이 화면이 전달해야 하는 메시지는 다음이다.

```text
서로 다른 업무 API가 컬럼명은 달라도 의미적으로 같은 데이터를 반환할 수 있다.
Main Agent는 그 raw result를 a2ui_render에 전달한다.
A2UI는 raw data 전체의 전달 무결성을 fingerprint로 확인한다.
동시에 raw data에서 preview/schema/field mapping을 만들어 공용 A2UI template과 비교한다.
매칭 가능한 경우 같은 A2UI 공용 template으로 그린다.
매칭이 애매하거나 변형된 경우에는 비교 값과 reason을 trace로 보여준다.
```

## 3. Demo 이름

추천 화면 이름:

```text
Data Boundary Lab
```

보조 표기:

```text
API Data
Integrity
Conversion
Matcher Trace
```

## 4. 전체 화면 구조

현재 화면의 주요 영역을 유지하되, 가운데 패널에는 API data table과 A2UI preview를 추가하고, 시퀀스 다이어그램에는 클릭 가능한 data trace detail을 추가한다.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Header                                                              │
├───────────────────┬───────────────────────────────────┬─────────────┤
│ Template/Admin    │ Data Boundary Lab                 │ Chat        │
│                   │                                   │             │
│                   │ [Scenario tabs]                   │             │
│                   │ [API tabs]                        │             │
│                   │ [Raw API Data Table]              │             │
│                   │ [A2UI Render Preview]             │             │
├───────────────────┴───────────────────────────────────┴─────────────┤
│ Flow Board                                                           │
│ clickable sequence labels -> Sequence Trace Detail inside diagram     │
└─────────────────────────────────────────────────────────────────────┘
```

대안:

```text
Data Boundary Lab은 API table과 preview만 담당한다.
Flow Board는 sequence와 단계별 detail panel을 함께 담당한다.
```

시연 목적을 생각하면 sequence detail은 Flow Board 안에 있는 편이 좋다. 사용자가 호출 순서를 보다가 특정 label을 클릭하면, 그 단계에서 실제로 생성/전달/변환/비교된 값을 같은 시퀀스 다이어그램 안에서 바로 확인할 수 있기 때문이다.

### 4.1 Detail Panel 표시 위치

각 단계 클릭 시 보여주는 detail은 가운데 `Data Boundary Lab` 패널이 아니라 `Flow Board / Sequence Diagram` 영역 안에 표시한다.

권장 배치:

```text
Flow Board
  ├─ Sequence Diagram
  │   ├─ clickable labels
  │   └─ selected label highlight
  └─ Sequence Trace Detail Panel
```

Desktop에서는 `Sequence Diagram`과 `Sequence Trace Detail Panel`을 같은 Flow Board 안에서 나란히 또는 상하 split으로 보여준다.

```text
┌──────────────────────────────────────────────────────────┐
│ Flow Board                                               │
├──────────────────────────────────────────────────────────┤
│ Agent Sequence Diagram                                   │
├──────────────────────────────┬───────────────────────────┤
│ Sequence Lines / Labels      │ Sequence Trace Detail     │
│ 클릭 가능한 단계 라벨        │ 클릭한 단계의 데이터 증거 │
├──────────────────────────────┴───────────────────────────┤
│ System Log or compact trace summary                      │
└──────────────────────────────────────────────────────────┘
```

좁은 화면에서는 `Sequence Trace Detail Panel`을 시퀀스 다이어그램 아래의 bottom drawer처럼 보여준다.

중요한 위치 규칙:

```text
Template/Admin 영역에는 보여주지 않는다.
Chat 영역에는 보여주지 않는다.
가운데 Data Boundary Lab의 raw table 영역에는 단계별 상세를 끼워 넣지 않는다.
Flow Board label 자체 안에 긴 내용을 펼치지 않는다.
Flow Board label을 클릭하면 같은 Flow Board 안의 Sequence Trace Detail 영역이 바뀐다.
```

## 5. 공용 A2UI Template

시연에는 공용 template 하나를 만든다.

추천 template:

```text
equipment.commonStatusTable
```

목적:

```text
장비 목록 또는 장비 상태 목록을 한 template으로 표현한다.
컬럼명이 달라도 semantic slot이 같으면 같은 template으로 렌더링한다.
```

공용 template의 required slots:

```text
id
title
statusFlags
metric optional
updatedAt optional
location optional
```

개발 기준 주의:

```text
현재 프로젝트의 A2UITemplateSlot 타입은 name/role/acceptedTypes가 아니라
slot/acceptsTypes/acceptsRoles를 사용한다.

현재 renderer의 statusBooleanList는 boolean field를 ON/OFF로 그린다.
따라서 "Y"/"N", "RUN"/"STOP" 같은 string-coded status를 같은 template으로 그리려면
raw data -> normalized display data 변환 또는 renderer mapping/transform 확장이 필요하다.
```

현재 코드 타입에 맞춘 예시:

```json
{
  "componentId": "equipment.commonStatusTable",
  "title": "공용 장비 상태 테이블",
  "schemaSpec": {
    "dataShape": "array<object>",
    "listPath": "items",
    "requiredRoles": ["title", "booleanFlag"],
    "minBooleanFields": 3,
    "fieldHints": {
      "title": ["name", "equipmentName", "eqpNm", "asset_name"],
      "booleanFlag": ["isOnline", "isRunning", "hasAlarm", "needsInspection", "opYn", "runYn", "inspReqYn"]
    },
    "intentKeywords": ["상태", "장비 상태", "가동", "점검", "알람"]
  },
  "inputSchema": {
    "schemaVersion": "2026-06-11",
    "accepts": {
      "shape": ["array<object>"],
      "minRows": 1,
      "capabilities": {
        "hasBooleans": true,
        "hasStatus": true
      }
    },
    "requiredSlots": [
      {
        "slot": "items[].title",
        "acceptsTypes": ["string"],
        "acceptsRoles": ["title", "label"],
        "required": true
      },
      {
        "slot": "items[].statusFlags",
        "acceptsTypes": ["boolean"],
        "acceptsRoles": ["booleanFlag", "status"],
        "minCount": 3,
        "required": true
      }
    ],
    "optionalSlots": [
      {
        "slot": "items[].metric",
        "acceptsTypes": ["number"],
        "acceptsRoles": ["metric"],
        "required": false
      },
      {
        "slot": "items[].updatedAt",
        "acceptsTypes": ["date", "datetime", "string"],
        "acceptsRoles": ["updatedAt", "time"],
        "required": false
      }
    ],
    "selectionHints": {
      "queryKeywords": ["상태", "장비 상태", "가동", "점검", "알람"],
      "bestFor": ["equipment status table", "asset status table"],
      "priority": 90
    }
  },
  "surfaceConfig": {
    "viewType": "statusBooleanList",
    "titleBinding": "items[].name",
    "statusBindings": ["items[].isOnline", "items[].isRunning", "items[].hasAlarm", "items[].needsInspection"],
    "maxItems": 6
  }
}
```

`equipment.commonStatusTable`은 새 renderer viewType이 아니라 새 template id다. 실제 렌더러는 기존 `statusBooleanList` viewType을 재사용한다.

이 template 하나로 여러 API variant가 같은 UI로 그려지는 것을 보여주려면 다음 중 하나를 구현해야 한다.

```text
Option A. raw API data를 canonical display data로 normalize한다.
  예: eqpNm -> name, opYn -> isOnline, runYn -> isRunning, alrmCnt > 0 -> hasAlarm
  renderer는 normalized data의 items[].name/items[].isOnline 등을 사용한다.

Option B. renderer/mapping layer가 A2UIMappingDecision을 surfaceConfig보다 우선해서 사용한다.
  예: mapping slot items[].title -> items[].eqpNm 이면 titleBinding을 mapping 값으로 사용한다.

MVP에서는 Option A가 더 설명하기 쉽다.
전달 무결성 비교는 raw data 기준으로 유지하고, 화면 판단/렌더 시연에는 normalized display data를 별도 trace로 보여준다.
```

## 6. API Variant Fixtures

시연용 API는 같은 의미의 데이터를 다른 컬럼명과 타입으로 만든다.

### 6.1 API A: Standard Equipment Status

현재 프로젝트의 기본 형태에 가까운 데이터다.

```json
{
  "items": [
    {
      "id": "eq-001",
      "name": "CNC 가공기 01",
      "isOnline": true,
      "isRunning": false,
      "hasAlarm": true,
      "needsInspection": false,
      "updatedAt": "2026-06-17T10:00:00Z"
    }
  ],
  "total": 100
}
```

예상 mapping:

```text
id -> id
name -> title
isOnline -> statusFlags
isRunning -> statusFlags
hasAlarm -> statusFlags
needsInspection -> statusFlags
updatedAt -> updatedAt
```

### 6.2 API B: Factory Alias Status

실제 공장 API처럼 축약 컬럼명을 사용한다.

```json
{
  "items": [
    {
      "eqpId": "EQ-001",
      "eqpNm": "CNC 가공기 01",
      "opYn": "Y",
      "runYn": "N",
      "alrmCnt": 3,
      "inspReqYn": "Y",
      "lastDtm": "2026-06-17T10:00:00Z"
    }
  ],
  "total": 100
}
```

예상 mapping:

```text
eqpId -> id
eqpNm -> title or normalized name
opYn -> normalized isOnline
runYn -> normalized isRunning
alrmCnt > 0 -> normalized hasAlarm
inspReqYn -> normalized needsInspection
lastDtm -> updatedAt
```

개발 기준:

```text
현재 기본 role inference만으로는 eqpNm/opYn/runYn 같은 축약명을 항상 title/status로 인식한다고 보장할 수 없다.
따라서 이 시나리오를 성공 시연으로 만들려면 alias dictionary, fixture adapter, 또는 normalized display data 생성이 필요하다.
```

### 6.3 API C: Wide Column Status

필요한 컬럼 외에 많은 부가 컬럼이 있는 데이터다.

```json
{
  "items": [
    {
      "asset_id": "A-001",
      "asset_name": "CNC 가공기 01",
      "state_code": "RUN",
      "alarm_count": 3,
      "metric_001": 12.4,
      "metric_002": 8.1,
      "extra_001": "...",
      "extra_100": "..."
    }
  ],
  "total": 100
}
```

예상 mapping:

```text
asset_id -> id
asset_name -> title
state_code -> normalized status flag or status label
alarm_count -> metric
```

중요한 시연 포인트:

```text
컬럼이 많아도 필요한 field를 찾아 공용 template에 매핑한다.
관련 없는 컬럼은 table에서는 모두 보이지만 template mapping에는 사용되지 않을 수 있다.
```

### 6.4 API D: Nested Unsupported Shape

현재 adapter가 없으면 바로 정상 equipment response로 읽히지 않을 수 있는 형태다.

```json
{
  "result": {
    "rows": [
      {
        "id": "eq-001",
        "name": "CNC 가공기 01",
        "status": "RUN"
      }
    ],
    "totalCount": 100
  },
  "success": true
}
```

예상 결과:

```text
adapter가 없으면 fallback 또는 unsupported shape trace
adapter가 있으면 result.rows -> items로 변환 후 공용 template 렌더
```

이 케이스는 "현재 한계" 또는 "adapter 필요성"을 보여주기 좋다.

## 7. 가운데 패널: API Data Table

가운데 패널에는 API별 raw data를 탭으로 보여준다.

탭 예시:

```text
Standard
Alias
Wide Columns
Nested
Mutated
```

각 탭에서 보여줄 것:

```text
API name
row count
column count
byte length
raw data table
```

테이블 요구사항:

```text
API마다 별도 table을 보여준다.
해당 API의 모든 컬럼을 보여준다.
컬럼이 많으면 horizontal scroll을 허용한다.
row가 많으면 pagination 또는 virtualized table을 사용한다.
cell 값은 raw value 그대로 보여준다.
boolean/string/number/null 타입이 구분되도록 작은 type chip을 붙일 수 있다.
```

테이블 상단 summary:

```text
Rows: 10,000
Columns: 104
Bytes: 2.4 MB
Shape: object{items:array<object>}
Preview: 10 rows / truncated
```

이 패널의 목적:

```text
사용자가 "실제로 어떤 API 데이터가 들어왔는지" 먼저 본다.
그 다음 sequence label을 클릭해서 이 raw data가 어떻게 전달/변환/비교됐는지 본다.
```

## 8. A2UI Render Preview

API table과 같은 패널 안에 공용 template 렌더 결과를 보여준다.

권장 layout:

```text
┌─────────────────────────────────────────┐
│ API Data Table                          │
├─────────────────────────────────────────┤
│ A2UI Common Template Preview            │
│ equipment.commonStatusTable             │
└─────────────────────────────────────────┘
```

시연 포인트:

```text
Standard API도 commonStatusTable로 렌더링된다.
Alias API도 같은 commonStatusTable로 렌더링된다.
Wide Columns API도 같은 commonStatusTable로 렌더링된다.
Nested API는 adapter 여부에 따라 fallback 또는 commonStatusTable로 렌더링된다.
```

여기서 중요한 것은 "같은 template"이 보이는 것이다.

```text
컬럼명이 다르다.
하지만 semantic mapping 결과가 같아서 같은 A2UI template으로 그려진다.
```

## 9. Sequence Label Click Detail

Flow Board의 모든 label에 detail을 붙일 필요는 없다. 데이터가 실제로 생성/전달/변환/비교/판단되는 label만 클릭 가능하게 한다.

클릭 가능한 label:

```text
Call business API tool
Business tool result
Run a2ui_render
Build profile / schema
Load template contracts
Match template / fields
a2ui_render result
Return SurfaceEnvelope
```

각 label을 클릭하면 Flow Board 안의 Sequence Trace Detail Panel이 열린다.

표시 위치:

```text
Flow Board / Sequence Diagram 영역 안의 Sequence Trace Detail Panel
```

## 10. Detail Panel 타입

### 10.1 Call business API tool

목적:

```text
어떤 API tool이 호출됐는지 보여준다.
```

표시 내용:

```text
toolName: get_equipment_status_alias
apiVariant: Alias
requestQuery: 사용자 메시지
apiId: equipment-status
calledAt
```

데이터는 아직 결과가 나오기 전이므로 raw data table 전체보다는 호출 metadata 중심으로 보여준다.

### 10.2 Business tool result

목적:

```text
Main Agent가 업무 API tool로 받은 원본 결과를 보여준다.
```

표시 내용:

```text
raw data table
sourceDataHash
sourceRowCount
sourceDataByteLength
sourceDataShape
sourceTopLevelKeys
```

표현 예:

```text
Source fingerprint
  hash: 9b2f...a18c
  rows: 10,000
  bytes: 2,481,930
  shape: object{items:array<object>}
```

### 10.3 Run a2ui_render

목적:

```text
business tool result가 a2ui_render로 전달되는 payload를 보여준다.
```

표시 내용:

```text
query
apiId
sourceToolName
sourceToolResultId
renderToolName
renderToolCallPolicy
data reference summary
```

여기서 raw data 전체를 또 복사해서 보여주기보다는 동일 data reference와 fingerprint를 보여준다.

```text
data: same as Business tool result
sourceDataHash: 9b2f...a18c
```

### 10.4 Build profile / schema

목적:

```text
raw data가 A2UI 판단용 preview/schema로 변환되는 전후를 보여준다.
```

표시 내용:

```text
Before
  raw rows
  raw columns
  raw byte length
  raw shape

After: sampleDataPreview
  rowCount
  sampleSize
  truncated
  byteLength
  maskedFields

After: derivedSchema
  fields
  capabilities
  primaryArrayPath
```

권장 UI:

```text
[Before: Raw API Data] | [After: Preview] | [After: Derived Schema]
```

비교 예:

```text
Raw rows: 10,000
Preview sampleSize: 10
DerivedSchema rowCount: 10,000
Truncated: true
```

이 단계에서 가장 중요한 메시지:

```text
판단용 preview는 줄어들지만 원본 rowCount는 유지된다.
```

### 10.5 Load template contracts

목적:

```text
A2UI Registry에서 어떤 template contract를 불러왔는지 보여준다.
```

표시 내용:

```text
templateId
inputSchema
requiredSlots
optionalSlots
selectionHints
```

공용 template 시연에서는 다음이 강조되어야 한다.

```text
templateId: equipment.commonStatusTable
requiredSlots: title, statusFlags
optionalSlots: metric, updatedAt, location
```

### 10.6 Match template / fields

목적:

```text
derivedSchema와 template inputSchema가 어떤 값끼리 비교됐고 어떤 판단이 나왔는지 보여준다.
```

표시 내용:

```text
Derived field
Template slot
Type match
Role match
Name/alias match
Score contribution
Decision
```

테이블 예:

| Derived field | Template slot | Type | Role | Alias / normalization | Decision |
| --- | --- | --- | --- | --- | --- |
| `items.eqpNm` | `items[].title` | string match | title/label | alias to `name` | selected |
| `items.opYn` | `items[].statusFlags` | string before normalization | status | normalized to `isOnline:boolean` | selected after conversion |
| `items.alrmCnt` | `items[].metric` | number match | metric | alias to alarm count | selected |

개발 기준:

```text
현재 template matcher의 slot 비교는 acceptsTypes/acceptsRoles 기준이다.
`opYn`이 string이면 statusBooleanList의 boolean slot에는 그대로 매칭되지 않는다.
따라서 demo에서 "same template render"를 보여주려면
conversion 결과인 normalized boolean field를 derivedSchema/mapping/renderer 중 어디에서 사용할지 구현해야 한다.
```

상단 summary:

```text
strategy: derived_schema
template: equipment.commonStatusTable
score: 0.91
mode: render_surface
reason: Template inputSchema matched derived schema
```

fallback일 경우:

```text
mode: text_fallback
reason: Required slot title was not mapped
rejectedCandidates: [...]
```

### 10.7 a2ui_render result

목적:

```text
최종 render tool result와 dataIntegrity 결과를 함께 보여준다.
```

표시 내용:

```text
renderToolName
renderToolCallPolicy
sourceToolName
sourceToolResultId
dataIntegrity
matcher result
surface or fallback
```

Integrity 비교 UI:

| Check | Source | Received | Result |
| --- | --- | --- | --- |
| Hash | `9b2f...a18c` | `9b2f...a18c` | MATCH |
| Rows | `10000` | `10000` | MATCH |
| Bytes | `2481930` | `2481930` | MATCH |

Mutation 케이스:

| Check | Source | Received | Result |
| --- | --- | --- | --- |
| Hash | `9b2f...a18c` | `7ac1...22de` | MISMATCH |
| Rows | `10000` | `9999` | MISMATCH |
| Bytes | `2481930` | `2481688` | MISMATCH |

### 10.8 Return SurfaceEnvelope

목적:

```text
Chat UI에 반환되는 최종 surface envelope를 보여준다.
```

표시 내용:

```text
templateId
surface kind
data rows used by renderer
fieldMapping
decision trace
dataIntegrity summary
```

여기서는 raw data 전체보다 renderer가 실제 사용하는 mapped data를 보여준다.

## 11. 데이터 변환 전후 표현

Data Boundary Lab은 단순히 table을 보여주는 것이 아니라 변환 전후를 보여줘야 한다.

변환 단계:

```text
Raw API Data
  -> Normalized Rows or Sample Preview
  -> Derived Schema
  -> Template Slot Mapping
  -> SurfaceEnvelope Data
```

각 단계별 표시:

```text
Raw API Data
  모든 컬럼과 raw value를 보여준다.

Normalized Rows
  column alias/type conversion이 있다면 전후를 보여준다.

Sample Preview
  raw data 중 matcher가 볼 bounded subset을 보여준다.

Derived Schema
  field path/type/role/capability를 보여준다.

Template Slot Mapping
  어떤 field가 어떤 template slot에 들어갔는지 보여준다.

SurfaceEnvelope Data
  renderer에 최종 전달되는 mapped data를 보여준다.
```

## 12. Type Conversion 표시

컬럼명이 다르거나 타입이 다른 API는 변환 전후가 보여야 한다.

예:

| Raw field | Raw value | Conversion | Converted value | Reason |
| --- | --- | --- | --- | --- |
| `opYn` | `"Y"` | string status -> boolean/status | `true` or `online` | alias rule |
| `runYn` | `"N"` | string status -> boolean/status | `false` or `stopped` | alias rule |
| `alrmCnt` | `3` | number -> metric/status | `3` | metric role |
| `lastDtm` | `"2026-06-17T10:00:00Z"` | string -> datetime | same value | datetime format |

주의:

```text
현재 구현에 실제 normalization layer가 없다면 UI는 "Derived interpretation"으로만 표시한다.
하지만 string-coded status를 statusBooleanList로 실제 렌더링하려면 interpretation만으로는 부족하다.
renderer가 Boolean("N")을 true로 볼 수 있으므로, "N" 같은 raw string을 그대로 status boolean field로 쓰면 안 된다.

실제 값 자체를 바꾸는 conversion과 schema/matcher가 의미를 해석하는 interpretation은 구분해야 한다.
```

권장 용어:

```text
Raw value
Interpreted as
Mapped slot
```

실제 변환 layer를 추가한 뒤에는 다음 용어를 쓴다.

```text
Before conversion
After conversion
Normalized display data
```

## 13. 비교 값 표현

비교가 발생하는 곳은 크게 두 가지다.

### 13.1 Source vs Received 비교

전달 무결성 비교다.

```text
sourceDataHash vs receivedHash
sourceRowCount vs receivedRowCount
sourceDataByteLength vs receivedByteLength
```

표시 위치:

```text
a2ui_render result detail
Business tool result detail
Run a2ui_render detail
```

### 13.2 DerivedSchema vs Template InputSchema 비교

matcher 판단 비교다.

```text
derived field type vs template acceptsTypes
derived field role vs template acceptsRoles
derived field path/key vs slot hints
derived capabilities vs template required capabilities
derived rowCount vs template minRows/maxRows
```

표시 위치:

```text
Match template / fields detail
Load template contracts detail
```

## 14. 시연 Scenario

### 14.1 Scenario 1: 같은 template, 표준 API

사용자 행동:

```text
Standard tab 선택
"장비 상태 보여줘" 실행
```

보여줄 것:

```text
Raw table에 standard columns 표시
Flow Board에서 Business tool result 클릭
source fingerprint 확인
Match template / fields 클릭
name/isOnline/hasAlarm이 common template slot에 mapping됨
Return SurfaceEnvelope 클릭
equipment.commonStatusTable로 렌더됨
```

### 14.2 Scenario 2: 같은 template, alias API

사용자 행동:

```text
Alias tab 선택
"장비 상태 보여줘" 실행
```

보여줄 것:

```text
Raw table에는 eqpNm, opYn, alrmCnt가 보임
Build profile / schema 클릭
eqpNm이 title 후보로 해석됨
opYn이 status 후보로 해석됨
Match template / fields 클릭
standard API와 같은 equipment.commonStatusTable이 선택됨
```

시연 메시지:

```text
컬럼명이 달라도 semantic mapping으로 같은 A2UI template을 쓸 수 있다.
```

### 14.3 Scenario 3: wide columns

사용자 행동:

```text
Wide Columns tab 선택
```

보여줄 것:

```text
Raw table에는 모든 column이 보임
column count가 크게 표시됨
Derived schema에는 필요한 role 후보와 많은 extra fields가 표시됨
Matcher는 required slot에 필요한 field만 선택함
```

시연 메시지:

```text
컬럼이 많아도 A2UI가 모든 컬럼을 surface에 억지로 쓰지 않는다.
template contract에 필요한 field만 mapping한다.
```

### 14.4 Scenario 4: mutated data

사용자 행동:

```text
Mutated tab 선택
```

보여줄 것:

```text
Business tool result의 source fingerprint
a2ui_render result의 received fingerprint
hash/row/byte mismatch
```

시연 메시지:

```text
중간에 data가 손실되거나 변형되면 비교 값으로 잡힌다.
이 케이스의 성공은 surface 생성이 아니라 mismatch 감지다.
```

### 14.5 Scenario 5: nested unsupported shape

사용자 행동:

```text
Nested tab 선택
```

보여줄 것:

```text
Raw table 또는 JSON tree에 result.rows 구조 표시
Matcher detail에 unsupported shape 또는 adapter required 표시
fallback reason 표시
```

시연 메시지:

```text
지원하지 않는 API shape은 조용히 틀린 UI를 만들지 않고 한계가 드러나야 한다.
adapter를 추가하면 이 케이스도 common template으로 보낼 수 있다.
```

## 15. UI 상태 모델

Data Boundary Lab에는 현재 선택된 scenario와 현재 클릭된 sequence step이 있어야 한다.

```ts
type DataBoundaryScenario =
  | "standard"
  | "alias"
  | "wide_columns"
  | "mutated"
  | "nested";

type DataTraceStep =
  | "business_tool_call"
  | "business_tool_result"
  | "a2ui_render_call"
  | "profile_schema"
  | "template_contracts"
  | "matcher"
  | "a2ui_render_result"
  | "surface";
```

각 scenario run은 다음 trace를 남긴다.

```ts
type DataBoundaryTrace = {
  scenario: DataBoundaryScenario;
  rawData: unknown;
  sourceSnapshot?: {
    hash: string;
    rowCount: number;
    byteLength: number;
    shape: string;
  };
  receivedSnapshot?: {
    hash: string;
    rowCount: number;
    byteLength: number;
    shape: string;
  };
  integrity?: {
    hashMatched?: boolean;
    rowCountMatched?: boolean;
    byteLengthMatched?: boolean;
    matched?: boolean;
  };
  sampleDataPreview?: unknown;
  derivedSchema?: unknown;
  templateContracts?: unknown[];
  matcher?: {
    strategy?: string;
    score?: number;
    templateId?: string;
    candidates?: unknown[];
    mapping?: unknown;
    reason?: string;
  };
  surface?: unknown;
};
```

## 16. 구현 단위

추천 구현 순서:

```text
1. standard/alias/wide/nested/mutated fixture 추가
2. raw data table에 모든 컬럼을 보여주는 Data Boundary Lab 패널 추가
3. source/received integrity trace를 수집하는 구조 추가
4. alias/string-coded status를 canonical display data로 바꾸는 normalization trace 추가
5. 공용 template equipment.commonStatusTable 추가
6. common template이 기존 statusBooleanList viewType을 재사용하게 구성
7. scenario 실행 시 기존 Main Agent flow와 연결
8. Flow Board label 클릭 상태 추가
9. 클릭 가능한 label에 Sequence Trace Detail Panel 연결
10. source/received integrity 비교표 추가
11. before/after preview/schema/mapping detail 추가
12. alias/wide data가 같은 template으로 그려지는 시연 고정
```

최소 시연 버전:

```text
standard
alias
wide_columns
mutated
```

`nested`는 adapter 논의를 보여주는 확장 시연으로 둔다.

개발 순서상 `alias/wide data가 같은 template으로 그려지는 시연`은 normalization 또는 mapping 우선 렌더링이 들어간 뒤에 고정한다. 이 작업 없이 template만 추가하면 matcher trace는 그럴듯해 보여도 실제 renderer가 기존 `items[].name`, `items[].isOnline` 같은 binding을 찾지 못할 수 있다.

## 17. 기존 Flow Board와의 연결

Flow Board label은 지금처럼 흐름을 보여주되, 일부 label만 clickable state를 가진다.

클릭 가능한 label은 hover/focus 시 다음처럼 보여준다.

```text
cursor: pointer
subtle outline
tooltip: View data trace
```

클릭하면 Flow Board 안의 Sequence Trace Detail Panel이 해당 단계로 전환된다.

예:

```text
Business tool result 클릭
  -> Sequence Trace Detail Panel이 Source Tool Result view로 전환
  -> raw table + source fingerprint 표시

Build profile / schema 클릭
  -> Sequence Trace Detail Panel에 Before/After view 표시

Match template / fields 클릭
  -> Sequence Trace Detail Panel에 Derived field vs Template slot 비교표 표시

a2ui_render result 클릭
  -> Sequence Trace Detail Panel에 Integrity comparison table 표시
```

## 18. 화면에서 보여주지 않아도 되는 것

모든 내부 값을 다 보여줄 필요는 없다.

보여주지 않아도 되는 것:

```text
전체 A2A protocol envelope 전문
LLM prompt 전문
fallback text 생성용 내부 prompt
모든 후보 template의 전체 JSON
큰 raw JSON 전문
```

대신 다음은 반드시 보여준다.

```text
raw data table
source/received fingerprint 비교
preview rowCount/sampleSize/truncated
derived field path/type/role
template slot mapping
matcher score/reason
surface templateId
```

## 19. 이 시연의 성공 기준

시연이 성공하려면 사용자가 다음을 눈으로 확인할 수 있어야 한다.

```text
1. API마다 raw table이 다르게 보인다.
2. 컬럼명이 달라도 같은 공용 A2UI template으로 그려질 수 있다.
3. raw data 전체 기준 source/received 비교가 보인다.
4. preview/schema 변환 전후가 보인다.
5. matcher가 어떤 field와 template slot을 비교했는지 보인다.
6. data가 변형되면 mismatch가 빨간 상태로 보인다.
7. 지원하지 않는 shape은 틀린 UI가 아니라 fallback/reason으로 보인다.
```

## 20. 최종 시연 스토리

발표 흐름은 다음처럼 가져가면 된다.

```text
1. Standard API를 실행한다.
   기본 장비 상태 데이터가 commonStatusTable로 렌더링된다.

2. Alias API를 실행한다.
   raw table의 컬럼명이 eqpNm/opYn/alrmCnt로 바뀐다.
   하지만 matcher detail에서 같은 semantic slot으로 mapping되고 같은 commonStatusTable이 선택된다.

3. Wide Columns API를 실행한다.
   컬럼이 많아도 table에는 모두 보인다.
   template mapping에는 필요한 field만 선택된다.

4. Mutated API를 실행한다.
   source와 received hash/row/byte 비교가 실패한다.
   전달 중 손실/변형이 감지되는 것을 보여준다.

5. Nested API를 실행한다.
   현재 adapter가 없으면 fallback/reason을 보여준다.
   adapter가 있으면 result.rows를 normalized rows로 바꿔 같은 template으로 보낼 수 있음을 설명한다.
```

이렇게 하면 기존 sequence 시연 위에 데이터 검증 시연이 자연스럽게 올라간다.

```text
Flow Board
  실행 순서를 보여준다.

Data Boundary Lab
  각 단계의 실제 data, 변환, 비교, 판단을 보여준다.

Common A2UI Template Preview
  서로 다른 API shape이 같은 UI contract로 수렴하는 것을 보여준다.
```

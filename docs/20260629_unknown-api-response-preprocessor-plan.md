# Unknown API Response Preprocessor Plan

Date: 2026-06-29

## 1. 목적

이 문서는 현재 A2UI POC에 붙일 **API 응답 전처리기**를 기획한다.

전처리기의 목적은 AI가 만들고 있는 비교용 데이터 스키마를 대체하는 것이 아니다.

```text
전처리기 output = Observed Source
AI comparison_data output = Comparison Data Schema
```

즉, 전처리기는 raw API response에서 실제로 존재하는 데이터 위치와 field path를 관찰하고, AI는 그 관찰 결과를 보고 비교용 데이터 스키마를 만든다.

## 2. 프로젝트 검수 결과

현재 프로젝트에는 이미 두 흐름이 있다.

```text
deterministic path:
  raw API data
    -> buildSampleDataPreview
    -> buildDerivedSchema
    -> matchA2UITemplate
    -> renderPlan / surface

AI path:
  raw API data
    -> planA2UISurfaceWithAI
    -> comparison_data
    -> template_selection
    -> slot_mapping
    -> applyPlan
    -> normalized EquipmentApiResponse(items)
    -> renderPlan / surface
```

현재 `recommendTemplate`는 raw data가 있으면 `planA2UISurfaceWithAI`를 먼저 시도한다. 따라서 전처리기 1차 연결 우선순위는 deterministic matcher보다 AI planner 앞단이다.

현재 코드에서 확인한 한계는 다음이다.

```text
src/server/a2ui-admin/a2ui-ai-surface-planner.ts
  - extractRows, fieldPaths, sourceFieldSummaries, projectRowsForPrompt가 top-level row key 중심이다.
  - AI comparison_data 검증은 fieldPaths(extracted.rows, arrayPath) 안의 sourcePath만 허용한다.
  - fieldMappings/slotMappings 적용은 sourceKey(path), 즉 마지막 key로 row 값을 읽는다.
  - deep row path가 들어오면 getValue(row, "a.b.c")가 필요하다.

src/server/a2ui-admin/schema-matcher/sample-data-preview.ts
  - items, rows, result/data/payload 아래 items/rows/list 정도만 찾는다.
  - 임의 깊이의 array<object> 후보를 recursive하게 찾지는 않는다.

src/server/a2ui-admin/schema-matcher/derived-schema-builder.ts
  - row field 추출이 Object.keys(row) 기반이다.
  - equipment.profile.displayName 같은 leaf field를 DerivedSchemaField로 만들지 못한다.

src/features/a2ui-template-poc/schema-profiler.ts
  - root array와 object.items 정도만 본다.
  - data profile도 top-level field 중심이다.

packages/a2ui-python-agent/app/schema/derived_schema.py
  - TypeScript preview/schema와 같은 제한을 가진 mirror 구현이다.
  - Main Agent render boundary에서 sample preview와 derived schema trace를 만든다.

src/features/a2ui-template-poc/a2ui-demo-renderer.tsx
  - 최종 render payload는 items 기반의 얕은 canonical row를 기대한다.
  - deep raw path를 renderer에 직접 넘기는 구조가 아니다.
```

따라서 이 기획은 다음 방향이어야 한다.

```text
1. 전처리기는 raw response에서 Observed Source를 만든다.
2. AI comparison_data는 Observed Source 안의 sourcePath만 사용한다.
3. AI slot_mapping은 sourcePath를 canonical targetField로 매핑한다.
4. applyPlan은 sourcePath에서 rowPath를 구해 deep value를 읽고, 얕은 items row를 만든다.
5. renderer는 기존처럼 normalized items payload를 렌더링한다.
```

## 3. 만들 기능

새 TypeScript 모듈을 추가한다.

```text
src/server/a2ui-admin/schema-matcher/unknown-api-response-preprocessor.ts
```

역할:

```text
힌트 없는 API raw response를 받아,
AI가 비교용 데이터 스키마를 만들 수 있도록
실제로 존재하는 dataset 후보와 deep field path 목록을 만든다.
```

이 모듈은 최종 화면 payload를 만들지 않는다.

```text
raw API response
  -> preprocessUnknownApiResponse
  -> Observed Source
  -> AI comparison_data
  -> Comparison Data Schema
  -> AI template_selection
  -> AI slot_mapping
  -> applyPlan
  -> normalized items payload
```

## 4. 전처리기 Input

```ts
type PreprocessorInput = {
  rawData: unknown;
  sourceId?: string;
  sourceKind?: "api_response" | "tool_result" | "sample";
  limits?: {
    maxDepth?: number;
    maxRowsToProfile?: number;
    maxSampleRows?: number;
    maxFieldPaths?: number;
    maxByteLength?: number;
  };
};
```

예:

```json
{
  "rawData": {
    "result": {
      "payload": {
        "body": {
          "rows": [
            {
              "equipment": {
                "profile": {
                  "displayName": "CNC 01",
                  "category": "CNC"
                }
              },
              "runtime": {
                "current": {
                  "status": {
                    "label": "가동중"
                  }
                }
              }
            }
          ],
          "totalCount": 1
        }
      }
    }
  },
  "sourceId": "equipment-status"
}
```

## 5. 전처리기 Output

전처리기 output은 `ObservedSource`다.

```ts
type ObservedSource = {
  sourceId: string;
  sourceKind: "api_response" | "tool_result" | "sample";
  root: {
    type: "object" | "array" | "primitive" | "null";
    topLevelKeys: string[];
    maxDepth: number;
    byteLength: number;
  };
  datasetCandidates: ObservedDatasetCandidate[];
  selectedDataset?: ObservedDatasetCandidate;
  fields: ObservedField[];
  sampleRows: Record<string, unknown>[];
  maskedFields: string[];
  warnings: PreprocessorWarning[];
  truncated: boolean;
};
```

### 5.1 Path 용어

현재 프로젝트와 맞추려면 path를 세 가지로 나눠야 한다.

```ts
type ObservedField = {
  // AI planner가 쓰는 path. observedSource.fieldPaths와 AI sourcePath 검증 기준이다.
  // selected dataset path와 [] marker를 포함한다.
  sourcePath: string;

  // row object 내부에서 값을 읽기 위한 상대 path다.
  rowPath: string;

  // DerivedSchema.fields[].path에 넣을 path다. 현재 matcher는 [] 없는 canonical path를 쓴다.
  derivedSchemaPath: string;

  key: string;
  parentPath: string;
  depth: number;
  type: "string" | "number" | "boolean" | "date" | "datetime" | "object" | "array" | "unknown" | "mixed";
  format?: "image-url" | "uri" | "date" | "datetime";
  roleCandidates: string[];
  examples: unknown[];
  completeness: number;
  uniqueRatio?: number;
  nullCount: number;
  missingCount: number;
};
```

예:

```json
{
  "sourcePath": "result.payload.body.rows[].equipment.profile.displayName",
  "rowPath": "equipment.profile.displayName",
  "derivedSchemaPath": "result.payload.body.rows.equipment.profile.displayName",
  "key": "displayName",
  "parentPath": "equipment.profile",
  "depth": 3,
  "type": "string",
  "roleCandidates": ["title", "label"],
  "examples": ["CNC 01"],
  "completeness": 1,
  "uniqueRatio": 1,
  "nullCount": 0,
  "missingCount": 0
}
```

중요한 기준:

```text
sourcePath는 AI output 검증용이다.
rowPath는 실제 raw row에서 값을 읽기 위한 path다.
derivedSchemaPath는 deterministic matcher trace와 DerivedSchema용이다.
```

root array처럼 실제 raw path가 없는 경우에는 기존 planner/render 흐름과 맞추기 위해 virtual dataset path를 `items`로 둘 수 있다.

```text
raw root array rowPath: name
planner sourcePath: items[].name
selectedDataset.rawPath: $
selectedDataset.plannerPath: items
```

### 5.2 Dataset Candidate

```ts
type ObservedDatasetCandidate = {
  rawPath: string;        // "$" 또는 "result.payload.body.rows"
  plannerPath: string;    // AI primaryArrayPath/sourcePath prefix. root array는 "items" 가능
  kind: "root_array" | "nested_array" | "single_object";
  itemType: "object" | "primitive" | "mixed";
  rowCount: number;
  sampleSize: number;
  objectRowRatio: number;
  fieldRepeatability: number;
  depth: number;
  score: number;
  reasonCodes: string[];
};
```

예:

```json
{
  "rawPath": "result.payload.body.rows",
  "plannerPath": "result.payload.body.rows",
  "kind": "nested_array",
  "itemType": "object",
  "rowCount": 1,
  "sampleSize": 1,
  "objectRowRatio": 1,
  "fieldRepeatability": 1,
  "depth": 4,
  "score": 0.92,
  "reasonCodes": ["array_object", "has_repeated_leaf_fields", "path_hint_rows"]
}
```

### 5.3 sampleRows

AI가 `sourcePath`와 sample value를 바로 대조할 수 있도록 `sampleRows`는 `sourcePath`를 key로 사용하는 flat row가 좋다.

```json
[
  {
    "result.payload.body.rows[].equipment.profile.displayName": "CNC 01",
    "result.payload.body.rows[].equipment.profile.category": "CNC",
    "result.payload.body.rows[].runtime.current.status.label": "가동중"
  }
]
```

민감 필드는 현재 `sample-data-preview.ts`와 Python schema가 쓰는 masking 규칙을 유지해야 한다.

```text
secret, token, password, authorization, cookie, phone, email
```

전처리기 examples와 sampleRows에는 masked value만 들어가야 하고, rawData fingerprint는 기존 data integrity 기준으로 유지한다.

## 6. AI Input

현재 코드의 `buildComparisonDataPrompt`는 `observedSource.fieldPaths`, `observedSource.fields`, `observedSource.sampleRows`를 AI에게 넘긴다.

전처리기 적용 후 AI input은 다음 모양이어야 한다.

```ts
type ComparisonDataAIInput = {
  query: string;
  apiId: string;
  observedSource: {
    shape: string;
    detectedPrimaryArrayPath: string;
    rowCount: number;
    fieldPathCount: number;
    omittedFieldPathCount: number;
    fieldPaths: string[];
    fields: Array<{
      path: string;
      rowPath: string;
      key: string;
      type: string;
      roles: string[];
      examples: unknown[];
      completeness?: number;
    }>;
    sampleRows: Record<string, unknown>[];
    datasetCandidates?: ObservedDatasetCandidate[];
    warnings?: PreprocessorWarning[];
  };
};
```

예:

```json
{
  "query": "장비 상태 보여줘",
  "apiId": "equipment-status",
  "observedSource": {
    "shape": "object{result.payload.body.rows:array<object>}",
    "detectedPrimaryArrayPath": "result.payload.body.rows",
    "rowCount": 1,
    "fieldPathCount": 2,
    "omittedFieldPathCount": 0,
    "fieldPaths": [
      "result.payload.body.rows[].equipment.profile.displayName",
      "result.payload.body.rows[].runtime.current.status.label"
    ],
    "fields": [
      {
        "path": "result.payload.body.rows[].equipment.profile.displayName",
        "rowPath": "equipment.profile.displayName",
        "key": "displayName",
        "type": "string",
        "roles": ["title", "label"],
        "examples": ["CNC 01"],
        "completeness": 1
      },
      {
        "path": "result.payload.body.rows[].runtime.current.status.label",
        "rowPath": "runtime.current.status.label",
        "key": "label",
        "type": "string",
        "roles": ["status"],
        "examples": ["가동중"],
        "completeness": 1
      }
    ],
    "sampleRows": [
      {
        "result.payload.body.rows[].equipment.profile.displayName": "CNC 01",
        "result.payload.body.rows[].runtime.current.status.label": "가동중"
      }
    ]
  }
}
```

## 7. AI Output

현재 프로젝트의 첫 AI 단계 output은 `ComparisonDataResult`다. 이 문서에서는 이것을 비교용 데이터 스키마로 본다.

```ts
type ComparisonDataResult = {
  primaryArrayPath?: string;
  entityName?: string;
  rowMeaning?: string;
  reason?: string;
  fieldProfiles?: Array<{
    sourcePath?: string;
    sourceKey?: string;
    label?: string;
    type?: string;
    role?: "identifier" | "title" | "status" | "metric" | "timestamp" | "location" | "image" | "description" | "category" | "unknown";
    targetHint?: string;
    confidence?: number;
    reason?: string;
    exampleValues?: unknown[];
  }>;
  titleCandidates?: string[];
  statusCandidates?: string[];
  metricCandidates?: string[];
  timestampCandidates?: string[];
  warnings?: string[];
};
```

예:

```json
{
  "primaryArrayPath": "result.payload.body.rows",
  "entityName": "equipment",
  "rowMeaning": "장비 상태 목록",
  "reason": "row가 장비 표시명과 현재 상태 라벨을 포함한다.",
  "fieldProfiles": [
    {
      "sourcePath": "result.payload.body.rows[].equipment.profile.displayName",
      "sourceKey": "displayName",
      "label": "장비명",
      "type": "string",
      "role": "title",
      "targetHint": "name",
      "confidence": 0.95,
      "reason": "장비 표시명으로 보인다.",
      "exampleValues": ["CNC 01"]
    },
    {
      "sourcePath": "result.payload.body.rows[].runtime.current.status.label",
      "sourceKey": "label",
      "label": "상태",
      "type": "string",
      "role": "status",
      "targetHint": "operationStatus",
      "confidence": 0.9,
      "reason": "현재 상태 표시값으로 보인다.",
      "exampleValues": ["가동중"]
    }
  ],
  "titleCandidates": ["result.payload.body.rows[].equipment.profile.displayName"],
  "statusCandidates": ["result.payload.body.rows[].runtime.current.status.label"],
  "metricCandidates": [],
  "timestampCandidates": [],
  "warnings": []
}
```

이후 AI 단계는 기존처럼 이어진다.

```text
template_selection output:
  selectedTemplateId
  reason
  confidence
  candidateNotes

slot_mapping output:
  fieldMappings
  slotMappings
  reason
```

전처리기 기획의 직접 대상은 comparison_data input 품질을 올리는 것이지만, deep path를 넣으면 slot_mapping/applyPlan 검증도 함께 바뀌어야 한다.

## 8. 검증 규칙

AI output은 반드시 Observed Source로 검증한다.

```text
1. comparisonData.fieldProfiles[].sourcePath는 observedSource.fieldPaths 안에 있어야 한다.
2. title/status/metric/timestamp candidates도 observedSource.fieldPaths 안에 있어야 한다.
3. comparisonData.primaryArrayPath는 selectedDataset.plannerPath 또는 datasetCandidates[].plannerPath 중 하나여야 한다.
4. slot_mapping의 fieldMappings[].sourcePath와 slotMappings[].sourcePath도 observedSource.fieldPaths 안에 있어야 한다.
5. AI가 wildcard, unknown path, 존재하지 않는 field를 만들면 reject한다.
6. source type과 AI type이 충돌하면 warning 또는 reject한다.
```

현재 `validateComparisonData`, `validatePlan`, `normalizeComparisonData`, `normalizeAIPlan`은 `fieldPaths(extracted.rows, arrayPath)`와 `sourceKey(path)`에 의존한다. 전처리기 적용 후에는 다음으로 바꿔야 한다.

```text
valid source paths = observedSource.fields.map(field => field.sourcePath)
sourcePath -> rowPath lookup = observedSource field index
source value = getValueAtRowPath(row, rowPath)
```

## 9. 전처리기 알고리즘

### 9.1 Raw Traversal

rawData 전체를 bounded traversal한다.

수집:

```text
root type
top-level keys
object paths
array paths
array item type distribution
max depth
byte length
```

### 9.2 Dataset Candidate Detection

dataset 후보:

```text
root array
array<object>
array<primitive>
single object
deep nested array<object>
```

score 신호:

```text
rowCount
objectRowRatio
fieldRepeatability
averageLeafFieldCount
path hint(items, rows, list, data, result, payload)
metadata/debug/error path penalty
```

깊은 path는 약한 penalty만 준다. 깊다는 이유로 dataset 후보에서 제외하면 안 된다.

### 9.3 Deep Field Extraction

선택된 dataset의 row sample을 deep traversal한다.

```text
equipment.profile.displayName
equipment.profile.category
runtime.current.status.label
```

leaf scalar를 우선 field로 만든다. object 자체는 되도록 field로 확정하지 않는다.

### 9.4 Nested Array Handling

row 내부 배열은 1차에서는 summary field로 만든다.

```text
alarms.length
alarms.first.code
alarms.first.severity
```

독립 목록처럼 보이는 nested array는 child dataset candidate로 trace에 남기되, 이번 전처리기 1차 범위에서는 primary dataset으로 바로 렌더링하지 않는다.

### 9.5 Type and Role Candidate Profiling

field마다 계산:

```text
type
format
examples
completeness
uniqueRatio
nullCount
missingCount
roleCandidates
```

roleCandidates는 확정 의미가 아니라 AI를 돕는 weak hint다.

## 10. 코드 연결 계획

### 10.1 New TypeScript Preprocessor

추가:

```text
src/server/a2ui-admin/schema-matcher/unknown-api-response-preprocessor.ts
```

구현 export:

```ts
export function preprocessUnknownApiResponse(input: PreprocessorInput): ObservedSource;
export function rowsFromObservedSource(rawData: unknown, observedSource: ObservedSource): Record<string, unknown>[];
export function getValueAtRowPath(row: Record<string, unknown>, rowPath: string): unknown;
export function rowPathForSourcePath(observedSource: ObservedSource, sourcePath: string): string | undefined;
export function fieldForSourcePath(observedSource: ObservedSource, sourcePath: string): ObservedField | undefined;
export function shapeFromObservedSource(observedSource: ObservedSource): string;
export function observedSourceFieldPaths(observedSource: ObservedSource): string[];
```

### 10.2 AI Planner Integration

대상:

```text
src/server/a2ui-admin/a2ui-ai-surface-planner.ts
```

수정 대상:

```text
extractRows
fieldPaths
sourceFieldSummaries
projectRowsForPrompt
promptFieldPaths
normalizeComparisonData
validateComparisonData
metricSourcePathsForPlanning
normalizeAIPlan
validatePlan
displayRowsForPlan
applyPlan
buildTrace
```

변경 방향:

```text
1. planA2UISurfaceWithAI 초입에서 preprocessUnknownApiResponse(rawData)를 실행한다.
2. comparisonData prompt는 observedSource 기반으로 만든다.
3. valid source path set은 observedSource.fields[].sourcePath로 만든다.
4. source value 접근은 sourceKey(path)가 아니라 rowPath lookup + getValueAtRowPath로 한다.
5. trace에 observedSource 또는 축약본을 넣는다.
```

### 10.3 Preview / DerivedSchema Integration

대상:

```text
src/server/a2ui-admin/schema-matcher/sample-data-preview.ts
src/server/a2ui-admin/schema-matcher/derived-schema-builder.ts
src/features/a2ui-template-poc/schema-profiler.ts
```

수정 방향:

```text
sample-data-preview:
  rowsFromData의 고정 path 탐색을 selectedDataset 기반으로 교체한다.
  masking, rowLimit, byteLimit은 기존 동작을 유지한다.

derived-schema-builder:
  Object.keys(row) 대신 observedSource.fields를 DerivedSchema.fields로 변환한다.
  field.path는 derivedSchemaPath를 사용한다.

schema-profiler:
  profile.fields도 deep observed field를 반영한다.
```

주의:

```text
deterministic matcher가 deep raw data를 바로 renderer에 넘기면 현재 renderer가 값을 못 읽을 수 있다.
AI path는 applyPlan이 normalized items payload를 만들기 때문에 먼저 안정화하기 좋다.
deterministic path까지 deep raw rendering을 지원하려면 별도의 displayData normalization이 필요하다.
```

### 10.4 Python Agent Mirror

대상:

```text
packages/a2ui-python-agent/app/schema/derived_schema.py
packages/a2ui-python-agent/app/data_integrity.py
packages/a2ui-python-agent/app/render_boundary.py
packages/a2ui-python-agent/tests/test_derived_schema.py
```

수정 방향:

```text
1. TS 전처리기와 같은 dataset candidate / deep field extraction 규칙을 Python schema에도 반영한다.
2. build_sample_data_preview가 깊은 array<object>를 찾을 수 있어야 한다.
3. build_derived_schema가 deep leaf field를 만들 수 있어야 한다.
4. data_integrity의 rowCount/shape도 깊은 selected dataset을 설명할 수 있어야 한다.
```

Python agent는 A2A로 Next runtime에 raw data를 보내기 전 trace metadata를 만든다. 따라서 TS만 고치면 UI 렌더링은 좋아져도 Main Agent trace와 preview가 어긋날 수 있다.

### 10.5 Lab / Trace UI

대상:

```text
src/features/a2ui-template-poc/data-boundary-lab.ts
src/features/a2ui-template-poc/data-boundary-lab-panel.tsx
src/features/a2ui-template-poc/agent-flow-adapter.ts
src/features/a2ui-template-poc/template-types.ts
```

수정 방향:

```text
1. A2UISurfacePlanTrace에 observedSource 축약 정보를 추가한다.
2. Data Boundary Lab은 observed sampleRows가 있으면 sourcePath 기반 flat row를 우선 보여준다.
3. Flow Board detail에서 selected dataset path, observed field count, warnings, truncated 여부를 보여준다.
```

## 11. 예시 전체 IO

### 11.1 raw API response

```json
{
  "result": {
    "payload": {
      "body": {
        "rows": [
          {
            "equipment": {
              "profile": {
                "displayName": "CNC 01"
              }
            },
            "runtime": {
              "current": {
                "status": {
                  "label": "가동중"
                }
              }
            }
          }
        ]
      }
    }
  }
}
```

### 11.2 preprocessor output

```json
{
  "selectedDataset": {
    "rawPath": "result.payload.body.rows",
    "plannerPath": "result.payload.body.rows",
    "kind": "nested_array",
    "itemType": "object",
    "rowCount": 1,
    "score": 0.92
  },
  "fields": [
    {
      "sourcePath": "result.payload.body.rows[].equipment.profile.displayName",
      "rowPath": "equipment.profile.displayName",
      "derivedSchemaPath": "result.payload.body.rows.equipment.profile.displayName",
      "key": "displayName",
      "type": "string",
      "roleCandidates": ["title", "label"],
      "examples": ["CNC 01"],
      "completeness": 1
    },
    {
      "sourcePath": "result.payload.body.rows[].runtime.current.status.label",
      "rowPath": "runtime.current.status.label",
      "derivedSchemaPath": "result.payload.body.rows.runtime.current.status.label",
      "key": "label",
      "type": "string",
      "roleCandidates": ["status"],
      "examples": ["가동중"],
      "completeness": 1
    }
  ],
  "sampleRows": [
    {
      "result.payload.body.rows[].equipment.profile.displayName": "CNC 01",
      "result.payload.body.rows[].runtime.current.status.label": "가동중"
    }
  ],
  "warnings": []
}
```

### 11.3 AI comparison_data output

```json
{
  "primaryArrayPath": "result.payload.body.rows",
  "entityName": "equipment",
  "rowMeaning": "장비 상태 목록",
  "reason": "row가 장비 표시명과 현재 상태 라벨을 포함한다.",
  "fieldProfiles": [
    {
      "sourcePath": "result.payload.body.rows[].equipment.profile.displayName",
      "sourceKey": "displayName",
      "label": "장비명",
      "type": "string",
      "role": "title",
      "targetHint": "name",
      "confidence": 0.95,
      "reason": "장비 표시명으로 보인다."
    },
    {
      "sourcePath": "result.payload.body.rows[].runtime.current.status.label",
      "sourceKey": "label",
      "label": "상태",
      "type": "string",
      "role": "status",
      "targetHint": "operationStatus",
      "confidence": 0.9,
      "reason": "현재 상태 표시값으로 보인다."
    }
  ],
  "titleCandidates": ["result.payload.body.rows[].equipment.profile.displayName"],
  "statusCandidates": ["result.payload.body.rows[].runtime.current.status.label"],
  "metricCandidates": [],
  "timestampCandidates": [],
  "warnings": []
}
```

### 11.4 AI slot_mapping output

```json
{
  "fieldMappings": [
    {
      "targetField": "name",
      "sourcePath": "result.payload.body.rows[].equipment.profile.displayName",
      "transform": "copy",
      "reason": "장비명을 canonical name으로 사용한다."
    },
    {
      "targetField": "statusLabel",
      "sourcePath": "result.payload.body.rows[].runtime.current.status.label",
      "transform": "copy",
      "reason": "상태 라벨을 표시용 상태값으로 사용한다."
    }
  ],
  "slotMappings": [
    {
      "slot": "items[].title",
      "sourcePath": "result.payload.body.rows[].equipment.profile.displayName",
      "targetField": "name",
      "transform": "copy"
    }
  ],
  "reason": "선택된 템플릿의 title slot을 채울 수 있다."
}
```

### 11.5 applyPlan output

현재 renderer가 받는 최종 payload는 deep raw shape가 아니라 normalized items shape다.

```json
{
  "items": [
    {
      "name": "CNC 01",
      "statusLabel": "가동중"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 1
}
```

## 12. 개발 단계

### Milestone 1 - Types and Fixtures

```text
PreprocessorInput / ObservedSource / ObservedDatasetCandidate / ObservedField type 추가
root array, wrapper, deep wrapper, deep row, nested array, mixed/null fixture 추가
```

완료 기준:

```text
각 fixture에서 selectedDataset, fields, sampleRows snapshot을 확인할 수 있다.
```

### Milestone 2 - Dataset Scanner

```text
rawData recursive traversal
array<object> 후보 수집
single object fallback 후보 생성
candidate score 계산
selectedDataset 선정
```

완료 기준:

```text
[], {items: []}, {data: []}, {result: {payload: {body: {rows: []}}}} 모두 후보로 잡힌다.
```

### Milestone 3 - Deep Field Profiler

```text
selected dataset row sample deep traversal
leaf scalar path 추출
sourcePath / rowPath / derivedSchemaPath 생성
examples / completeness / uniqueRatio 계산
masking 적용
```

완료 기준:

```text
equipment.profile.displayName 같은 deep field가 fields에 들어간다.
```

### Milestone 4 - AI Planner Integration

```text
planA2UISurfaceWithAI에서 observedSource 생성
comparison prompt를 observedSource 기반으로 변경
normalize/validate/applyPlan 계층을 sourcePath -> rowPath 기반으로 변경
```

완료 기준:

```text
AI comparison_data와 slot_mapping이 deep sourcePath를 사용하고, applyPlan이 raw row에서 deep value를 읽는다.
```

### Milestone 5 - Derived Schema / Preview Integration

```text
sample-data-preview와 derived-schema-builder를 observedSource 기반으로 연결
schema-profiler도 deep field profile을 반영
```

완료 기준:

```text
DerivedSchema.fields에 deep leaf field가 들어간다.
```

### Milestone 6 - Python Mirror and Tests

```text
packages/a2ui-python-agent/app/schema/derived_schema.py mirror 업데이트
data_integrity rowCount/shape 업데이트
Python fixture 테스트 추가
Next runtime은 tsc/build와 A2A e2e로 검증
```

완료 기준:

```text
Next runtime trace와 Python Main Agent trace의 rowCount, primaryArrayPath, field paths가 같은 기준을 사용한다.
data-boundary / sequence e2e에서 observed source 기반 planner 흐름이 통과한다.
```

### Milestone 7 - Lab Trace UI

```text
Flow Board / Data Boundary Lab에 selectedDataset, observed field count, warnings 노출
```

완료 기준:

```text
사용자가 raw response에서 어떤 dataset과 field가 관찰됐는지 확인할 수 있다.
```

## 13. 성공 기준

```text
1. API 응답이 []로 바로 와도 observed source를 만든다.
2. { data: [] }, { list: [] }, { items: [] } 모두 처리한다.
3. 깊은 path의 array<object>를 찾는다.
4. row 내부 deep leaf field를 sourcePath/rowPath로 분리해서 추출한다.
5. AI input에는 실제 존재하는 sourcePath만 들어간다.
6. AI comparison_data output은 observed sourcePath로 검증된다.
7. AI slot_mapping output도 observed sourcePath로 검증된다.
8. applyPlan은 sourcePath의 마지막 key가 아니라 rowPath로 값을 읽는다.
9. 최종 renderer에는 기존처럼 normalized items payload가 들어간다.
10. Python agent preview/schema trace도 같은 기준을 따른다.
```

## 14. 핵심 정리

```text
전처리기는 "API raw response에 실제로 무엇이 있는지"를 관찰한다.
AI comparison_data는 "그 field들이 비교 관점에서 무슨 의미인지"를 만든다.
AI slot_mapping은 "그 의미를 어떤 render target에 꽂을지"를 만든다.
applyPlan은 "deep raw value를 canonical items payload로 변환"한다.
renderer는 "canonical items payload만 렌더링"한다.
```

# Derived Schema 기반 A2UI Template Matcher 현재 프로젝트 적용 계획

Date: 2026-06-11

Source reference:

- `/Users/tahooki/Documents/git/a2ui-poc-rt-new-3/docs/20260609_derived-schema-a2ui-template-matcher-plan.md`
- `docs/20260609_real-agent-mcp-python-integration-plan.md`

Review note:

- 2026-06-11 검수에서 현재 repo의 실제 Python/MCP payload, 테스트 스크립트 부재, `uri` type 표현, bounded preview rowCount 보존 조건을 기준으로 내용을 보정했다.
- 2026-06-11 구현에서 `src/server/a2ui-admin/schema-matcher/*`, Python `app/schema/derived_schema.py`, Admin inputSchema editor, MCP runtime, Python SSE trace, Chat UI matcher trace를 반영했다.

## 1. 목적

원본 계획은 `a2ui-poc-rt-new-3`의 Admin/MCP runtime에 `DerivedSchema` 기반 template matcher를 붙이는 계획이었다. 이 문서는 같은 방향을 현재 독립 POC인 `a2ui-template-admin-chatbot-poc`에 맞춰 다시 정리한다.

현재 프로젝트는 이미 다음 구조를 갖고 있다.

```text
Next 화면
-> /api/chat
-> Python Agent /chat/stream
-> 장비 API 호출
-> Admin MCP JSON-RPC proxy
-> a2ui.recommendTemplate
-> a2ui.resolveTemplateData
-> SurfaceEnvelope 렌더
```

따라서 새 목표는 "mock 챗봇을 실제 Agent로 바꾸기"가 아니다. 그 단계는 이미 대부분 완료되어 있다. 이번 목표는 현재 `schemaSpec + A2UIDataProfile` 기반 선택을 `DerivedSchema + template inputSchema + matcher trace` 기반 선택으로 올리는 것이다.

핵심 성공 장면은 다음과 같다.

```text
사용자 질문
-> Python Agent가 장비 API 호출
-> raw data 전체가 아니라 bounded sampleDataPreview와 derivedSchema 생성
-> MCP/Admin이 canonical DerivedSchema로 normalize
-> Admin catalog의 inputSchema와 비교
-> 후보별 score/rejection reason 생성
-> mapping 검증 후 SurfaceEnvelope 반환
```

## 2. 현재 프로젝트 기준선

### 2.1 이미 구현된 것

| 영역 | 현재 파일 | 상태 |
| --- | --- | --- |
| 서버 catalog | `data/a2ui-template-catalog.json`, `src/server/a2ui-admin/catalog-store.ts` | server file catalog 사용 |
| Admin REST | `src/app/api/admin/templates/*` | catalog read/save/reset 가능 |
| MCP endpoint | `src/app/api/mcp/route.ts`, `packages/a2ui-admin-mcp-server/server.mjs` | JSON-RPC-compatible tool call 가능 |
| Python Agent | `packages/a2ui-python-agent/app/*` | 장비 API 호출, MCP call, SSE stream 가능 |
| Chat proxy | `src/app/api/chat/route.ts` | Python `/chat/stream` proxy |
| 기존 profiler | `src/features/a2ui-template-poc/schema-profiler.ts` | `A2UIDataProfile` 생성 |
| 기존 selector | `src/features/a2ui-template-poc/component-selector.ts` | `schemaSpec`와 query keyword로 template 선택 |
| Renderer | `src/features/a2ui-template-poc/a2ui-demo-renderer.tsx` | `statusBooleanList`, `imageCardList`, fallback 렌더 가능 |

### 2.2 현재 한계

현재 `a2ui.recommendTemplate`는 사실상 다음 흐름이다.

```text
args.data 또는 args.facts.data
-> buildA2UIDataProfile(data)
-> selectA2UIComponent(query, profile, templates)
-> render_surface or text_fallback
```

문제:

- MCP input은 `derivedSchema`, `sampleDataPreview`, `options.includeTrace`를 받지 않는다.
- Python Agent가 `facts.data`로 장비 API 응답 전체를 MCP에 보낸다.
- 현재 `A2UIDataProfile.rowCount`는 raw data 기준이라 장비 API에서는 맞지만, bounded preview 도입 후 원본 row count를 보존하는 계약이 없다.
- template catalog에는 `inputSchema`가 없고, 기존 `schemaSpec`만 있다.
- 후보별 reject reason, score breakdown, mapping trace가 없다.
- `resolveTemplateData`는 선택된 template을 다시 single-template selector에 넣지만, mapping context를 검증하지 않는다.
- Admin UI는 `schemaSpec`/`surfaceConfig` JSON만 편집하고 `inputSchema` JSON을 편집하지 않는다.

## 3. 적용 원칙

이번 변경은 기존 POC를 깨지 않는 확장으로 진행한다.

- `schemaSpec`는 바로 제거하지 않는다.
- `inputSchema`는 `A2UITemplateRegistration`의 optional field로 추가한다.
- 기존 template은 저장/조회 시 legacy `schemaSpec`에서 `inputSchema`를 자동 생성한다.
- matcher의 source of truth는 `src/server/a2ui-admin` 아래 서버 runtime이다.
- Python Agent는 matcher를 직접 구현하지 않는다.
- Python Agent는 raw result 전체 대신 bounded `sampleDataPreview`와 optional `derivedSchema`를 MCP에 보낸다.
- OpenAI key 없이 deterministic matcher만으로 동작해야 한다.
- LLM/embedding rerank는 나중 단계로 남긴다.
- `resolveTemplateData`와 renderer validation을 우회하지 않는다.

## 4. 목표 Runtime 흐름

```text
Next Chat UI
  -> POST /api/chat
  -> Python Agent /chat/stream
  -> fetch_equipment_data(api_id)
  -> build_sample_data_preview(data)
  -> build_derived_schema(data, preview)
  -> MCP tools/call a2ui.recommendTemplate({
       query,
       apiId,
       facts,
       derivedSchema,
       sampleDataPreview,
       options: { includeTrace: true, allowLegacyIntentFallback: true }
     })
  -> src/server/a2ui-admin/a2ui-runtime.ts
  -> schema matcher
  -> mapping validator
  -> a2ui.resolveTemplateData(mapping context)
  -> SurfaceEnvelope
  -> SSE text/surface/done
```

Fallback 순서:

```text
1. derivedSchema가 있으면 schema matcher 먼저 실행
2. score >= threshold이고 required slot mapping이 모두 valid하면 render_surface
3. schema matcher가 실패하고 allowLegacyIntentFallback=true면 기존 schemaSpec selector 실행
4. 둘 다 실패하면 text_fallback
```

## 5. 타입 모델 변경

### 5.1 `DerivedSchema`

현재 `A2UIDataProfile`는 유지하되 서버 matcher용 canonical model을 추가한다.

```ts
type DerivedSchema = {
  sourceId: string;
  sourceKind: "tool_result" | "api_response" | "sample" | "facts" | "combined";
  shape: "object" | "array<object>" | "array<primitive>" | "unknown";
  primaryArrayPath?: string;
  rowCount?: number;
  sampleSize?: number;
  fields: DerivedSchemaField[];
  capabilities: {
    hasImages: boolean;
    hasBooleans: boolean;
    hasStatus: boolean;
    hasTimeField: boolean;
    hasNumericMetrics: boolean;
    hasCategories: boolean;
    hasNestedObjects: boolean;
    hasActions: boolean;
  };
};

type DerivedSchemaField = {
  path: string;
  key: string;
  type: "string" | "number" | "boolean" | "date" | "datetime" | "object" | "array" | "unknown";
  role?:
    | "id"
    | "label"
    | "title"
    | "content"
    | "description"
    | "image"
    | "uri"
    | "status"
    | "booleanFlag"
    | "time"
    | "metric"
    | "category"
    | "location"
    | "updatedAt"
    | "version"
    | "environment"
    | "artifact"
    | "action";
  format?: "uri" | "image-url" | "date" | "datetime" | string;
  examples?: unknown[];
  cardinality?: number;
  uniqueRatio?: number;
  enumValues?: string[];
};
```

중요 규칙:

- bounded preview가 10 rows로 잘려도 `rowCount`는 원본 `total` 또는 실제 원본 row count를 보존한다.
- `primaryArrayPath`는 현재 장비 API 기준으로 `items`를 사용한다.
- path 표기는 matcher 내부 canonical form으로 `items.name`, renderer binding form으로 `items[].name`를 모두 다룰 수 있어야 한다.
- 기존 `FieldProfile.type === "image-url"`은 canonical `DerivedSchemaField`에서는 `type: "string"`, `role: "image"`, `format: "image-url"`로 변환한다.
- `hasNestedObjects`는 단순 list container 때문에 켜지지 않고 실제 field가 object/array일 때만 켠다.

### 5.2 `A2UITemplateInputSchema`

기존 `A2UIComponentSchemaSpec` 옆에 신규 optional contract를 둔다.

```ts
type A2UITemplateInputSchema = {
  schemaVersion: "2026-06-11";
  accepts: {
    shape: Array<DerivedSchema["shape"]>;
    minRows?: number;
    maxRows?: number;
    capabilities?: Partial<DerivedSchema["capabilities"]>;
  };
  requiredSlots: A2UITemplateSlot[];
  optionalSlots?: A2UITemplateSlot[];
  selectionHints?: {
    intentKeys?: string[];
    queryKeywords?: string[];
    bestFor?: string[];
    badFor?: string[];
    priority?: number;
  };
};

type A2UITemplateSlot = {
  slot: string;
  acceptsTypes: DerivedSchemaField["type"][];
  acceptsRoles: NonNullable<DerivedSchemaField["role"]>[];
  acceptsFormats?: NonNullable<DerivedSchemaField["format"]>[];
  minCount?: number;
  required: boolean;
  description?: string;
};
```

`equipment.statusBooleanList` legacy adapter 예:

```json
{
  "schemaVersion": "2026-06-11",
  "accepts": {
    "shape": ["array<object>"],
    "minRows": 1,
    "capabilities": {
      "hasBooleans": true
    }
  },
  "requiredSlots": [
    {
      "slot": "items[].title",
      "acceptsTypes": ["string"],
      "acceptsRoles": ["title"],
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
  "selectionHints": {
    "queryKeywords": ["상태", "가동", "점검", "알람", "예약"]
  }
}
```

`equipment.imageCardList` 예:

```json
{
  "schemaVersion": "2026-06-11",
  "accepts": {
    "shape": ["array<object>"],
    "minRows": 1,
    "capabilities": {
      "hasImages": true
    }
  },
  "requiredSlots": [
    {
      "slot": "cards[].title",
      "acceptsTypes": ["string"],
      "acceptsRoles": ["title", "label"],
      "required": true
    },
    {
      "slot": "cards[].imageUrl",
      "acceptsTypes": ["string"],
      "acceptsRoles": ["image", "uri"],
      "acceptsFormats": ["uri", "image-url"],
      "required": true
    }
  ],
  "optionalSlots": [
    {
      "slot": "cards[].description",
      "acceptsTypes": ["string"],
      "acceptsRoles": ["description", "content"],
      "required": false
    }
  ],
  "selectionHints": {
    "queryKeywords": ["장비 목록", "이미지", "사진", "카탈로그", "설비"]
  }
}
```

## 6. 구현 대상 파일

### 6.1 신규 TypeScript 파일

```text
src/server/a2ui-admin/schema-matcher/derived-schema-types.ts
src/server/a2ui-admin/schema-matcher/derived-schema-builder.ts
src/server/a2ui-admin/schema-matcher/sample-data-preview.ts
src/server/a2ui-admin/schema-matcher/template-input-schema-types.ts
src/server/a2ui-admin/schema-matcher/template-input-schema-adapter.ts
src/server/a2ui-admin/schema-matcher/template-schema-matcher.ts
src/server/a2ui-admin/schema-matcher/template-mapping-builder.ts
src/server/a2ui-admin/schema-matcher/template-mapping-validator.ts
```

### 6.2 수정할 TypeScript 파일

```text
src/features/a2ui-template-poc/template-types.ts
src/features/a2ui-template-poc/schema-profiler.ts
src/features/a2ui-template-poc/component-selector.ts
src/features/a2ui-template-poc/initial-templates.ts
src/features/a2ui-template-poc/image-card-registration-preset.ts
src/features/a2ui-template-poc/admin-panel.tsx
src/server/a2ui-admin/template-validation.ts
src/server/a2ui-admin/catalog-store.ts
src/server/a2ui-admin/a2ui-runtime.ts
src/app/api/mcp/route.ts
src/app/api/chat/route.ts
package.json
```

### 6.3 신규 Python 파일

```text
packages/a2ui-python-agent/app/schema/__init__.py
packages/a2ui-python-agent/app/schema/derived_schema.py
```

### 6.4 수정할 Python 파일

```text
packages/a2ui-python-agent/app/equipment_tools.py
packages/a2ui-python-agent/app/a2ui_agent.py
packages/a2ui-python-agent/app/orchestrate.py
```

## 7. Matching Algorithm

### 7.1 Hard Filter

후보 제외 조건:

- template status가 `registered`가 아님
- `derivedSchema.shape`가 `inputSchema.accepts.shape`에 없음
- required capability 불충족
- `minRows`, `maxRows` 불충족
- required slot을 채울 field 후보가 없음
- mapping sourcePath가 derived field에 없음
- mapping payload가 renderer contract와 맞지 않음

### 7.2 Deterministic Score

초기 score:

```text
score =
  shapeScore * 0.15
+ capabilityScore * 0.15
+ requiredSlotCoverage * 0.30
+ optionalSlotCoverage * 0.10
+ typeCompatibility * 0.10
+ roleCompatibility * 0.10
+ rowCountSuitability * 0.05
+ intentAndQueryHint * 0.05
```

초기 threshold:

```text
render_surface: score >= 0.72 and requiredSlotCoverage == 1.0
text_fallback:  score < 0.72 or requiredSlotCoverage < 1.0
```

이 프로젝트의 장비 POC에는 사용자에게 추가 질문할 missing fact가 거의 없다. 그래서 `ask_followup`은 바로 도입하지 않고 `text_fallback`으로 둔다. 나중에 API parameter가 생기면 `ask_followup`을 추가한다.

### 7.3 Trace

`a2ui.recommendTemplate` 응답에 아래 정보를 포함한다.

```ts
type RecommendTemplateResult = {
  mode: "render_surface" | "text_fallback";
  templateId?: string | null;
  score?: number;
  reason: string;
  strategy: "derived_schema" | "legacy_schema_spec" | "fallback";
  mapping?: TemplateMappingDecision;
  candidates?: Array<{
    templateId: string;
    score: number;
    reason: string;
    rejected?: boolean;
    rejectionReason?: string;
  }>;
  profile?: A2UIDataProfile;
  derivedSchema?: DerivedSchema;
};
```

Python SSE와 Next `/api/chat`는 `matcher_candidates` 또는 `candidates`를 잃어버리지 않아야 한다. UI debug panel에 바로 표시하지 않더라도 stream state에는 남긴다.

## 8. 단계별 TODO

Implementation status: 2026-06-11에 deterministic matcher 경로 구현과 검증을 완료했다. 별도 TS test runner는 추가하지 않고 `next build` type check, MCP HTTP fixture, Python `unittest`, Python orchestration 직접 호출, Next `/api/chat` proxy SSE 호출로 검증했다. Python Agent uvicorn 서버 실행은 PyPI `httpcore` 다운로드 timeout으로 venv 설치가 막혀 직접 실행하지 못했고, 대신 동일 `stream_chat_turn` 함수를 표준 라이브러리 임시 `/chat/stream` 서버에 연결해 Next proxy를 확인했다.

### Phase 0. 안전 기준선

- [x] `git status --short`로 기존 dirty worktree를 확인하고, 이번 작업 범위를 문서/관련 matcher 파일로 제한한다.
- [x] Next route handler를 수정하기 전 `node_modules/next/dist/docs/`에서 현재 Next 16 route handler 관련 문서를 확인한다.
- [x] 현재 `npm run lint` baseline을 확인한다.
- [x] 현재 `package.json`에는 `test` script가 없으므로, unit test를 넣을지 여부를 먼저 결정한다. 최소 변경이면 pure matcher fixture를 lint/build로 검증하고, 반복 테스트가 필요하면 Vitest 같은 test runner를 명시적으로 추가한다.

### Phase 1. DerivedSchema builder

- [x] `derived-schema-types.ts`를 추가한다.
- [x] `sample-data-preview.ts`를 추가한다.
- [x] `derived-schema-builder.ts`를 추가한다.
- [x] 현재 `buildA2UIDataProfile` 결과에서 `DerivedSchema`로 변환하는 adapter를 만든다.
- [x] raw data에서 직접 `DerivedSchema`를 만들 수 있게 한다.
- [x] `items` pagination object를 `shape: "array<object>"`, `primaryArrayPath: "items"`로 normalize한다.
- [x] `total`이 있으면 bounded preview row 수가 아니라 `total`을 `rowCount`로 사용한다.
- [x] `sampleDataPreview.rowCount`를 canonical `DerivedSchema.rowCount`로 복사하는 경로를 테스트로 고정한다.
- [x] image/status/boolean/category/location/date role inference를 기존 profiler와 호환되게 맞춘다.
- [x] secret, token, password, authorization, cookie, phone, email field를 preview에서 masking한다.

### Phase 2. Template inputSchema

- [x] `A2UITemplateRegistration`에 `inputSchema?: A2UITemplateInputSchema`를 추가한다.
- [x] `template-input-schema-types.ts`를 추가한다.
- [x] `template-input-schema-adapter.ts`에서 기존 `schemaSpec`를 inputSchema로 변환한다.
- [x] `validateTemplateRegistration`에서 inputSchema shape, slots, minRows/maxRows를 검증한다.
- [x] `minRows`, `maxRows`는 음수, 비숫자, `minRows > maxRows`를 저장 전에 reject한다.
- [x] `catalog-store.ts` normalize 과정에서 inputSchema가 없으면 legacy adapter 결과를 붙인다.
- [x] `templateSummary()`와 `a2ui.getTemplateContract`가 inputSchema를 반환한다.
- [x] Admin detail에 `Input schema` JSON editor를 추가한다.
- [x] image card preset에 inputSchema를 추가한다.

### Phase 3. Deterministic matcher

- [x] `template-schema-matcher.ts`를 추가한다.
- [x] hard filter를 구현한다.
- [x] required slot coverage를 계산한다.
- [x] optional slot coverage를 계산한다.
- [x] type compatibility를 계산한다.
- [x] role compatibility를 계산한다.
- [x] query keyword와 selectionGuide score를 계산한다.
- [x] rowCount suitability를 계산한다.
- [x] 후보별 score breakdown과 rejection reason을 만든다.
- [x] `equipment.statusBooleanList`가 status data에서 highest score가 되는지 고정한다.
- [x] `equipment.imageCardList`가 catalog data에서 image field 때문에 highest score가 되는지 고정한다.
- [x] image field가 없는 data에서는 image template이 reject되는지 고정한다.

### Phase 4. Mapping and validation

- [x] `template-mapping-builder.ts`를 추가한다.
- [x] required slot별 sourcePath를 deterministic하게 고른다.
- [x] role 후보가 여러 개면 key/hint/query 유사도로 고른다.
- [x] `items.name`과 `items[].name` path format을 상호 변환한다.
- [x] `template-mapping-validator.ts`를 추가한다.
- [x] mapping sourcePath가 `DerivedSchema.fields`에 있는지 검증한다.
- [x] required slot이 모두 채워졌는지 검증한다.
- [x] mapping을 renderer binding에 적용하되 `surfaceConfig` contract를 우회하지 않는다.
- [x] validation 실패 시 다음 후보를 시도한다.

### Phase 5. MCP runtime 통합

- [x] `a2ui.recommendTemplate` argument reader가 `derivedSchema`, `sampleDataPreview`, `options`를 읽는다.
- [x] `recommendTemplate()`가 schema matcher를 먼저 실행한다.
- [x] schema matcher 성공 시 `strategy: "derived_schema"`를 반환한다.
- [x] schema matcher 실패 시 기존 `selectA2UIComponent`를 `legacy_schema_spec` fallback으로 실행한다.
- [x] `allowLegacyIntentFallback: false`일 때는 legacy fallback을 타지 않는다.
- [x] 응답에 `score`, `mapping`, `candidates`, `strategy`를 포함한다.
- [x] `resolveTemplateData()`가 optional mapping context를 받을 수 있게 한다.
- [x] `SurfaceEnvelope.meta.trace`에 matcher strategy와 score를 남긴다.
- [x] MCP `tools/list` inputSchema를 `additionalProperties: true`에서 실제 주요 field가 보이는 schema로 조금 더 구체화한다.
- [x] schema matcher 실패 후 legacy fallback을 탄 경우에도 rejected candidates를 응답에서 유지한다.

### Phase 6. Python Agent 통합

- [x] `packages/a2ui-python-agent/app/schema/derived_schema.py`를 추가한다.
- [x] Python에서 bounded `sampleDataPreview`를 만든다.
- [x] Python에서 optional `derivedSchema`를 만든다.
- [x] `render_or_fallback()` signature를 `derived_schema`, `sample_data_preview`를 받을 수 있게 확장한다.
- [x] MCP `a2ui.recommendTemplate` call payload에 `derivedSchema`, `sampleDataPreview`, `options.includeTrace`를 넣는다.
- [x] `facts.data`와 `context.data`로 raw data 전체를 보내는 경로를 제거하거나 debug-only로 제한한다. `resolveTemplateData`에 원본 data가 필요한 동안에는 raw data 전달 위치를 `resolveTemplateData` 전용으로 좁힌다.
- [x] stream `state` event에 matcher strategy, score, candidates count를 포함한다.
- [x] Python `/chat/stream`과 Next `/api/chat` proxy 양쪽에서 `matcher_candidates` 또는 `candidates`가 누락되지 않는지 확인한다.
- [x] Python Agent가 OpenAI key 없이도 deterministic matcher 결과를 그대로 사용한다.

### Phase 7. UI and demo

- [x] Chatbot debug state에 matcher strategy와 score를 표시한다.
- [x] candidates trace는 SSE/message state에 보관하고 UI에는 strategy, score, candidate count를 표시한다.
- [x] Admin detail에서 inputSchema 저장 실패 메시지를 명확히 보여준다.
- [x] 기존 데모 스크립트를 다음 흐름으로 업데이트한다.

```text
1. 초기 상태에서 "장비 상태 목록" -> statusBooleanList render_surface
2. 초기 상태에서 "장비 목록" -> image template 없으면 text_fallback
3. Admin에서 image card template 저장
4. 같은 "장비 목록" 재요청 -> imageCardList render_surface
5. trace에서 strategy=derived_schema, score, mapping, rejected candidates 확인
```

### Phase 8. Verification

- [x] test runner를 추가하기로 결정한 경우 TypeScript matcher unit test를 추가한다. test runner를 추가하지 않으면 `src/server/a2ui-admin/schema-matcher`의 pure function fixture를 lint/build에서 검증 가능한 형태로 둔다.
- [x] Python derived schema unit test를 추가한다. Python test runner가 없으면 fixture script나 `pytest` 추가 여부를 먼저 결정한다.
- [x] `npm run lint`를 통과시킨다.
- [x] 구현이 TypeScript type surface를 바꾸면 `npm run build`까지 확인한다.
- [x] MCP 직접 호출로 `a2ui.recommendTemplate` derived_schema 결과를 확인한다.
- [x] Python `/chat/stream` 직접 호출로 candidates trace가 유지되는지 확인한다.
- [x] Next `/api/chat` 호출로 SSE `surface`와 `done`이 유지되는지 확인한다.
- [x] 브라우저에서 Admin 저장 전/후 같은 질문 결과가 달라지는지 확인한다.

## 9. 테스트 케이스

필수 케이스:

```text
equipment-status data
-> hasBooleans=true
-> equipment.statusBooleanList selected
-> strategy=derived_schema

equipment-catalog data + image template 미등록
-> hasImages=true
-> no registered image template
-> text_fallback

equipment-catalog data + image template 등록
-> hasImages=true
-> equipment.imageCardList selected
-> title=items[].name, image=items[].imageUrl mapping

equipment-status data + image template 등록
-> imageCardList rejected
-> rejectionReason includes missing hasImages or missing image slot

bounded preview 10 rows + original total 44
-> DerivedSchema.rowCount=44
-> minRows/maxRows 판단은 44 기준

unknown mapping sourcePath
-> mapping validator rejects candidate
-> next candidate or text_fallback
```

## 10. 이번 구현에서 하지 않을 것

- embedding semantic rerank는 하지 않는다.
- LLM Structured Outputs mapping은 하지 않는다.
- 공식 MCP SDK로 endpoint를 갈아엎지 않는다.
- renderer component 종류를 새로 늘리지 않는다.
- 장비 API 외 다른 domain을 동시에 붙이지 않는다.
- `schemaSpec`를 삭제하지 않는다.

## 11. 최종 성공 기준

- `a2ui.recommendTemplate`가 `schemaSpec` heuristic이 아니라 `DerivedSchema`와 template `inputSchema`를 기준으로 template을 선택한다.
- Python Agent가 raw 장비 API 응답 전체 대신 bounded preview와 derived schema를 MCP에 보낸다.
- Admin에서 image card template을 등록하면 같은 `equipment-catalog` data가 image card surface로 바뀐다.
- image field가 없는 data에서는 image card template이 reject된다.
- `rowCount`가 preview row 수가 아니라 원본 total 기준으로 보존된다.
- `strategy`, `score`, `mapping`, `candidate rejection reason`이 MCP 응답과 SSE trace에서 사라지지 않는다.
- 기존 `equipment.statusBooleanList` demo는 깨지지 않는다.

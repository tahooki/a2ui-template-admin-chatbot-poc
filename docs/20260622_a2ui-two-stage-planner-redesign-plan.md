# A2UI 2단계 판단/슬롯 생성 플래너 재설계 계획

작성일: 2026-06-22

## 1. 배경

현재 `AI Surface Planner`는 한 번의 LLM 응답 안에서 다음 일을 모두 처리한다.

```text
raw API data profile 확인
등록 template 후보 비교
selectedTemplateId 결정
candidateEvaluations 작성
fieldMappings 작성
slotMappings 작성
validator가 요구하는 JSON 형식 충족
```

이 구조에서는 실제 실패 원인이 섞인다.

예를 들어 LLM이 template 선택은 맞게 했어도 `candidateEvaluations.score` 형식을 잘못 주거나, slot mapping 중 일부를 누락하면 전체 plan이 실패한다. 반대로 slot mapping은 어느 정도 맞았는데 후보 평가표가 누락되어도 선택 자체가 실패한 것처럼 보인다.

또한 business API data는 A2UI가 제어할 수 없다. API column name, nesting, row shape, naming convention은 언제든 달라질 수 있다. 따라서 A2UI 서버가 API data를 "우리 규칙 안으로 들어오게" 강제하는 방향은 맞지 않다. A2UI는 raw API data를 있는 그대로 관찰하고, LLM 판단을 통해 template과 slot binding을 만들어야 한다.

## 2. 목표

목표는 planner를 다음 두 LLM 단계와 서버 후처리 단계로 나누는 것이다.

```text
Raw API data
  -> A2UI source profiler
  -> 1차 LLM: 템플릿 판단
  -> 2차 LLM: 선택된 템플릿의 슬롯 생성
  -> A2UI server: 최종 plan 조립, 검증, 적용
  -> A2UI renderer
```

핵심 원칙은 다음과 같다.

| 원칙 | 내용 |
| --- | --- |
| 1차 LLM은 선택만 한다 | `selectedTemplateId`와 선택 이유가 핵심이다. mapping을 만들지 않는다. |
| 1차 numeric score는 필수가 아니다 | score는 판단 이유를 정리하게 하는 보조 수단일 뿐, 통과 조건이 아니다. |
| 선택이 있으면 2차 LLM을 탄다 | 1차에서 등록 template 하나가 선택되면 그 template 하나만 대상으로 slot 생성한다. |
| 2차 LLM은 후보 비교를 하지 않는다 | 이미 선택된 template contract만 보고 `fieldMappings`, `slotMappings`를 만든다. |
| API data를 규칙화하지 않는다 | A2UI가 모르는 column name도 LLM mapper가 source profile을 보고 판단한다. |
| 서버는 판단하지 않고 검증/적용한다 | sourcePath 존재, slot 존재, transform 허용, required slot 충족을 deterministic하게 검증한다. |

## 3. 1차 LLM: 템플릿 판단

### 3.1 책임

1차 LLM의 책임은 오직 "어떤 registered A2UI template이 이 raw data와 user query에 가장 맞는가"를 판단하는 것이다.

1차 LLM이 하지 않는 일:

- `fieldMappings` 생성
- `slotMappings` 생성
- 실제 render payload 생성
- selected template 외 slot 판단
- validator용 mapping JSON 완성

### 3.2 입력

1차 입력은 비교 판단에 필요한 범위로 제한한다.

```text
userQuery
apiId
source shape
detected primary array path
rowCount
fieldPaths
source field summaries
sampleRows: 최대 3개
registered template summaries
selection rules
```

1차에서는 row를 최대 3개만 넣는다. 목적은 데이터 전체를 변환하는 것이 아니라 데이터 의미와 template 적합도를 판단하는 것이다.

### 3.3 출력

1차 출력은 작아야 한다.

```json
{
  "selectedTemplateId": "equipment.telemetryStatusTable",
  "reason": "상태 필드와 계측 수치 필드가 함께 있어 계측 상태 테이블이 가장 적합합니다.",
  "confidence": 0.86,
  "candidateNotes": [
    {
      "templateId": "equipment.telemetryStatusTable",
      "decision": "select",
      "reason": "metric/telemetry 필드를 여러 개 표시할 수 있습니다."
    },
    {
      "templateId": "equipment.statusBooleanList",
      "decision": "reject",
      "reason": "상태 플래그만 보여주면 수치 column을 잃습니다."
    }
  ]
}
```

필수 통과 조건은 다음 두 가지다.

```text
selectedTemplateId가 registered template 중 하나인가?
reason이 비어 있지 않은가?
```

`confidence`, `candidateNotes`, 후보별 score는 trace 품질을 올리는 보조 정보다. 이 값들이 없거나 숫자 형식이 조금 흔들린다고 1차 선택이 실패하면 안 된다.

### 3.4 1차 validation

1차 validation은 선택 자체만 검증한다.

| 검증 | 실패 시 |
| --- | --- |
| `selectedTemplateId`가 문자열인가 | 선택 실패 |
| `selectedTemplateId`가 registered template인가 | 선택 실패 |
| `reason`이 비어 있지 않은가 | 선택 실패 |
| api/template gate를 어기지 않는가 | 선택 실패 |

여기서는 required slot을 검증하지 않는다. required slot 검증은 2차 slot 생성 이후에만 의미가 있다.

## 4. 2차 LLM: 슬롯 생성

### 4.1 책임

2차 LLM의 책임은 선택된 template 하나의 inputSchema를 보고 raw source field를 slot에 연결하는 것이다.

2차 LLM이 하지 않는 일:

- 다른 template 후보 비교
- `selectedTemplateId` 변경
- candidate evaluation 작성
- 전체 raw data 변환

### 4.2 입력

2차 입력은 slot mapping에 필요한 범위로 더 좁힌다.

```text
selectedTemplateId
selected template inputSchema
selected template surfaceConfig
source fieldPaths
source field summaries
sampleRows: 1개
allowed transforms
allowed target fields
```

2차에서는 row sample을 1개만 넣는다. 목적은 값 전체를 처리하는 것이 아니라 field path와 slot binding을 결정하는 것이다.

row가 1000개여도 2차 LLM에는 1개만 들어간다. 최종 적용은 서버가 `fieldMappings`를 전체 render 대상 row에 반복 적용한다.

### 4.3 출력

2차 출력은 선택된 template의 mapping만 포함한다.

```json
{
  "fieldMappings": [
    {
      "targetField": "name",
      "sourcePath": "items[].eqp_nm",
      "transform": "copy",
      "reason": "장비 표시명입니다."
    },
    {
      "targetField": "isRunning",
      "sourcePath": "items[].run_state_yn",
      "transform": "boolean_code",
      "trueValues": ["Y"],
      "falseValues": ["N"],
      "reason": "가동 상태 플래그입니다."
    }
  ],
  "slotMappings": [
    {
      "templateId": "equipment.telemetryStatusTable",
      "slot": "items[].title",
      "sourcePath": "items[].eqp_nm",
      "targetField": "name",
      "transform": "copy",
      "reason": "title slot에 장비명을 연결합니다."
    },
    {
      "templateId": "equipment.telemetryStatusTable",
      "slot": "items[].metrics",
      "sourcePath": "items[].sensor_temp_avg",
      "targetField": "sensor_temp_avg",
      "transform": "copy",
      "reason": "계측 수치 metric입니다."
    }
  ]
}
```

2차에서 `selectedTemplateId`를 다시 고르지 않는다. template id는 서버가 1차 결과에서 주입한다.

### 4.4 2차 validation

2차 validation은 mapping 품질을 검증한다.

| 검증 | 실패 메시지 방향 |
| --- | --- |
| 모든 `sourcePath`가 실제 source fieldPaths에 있는가 | 없는 field를 지어낸 mapping |
| 모든 `slot`이 selected template inputSchema에 존재하는가 | 선택 template에 없는 slot |
| `templateId`가 selectedTemplateId와 같은가 | 다른 template slot 혼입 |
| `transform`이 allowedTransforms 중 하나인가 | 지원하지 않는 변환 |
| required slot minCount를 충족하는가 | 필수 slot 누락 |
| telemetry template이면 metric slot에 concrete numeric field가 충분한가 | metric slot 부족 |
| slot source가 fieldMappings에 의해 뒷받침되는가 | slot과 field mapping 불일치 |

여기서 실패하면 correction retry를 하더라도 2차 mapper만 다시 호출한다. 1차 template 선택을 다시 흔들지 않는다.

## 5. 서버 후처리: Assembler

서버는 1차와 2차 결과를 합쳐 최종 `AIPlannerPlan`을 만든다.

```ts
type AssembledPlan = {
  selectedTemplateId: selector.selectedTemplateId;
  confidence: selector.confidence ?? defaultConfidence;
  reason: selector.reason;
  primaryArrayPath: extracted.arrayPath ?? "items";
  fieldMappings: mapper.fieldMappings;
  slotMappings: mapper.slotMappings;
  candidateEvaluations: serverBuiltCandidateEvaluations;
};
```

`candidateEvaluations`는 더 이상 1차 LLM이 validator를 통과하기 위해 완벽히 작성해야 하는 필드가 아니다. 서버가 selector의 선택 결과와 `candidateNotes`를 바탕으로 trace용 candidate list를 조립한다.

조립 규칙:

```text
registered template 전체를 1번씩 포함한다.
selectedTemplateId와 같은 template만 decision=select로 둔다.
나머지는 decision=reject로 둔다.
reason은 selector candidateNotes가 있으면 사용하고, 없으면 기본 문구를 사용한다.
score는 있으면 표시용으로만 사용하고, 없으면 선택/비선택 기본값을 사용한다.
```

이렇게 하면 최종 validator가 요구하는 "후보가 정확히 한 번씩 있고 selected candidate가 하나"라는 구조는 서버가 보장한다.

## 6. 최종 validation

최종 validation은 기존 `validatePlan(...)`의 방향을 유지하되, 책임을 두 층으로 나눈다.

```text
validateTemplateSelection(selectorResult)
validateSlotMapping(mapperResult, selectedTemplate)
validateAssembledPlan(finalPlan)
```

최종 render 전에 반드시 `validateAssembledPlan`을 통과해야 한다.

중요한 점:

- 1차 실패는 "template 판단 실패"다.
- 2차 실패는 "slot 생성 실패"다.
- 사용자/trace 화면에서도 이 둘을 구분해서 보여준다.

## 7. retry 정책

현재처럼 전체 planner를 다시 호출하면 선택과 mapping이 동시에 흔들릴 수 있다. 새 구조에서는 retry 대상도 분리한다.

| 실패 위치 | retry 대상 |
| --- | --- |
| 1차 JSON parse 실패 | 1차 selector 재시도 |
| 1차 selectedTemplateId 없음 | 1차 selector 재시도 |
| 1차 selectedTemplateId가 미등록 template | 1차 selector 재시도 |
| 2차 JSON parse 실패 | 2차 mapper 재시도 |
| 2차 required slot 누락 | 같은 selectedTemplateId로 2차 mapper correction |
| 2차 sourcePath hallucination | 같은 selectedTemplateId로 2차 mapper correction |
| 최종 apply 실패 | fallback, 서버 로그 |

2차 실패 때문에 1차 선택을 자동으로 바꾸지 않는다. 정말 template 자체가 잘못 선택된 것으로 판단하려면 별도 "selector correction"을 명시적으로 호출한다.

## 8. sequence board 변경

현재 sequence board에는 다음 두 단계가 있다.

```text
A2UI Agent -> A2UI Planner LLM: AI Surface Planner
A2UI Planner LLM -> A2UI Agent: Return surface plan
```

이 표현은 한 번의 AI가 판단과 mapping을 모두 끝낸다는 오해를 만든다. 다음 네 단계로 나눈다.

| Step id | From | To | Label | 의미 |
| --- | --- | --- | --- | --- |
| `template-judgement` | A2UI Agent | A2UI Planner LLM | `템플릿 판단 요청` | source profile과 registered template으로 화면 종류를 고른다. |
| `template-judgement-result` | A2UI Planner LLM | A2UI Agent | `판단 결과 반환` | `selectedTemplateId`, `reason`을 반환한다. |
| `slot-generation` | A2UI Agent | A2UI Planner LLM | `슬롯 생성 요청` | 선택된 template 하나의 inputSchema만 보고 slot mapping을 만든다. |
| `slot-generation-result` | A2UI Planner LLM | A2UI Agent | `슬롯 생성 결과 반환` | `fieldMappings`, `slotMappings`를 반환한다. |

이후 단계는 유지한다.

```text
A2UI Agent -> A2UI Agent: 슬롯 검증
A2UI Agent -> A2UI Agent: 데이터 / 슬롯 맵핑
```

표시 문구도 바꾼다.

| 현재 | 변경 |
| --- | --- |
| `AI Surface Planner` | `템플릿 판단 요청` |
| `Return surface plan` | `판단 결과 반환` |
| 없음 | `슬롯 생성 요청` |
| 없음 | `슬롯 생성 결과 반환` |
| `Validate AI plan` | `슬롯 검증` |

상세 popup도 둘로 분리한다.

| Detail | 보여줄 내용 |
| --- | --- |
| 템플릿 판단 | selector input, selectedTemplateId, reason, candidateNotes |
| 슬롯 생성 | mapper input, selected template inputSchema, fieldMappings, slotMappings, validation errors |

## 9. 구현 계획

### 9.1 타입 분리

대상 파일:

```text
src/server/a2ui-admin/a2ui-ai-surface-planner.ts
```

추가 타입:

```ts
type TemplateSelectionResult = {
  selectedTemplateId?: string;
  reason?: string;
  confidence?: number;
  candidateNotes?: TemplateCandidateNote[];
};

type SlotMappingResult = {
  fieldMappings?: PlannerFieldMapping[];
  slotMappings?: PlannerSlotMapping[];
  reason?: string;
};
```

기존 `AIPlannerPlan`은 최종 assembled plan으로 유지한다.

### 9.2 prompt/schema 분리

기존:

```text
buildPrompt()
plannerResponseFormatFor()
requestAIPlan()
```

변경:

```text
buildTemplateSelectionPrompt()
templateSelectionResponseFormatFor()
requestTemplateSelection()

buildSlotMappingPrompt()
slotMappingResponseFormatFor()
requestSlotMapping()

assemblePlanFromSelectionAndMapping()
```

1차 response schema는 작게 만든다.

필수:

```text
selectedTemplateId
reason
```

2차 response schema는 mapping만 받는다.

필수:

```text
fieldMappings
slotMappings
```

### 9.3 공통 LLM 호출 helper

HTTP 호출, attempt trace, content parse, json_schema/json_object fallback은 중복되면 안 된다.

공통 helper를 둔다.

```ts
requestPlannerJson<T>({
  stage: "template_selection" | "slot_mapping";
  prompt;
  responseFormat;
  systemPrompt;
  correction?;
}): Promise<PlannerJsonRequestResult<T>>
```

attempt trace에는 stage를 남긴다.

```text
stage=template_selection
stage=slot_mapping
requestKind=initial|correction
maxTokens=6000
outcome=success|...
```

### 9.4 main pipeline 교체

기존:

```text
requestAIPlan(prompt)
normalizeAIPlan(plan)
validatePlan(plan)
retry whole plan
applyPlan(plan)
```

변경:

```text
selection = requestTemplateSelection(selectionPrompt)
validateTemplateSelection(selection)

mapping = requestSlotMapping(mappingPrompt, selection.selectedTemplateId)
normalizeAIPlanMapping(mapping)
plan = assemblePlan(selection, mapping)
validatePlan(plan)

if mapping validation fails:
  requestSlotMappingCorrection(...)
  assemble + validate again

applyPlan(plan)
```

### 9.5 fallback/repair 정책 정리

기존 source-schema repair는 "LLM이 plan 전체를 못 만들었을 때 mockPlan으로 복구"하는 성격이다. 새 구조에서는 repair 이름과 위치를 바꾼다.

권장:

```text
1차 selector가 인증/키 오류가 아닌 이유로 비었고 mock mode가 아니면
  source profile 기반 repair selection은 쓰지 않는다.
  template 선택 실패로 fallback한다.

2차 mapper가 인증/키 오류가 아닌 이유로 비었고 selectedTemplateId가 있으면
  source-schema repair mapper를 보조로 사용할 수 있다.
  단, repair 결과도 validatePlan 통과 시에만 사용한다.
```

즉 실제 선택은 가능한 한 LLM 판단으로 유지하고, repair는 선택된 template의 slot 생성 실패를 보완하는 안전장치로만 둔다.

### 9.6 progress event 변경

서버 progress event:

```text
matcher: mode=template_selection, label=템플릿 판단 요청
matcher: mode=template_selected, templateId, reason
matcher: mode=slot_mapping, templateId
matcher: mode=slot_mapping_ready, fieldMappingCount, slotMappingCount
plan_validation: 슬롯 검증
mapping_applied: 데이터 / 슬롯 맵핑
```

기존 UI가 `state:matcher_request`, `state:ai_surface_plan`을 쓰고 있으므로, 호환을 위해 event 이름은 점진적으로 바꾼다.

권장 호환 방식:

```text
state:matcher_request -> 1차 판단 요청으로 유지 가능
state:ai_surface_plan -> 1차 판단 결과로 의미 변경
state:slot_mapping_request -> 신규
state:slot_mapping_plan -> 신규
```

### 9.7 sequence board 변경

대상 파일:

```text
src/features/a2ui-template-poc/sequence-board.tsx
```

변경 항목:

1. 기존 `matcher` step label을 `템플릿 판단 요청`으로 변경한다.
2. 기존 `matcher-result` step label을 `판단 결과 반환`으로 변경한다.
3. `slot-generation` step을 추가한다.
4. `slot-generation-result` step을 추가한다.
5. `plan-validation` label을 `슬롯 검증`으로 변경한다.
6. detail view의 제목 `화면 조건 비교`를 `템플릿 판단`과 `슬롯 생성` detail로 분리한다.

## 10. 검증 계획

### 10.1 단위 검증

```text
selector result validation
slot mapping result validation
assembler candidateEvaluations generation
```

특히 selector는 score 없이도 통과해야 한다.

### 10.2 기존 명령

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run e2e:data-boundary
```

### 10.3 fake LLM 검증

fake LLM으로 다음 상황을 확인한다.

| 케이스 | 기대 |
| --- | --- |
| 1차가 selectedTemplateId + reason만 반환 | 2차 mapper 호출 |
| 1차가 score 없이 반환 | selector 통과 |
| 1차가 mapping을 반환하지 않음 | 정상 |
| 2차가 selectedTemplateId를 반환하지 않음 | 정상 |
| 2차가 fieldMappings/slotMappings 반환 | assembled plan 검증 |
| 2차가 required slot 누락 | mapper correction 또는 validation 실패 |
| 2차가 없는 sourcePath 반환 | validation 실패 |

### 10.4 시나리오 기대값

| 사용자 요청 | 1차 선택 | 2차 slot 생성 |
| --- | --- | --- |
| 상태 목록 | 상태 목록 template | title/statusFlags |
| 장비 목록 | image card template | title/image/description |
| 컬럼 많은 상태 | telemetry status table | title/statusFlags/metrics |
| 데이터 많은 상태 | telemetry status table 또는 상태 template, 데이터 의미 기준 | selected template required slots |

`데이터 많은 상태`는 row 수 자체가 template 선택 이유가 되면 안 된다. 1차 selector는 row count를 참고하되, 실제 field 의미와 template contract 적합도를 이유로 선택해야 한다.

## 11. 완료 기준

- 1차 LLM output에 `fieldMappings`, `slotMappings`, score가 없어도 selectedTemplateId와 reason만 있으면 2차로 진행한다.
- 2차 LLM은 선택된 template 하나만 보고 mapping을 만든다.
- 최종 validator 실패 메시지가 "선택 실패"와 "슬롯 생성 실패"를 구분한다.
- Sequence board에서 `AI Surface Planner` 단일 단계가 사라지고 `템플릿 판단` / `슬롯 생성` 두 단계가 보인다.
- wide/large API에서 planner attempt trace가 1차와 2차를 분리해서 보여준다.
- 기존 data-boundary E2E가 통과한다.

## 12. 구현 완료 메모

구현일: 2026-06-22

완료된 변경:

- `AI Surface Planner`를 `template_selection`과 `slot_mapping` 두 LLM 단계로 분리했다.
- 1차 selector validation은 `selectedTemplateId`, `reason`, registered template 여부만 판단한다.
- 2차 mapper validation은 선택된 template의 `fieldMappings`, `slotMappings`, required slot 충족 여부를 판단한다.
- 최종 `candidateEvaluations`는 서버 assembler가 1차 선택 결과와 `candidateNotes`로 생성한다.
- 2차 mapper correction은 같은 selected template 안에서만 재시도한다.
- sequence board는 `템플릿 판단 요청/판단 결과 반환/슬롯 생성 요청/슬롯 생성 결과 반환/슬롯 검증`으로 분리했다.
- wide-column prompt는 중요한 field path를 우선 선택하도록 바꾸고, sample row는 prompt field path에 포함된 값만 보내도록 줄였다.
- LLM user prompt JSON을 중간에서 잘라 깨진 JSON으로 보내던 동작을 제거했다. 길이 초과 시에도 full valid JSON을 보낸다.

검증 결과:

```text
npx tsc --noEmit: 통과
npm run lint: 통과, 기존 <img> warning 1개만 유지
npm run build: 통과
A2UI_AI_SURFACE_PLANNER_MOCK=1 npm run e2e:data-boundary: 통과
fake two-stage LLM npm run e2e:data-boundary: 통과
A2UI_AI_SURFACE_PLANNER_MOCK=1 npm run e2e:sequence: 통과
```

fake two-stage LLM 검증에서는 1차가 `selectedTemplateId + reason`만 반환하고, 2차가 `fieldMappings + slotMappings`만 반환해도 status/wide/large/alias 시나리오가 모두 A2UI surface로 렌더링되는 것을 확인했다.

wide-column fake LLM 요청 길이는 field path 우선순위 축소 후 다음 수준으로 내려갔다.

```text
template_selection: fields=40, samples=3, contentLength=28090
slot_mapping: fields=40, samples=1, contentLength=23217
```

## 13. 문서 기준 검수 보강

검수일: 2026-06-22

문서 기준으로 다시 확인하며 다음 보강을 반영했다.

- 1차 `candidateNotes`는 trace 보조값이므로 response schema에서 item 내부 필드까지 강제하지 않도록 낮췄다. 1차 통과 기준은 계속 `selectedTemplateId`, `reason`이다.
- 2차 `slotMappings[].templateId`는 LLM이 다시 선택하는 값이 아니므로 필수 응답 필드에서 제외했다.
- 2차 mapper가 `slotMappings[].templateId`를 생략하면 서버 assembler가 1차 `selectedTemplateId`를 주입한다.
- 2차 mapper가 다른 template id를 명시하면 기존 검증/정리 경로에서 selected template slot plan으로 수렴하거나 validation 실패로 남는다.

이 보강으로 `2차가 selectedTemplateId를 반환하지 않음` 케이스도 문서 의도대로 정상 경로가 된다.

## 14. Sequence E2E 검증 보강

검증일: 2026-06-22

`scripts/e2e-a2ui-sequence.mjs`를 추가해 `/api/a2a/message:stream`에서 나오는 실제 progress event 순서를 검증했다.

검증하는 순서:

```text
A2UI 레지스트리
-> A2UI 레지스트리
-> 비교용 데이터 생성 요청
-> 비교용 데이터 생성 결과 반환
-> 템플릿 판단 요청
-> 판단 결과 반환
-> 슬롯 생성 요청
-> 슬롯 생성 결과 반환
-> 슬롯 검증
-> 데이터 / 슬롯 맵핑
```

검증 범위:

- 상태 목록: `equipment.statusBooleanList`
- 컬럼 많은 상태: `equipment.telemetryStatusTable`
- 데이터 많은 상태: `equipment.telemetryStatusTable`

추가로 최종 surface trace에 `planner:template_selection`, `planner:slot_mapping`이 포함되고, decision trace에 `templateSelection`, `slotMapping`, 통과한 validation이 있는지도 함께 확인한다.

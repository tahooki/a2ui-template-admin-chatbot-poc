# A2UI 핵심 증거 라벨 및 팝업 기획

작성일: 2026-06-21

## 목적

이 문서는 시퀀스 다이어그램 위에 별도 증거 라벨을 추가해서 A2UI 핵심 로직을 고객이 확인할 수 있게 만드는 기획이다.

기존 시퀀스 step 라벨은 흐름을 보여주는 역할만 한다. step 라벨은 클릭하지 않는다.

대신 A2UI 판단에서 가장 중요한 두 지점에 별도 라벨을 띄우고, 그 라벨을 클릭하면 비교 리포트 형태의 팝업을 연다.

추가할 라벨은 두 개다.

1. `비교용 데이터로 변환`
2. `화면 조건 비교`

## 오늘 변경된 흐름 기준

현재 시퀀스는 실제 렌더 흐름에 맞춰 핵심 경로만 남긴 상태다.

```text
Open chat stream
Classify data request
Select and call business API
Source data for compare
Invoke a2ui_render boundary
POST /api/a2a/message:send
Build A2UI source preview
Load template contracts
Template contracts loaded
AI Surface Planner
Validate AI plan
Apply field/slot mapping
Return trace + surface artifact
Return A2UIRenderToolResult
Return selected A2UI surface
```

중요한 변경점은 다음과 같다.

- `response_open`은 독립 step이 아니라 `Open chat stream`에 흡수한다.
- `state:planning`은 독립 step이 아니라 `Classify data request`에 흡수한다.
- 표시 step과 매칭되지 않는 이벤트는 시퀀스 표시 시간을 소비하지 않는다.
- `Load template contracts`와 `Template contracts loaded`는 요청과 응답으로 분리한다.
- A2UI 내부 판단은 `source preview -> template contracts -> AI planner -> validation -> mapping applied` 순서로 보여준다.
- 채팅창의 A2UI surface는 시퀀스의 `Return selected A2UI surface` 시점에 맞춰 표시한다.

## 라벨 설계 원칙

증거 라벨은 시퀀스 step 자체가 아니다.

시퀀스 step은 "어떤 작업이 진행되는지"를 보여주고, 증거 라벨은 "그 작업에서 어떤 판단 근거가 생겼는지"를 보여준다.

### 표시 규칙

- 증거 데이터가 준비되기 전에는 라벨을 보이지 않는다.
- 라벨은 관련 step 근처에 작게 표시한다.
- 라벨 클릭 시 팝업을 연다.
- 팝업은 개발 로그가 아니라 고객이 읽는 비교 리포트처럼 구성한다.
- step 라벨 클릭은 비활성화한다.
- 라벨에는 `observed`, `trace`, `transport` 같은 evidence badge를 작게 표시할 수 있다.

### 데이터 출처 우선순위

팝업은 실제 실행 데이터와 샘플 trace를 섞어서 실제처럼 보이게 만들면 안 된다.

데이터 출처 우선순위는 다음과 같다.

1. 현재 turn의 live event data
2. A2UI가 반환한 artifact/trace에서 파생된 data
3. 사용자가 DB Table이나 demo scenario를 보고 있을 때의 deterministic `dataBoundaryTrace`

live 실행 중 필요한 값이 없으면 deterministic trace를 몰래 끼워 넣지 않는다. 대신 실제 live event에 있는 row 수, shape, field 수처럼 확인 가능한 값만 표시한다.

### 라벨을 두 개로 줄이는 이유

기존 문서의 5개 라벨은 다음처럼 축약한다.

| 기존 라벨 | 새 구조 |
| --- | --- |
| 실제 API 데이터 | `비교용 데이터로 변환` 팝업의 원본 입력 영역에 포함 |
| 비교용 데이터로 변환 | 유지 |
| 화면 조건 비교 | 유지 |
| 화면 값 연결 | `화면 조건 비교` 팝업의 매핑 결과 영역에 포함 |
| 선택된 화면 | `화면 조건 비교` 팝업의 최종 선택 영역에 포함 |

이렇게 하면 라벨 수는 줄지만, A2UI 핵심 설명은 유지된다.

```text
API 데이터가 A2UI가 읽을 수 있는 비교 입력으로 바뀐다.
그 비교 입력과 템플릿 contracts를 AI가 비교해서 화면을 선택하고 값을 연결한다.
```

## 라벨 1. 비교용 데이터로 변환

### 위치

시퀀스 위치:

- `POST /api/a2a/message:send` 이후
- `Build A2UI source preview` 근처

기준 step:

- `a2ui-source-preview`

기준 이벤트:

- `state:source_preview`
- `state:profile`

live 이벤트에서는 주로 `state:profile`이 들어오고, demo trace에서는 `state:source_preview`가 들어올 수 있다. 두 이벤트는 같은 증거 라벨에 매핑한다.

### 라벨 문구

주 라벨:

`비교용 데이터로 변환`

보조 문구:

`필드 N개 · 샘플 M/N건`

예시:

`필드 18개 · 샘플 6/6건`

### 라벨이 보여주는 의미

이 라벨은 원본 API 응답이 A2UI의 AI planner가 읽을 수 있는 입력으로 정리된 시점을 보여준다.

여기서 선택이 일어나는 것은 아니다. 이 단계는 비교를 위한 입력 생성 단계다.

### 팝업 제목

`비교용 데이터로 변환`

### 팝업 목적

원본 API 데이터가 A2UI 비교용 입력으로 어떻게 바뀌었는지 최소 정보만 보여준다.

고객이 확인해야 하는 질문은 다음이다.

- input API 데이터 값은 무엇인가?
- output 비교용 데이터 값은 무엇인가?

### 팝업 구성

#### 최소 구성

| 영역 | 표시값 |
| --- | --- |
| Input JSON: API 데이터 | source, shape, rowCount, fieldCount, sampleRows |
| Output JSON: 비교용 데이터 | sourcePreview.shape, sourcePreview.arrayPath, sourcePreview.rowCount, sourcePreview.sampledRows, sourcePreview.fieldPaths |

이 팝업에서는 metrics card, mapping table, 후보 판단 리스트를 보여주지 않는다. 대신 input/output을 JSON으로 자세히 보여준다.

### 필요한 데이터

현재 trace와 이벤트에서 우선 사용할 값:

- `sourceShape`
- `sourceArrayPath`
- `rowCount` 또는 `sourceRowCount`
- `sourceFieldCount` 또는 `sourceFieldPaths`
- `previewSampleSize`
- `previewRowCount`

주의:

- live event에 원본 row preview가 없으면 원본 샘플 영역을 만들지 않는다.
- deterministic `dataBoundaryTrace`는 demo scenario 설명에는 사용할 수 있지만, live 실행의 실제 API 증거처럼 표시하지 않는다.

## 라벨 2. 화면 조건 비교

### 위치

시퀀스 위치:

- `Template contracts loaded` 이후
- `AI Surface Planner`, `Validate AI plan`, `Apply field/slot mapping` 묶음 근처

기준 step:

- `matcher`
- `plan-validation`
- `mapping-applied`

기준 이벤트:

- `state:ai_surface_plan`
- `state:matcher`
- `state:plan_validation`
- `state:mapping_applied`

`state:ai_surface_plan`과 `state:matcher`는 선택 판단을 여는 기준 이벤트다. `state:plan_validation`과 `state:mapping_applied`는 같은 팝업 안의 추가 섹션을 채우는 후속 evidence로 취급한다.

### 라벨 문구

주 라벨:

`화면 조건 비교`

보조 문구:

`선택 {score} · 후보 {candidateCount}개`

예시:

`선택 0.95 · 후보 2개`

### 라벨이 보여주는 의미

이 라벨은 A2UI가 비교용 데이터와 등록된 템플릿 contracts를 비교해서 어떤 화면을 선택했는지 보여준다.

이 팝업 안에서는 AI에게 들어가기 전 입력값, AI 출력값, 후보 선택/미선택만 보여준다.

### 팝업 제목

`화면 조건 비교`

### 팝업 목적

사용자가 "AI가 어떤 입력으로 어떤 화면을 선택했는지"만 빠르게 확인할 수 있게 한다.

고객이 확인해야 하는 질문은 다음이다.

- AI에게 들어간 비교 입력값은 무엇인가?
- AI 출력값으로 어떤 템플릿이 선택되었는가?
- 어떤 후보가 선택됐고, 어떤 후보가 선택되지 않았는가?

### 팝업 구성

#### 최소 구성

| 영역 | 표시값 |
| --- | --- |
| Input JSON: AI 비교 입력값 | sourcePreview, templateCandidates |
| Output JSON: AI 선택 결과 | selectedTemplateId, score, candidates[].decision |

이 팝업에서는 validation 세부 항목, mapping table, 긴 reason 문장을 기본 표시하지 않는다. 선택/미선택 여부는 output JSON의 `candidates[].decision`에 `selected` 또는 `not_selected`로 표시한다.

### 필요한 데이터

현재 trace와 이벤트에서 우선 사용할 값:

- profile event의 `rowCount`, `sourceFieldCount`, `sourceFieldPaths`
- matcher event의 `candidates`
- matcher/result event의 `templateId`
- matcher/result event의 `score`

## 라벨 위치 상세

### 비교용 데이터로 변환

권장 위치:

- `Build A2UI source preview` 라벨의 오른쪽 또는 아래쪽
- A2UI Agent lane 안쪽
- self-loop 선을 가리지 않는 위치

등장 조건:

```text
events 중 state:source_preview 또는 state:profile이 있고,
live event data 또는 A2UI 반환 trace에서 sourceFieldPaths를 확인할 수 있을 때
```

demo/idle 상태에서는 deterministic `dataBoundaryTrace`로 같은 라벨 preview를 보여줄 수 있다.

### 화면 조건 비교

권장 위치:

- `AI Surface Planner`와 `Validate AI plan` 사이
- 또는 `AI Surface Planner` 라벨 오른쪽
- A2UI Agent lane 안쪽

등장 조건:

```text
events 중 state:ai_surface_plan 또는 state:matcher가 있고,
renderPlan.selectedComponentId와 score를 확인할 수 있을 때
```

라벨 자체는 `state:ai_surface_plan` 또는 `state:matcher`가 도착했을 때 표시한다. 이후 score/candidates가 도착하면 열린 팝업 내용을 갱신한다.

## 상호작용 정책

### step 라벨

- 클릭 불가
- hover tooltip 정도만 허용
- 흐름 이름과 이벤트 evidence badge만 표시

### 증거 라벨

- 클릭 가능
- hover 시 짧은 설명 표시
- 선택 시 팝업 열림
- 팝업이 열려도 시퀀스 자동 진행은 멈추지 않는다.
- 사용자가 팝업 내부를 스크롤하거나 닫을 수 있어야 한다.

### 카메라 동작

오늘 수정된 카메라 기준을 유지한다.

- active step과 camera target은 같은 시점에 맞춘다.
- 화면에 없는 이벤트는 카메라 시간을 소비하지 않는다.
- 같은 step에 묶인 이벤트는 같은 프레임으로 표시한다.
- surface 렌더링은 `Return selected A2UI surface` 시점에 맞춘다.

증거 라벨은 카메라 타깃이 아니다. 라벨 때문에 카메라가 별도로 이동하면 핵심 시퀀스가 흔들린다.

## 구현 체크리스트

1. step 라벨 클릭 제거
   - `clickableStepIds` 기반 step 버튼 인터랙션 제거 또는 비활성화
   - step 라벨은 흐름 표시 전용으로 유지

2. 증거 라벨 컴포넌트 추가
   - `EvidenceLabel` 또는 `SequenceEvidenceLabel`
   - 위치는 anchor step의 `labelPosition`과 `messageLineStyle` 기준으로 계산
   - `data-evidence-label="source-preview"` / `data-evidence-label="template-comparison"` 같은 안정 속성 추가

3. 증거 라벨 표시 조건 추가
   - `비교용 데이터로 변환`: `a2ui-source-preview` 완료 후
   - `화면 조건 비교`: `matcher` 완료 후

4. 팝업 view model 추가
   - `sourcePreviewEvidenceView(trace, events)`
   - `templateComparisonEvidenceView(trace, events)`
   - 기존 step detail view model은 데이터 포맷 참고용으로만 사용하고, trigger는 증거 라벨에서만 발생시킨다.

5. live trace와 demo trace 모두 지원
   - live event data가 충분하면 live data 우선
   - A2UI 반환 artifact의 trace-derived data를 두 번째 우선순위로 사용
   - deterministic `dataBoundaryTrace`는 demo/idle 표시 또는 scenario가 명확히 일치하는 경우에만 사용
   - 팝업에는 어떤 데이터가 live, trace-derived, sample인지 badge로 표시

6. 브라우저 검증
   - `컬럼 많은 상태`
   - `데이터 많은 상태`
   - 두 시나리오에서 라벨 등장 위치 확인
   - step 라벨 클릭 불가 확인
   - 증거 라벨 클릭 시 팝업 내용 확인
   - surface가 마지막 시점에 표시되는지 확인

## 최종 메시지

이 변경 후 POC가 보여줘야 하는 메시지는 다음이다.

`A2UI는 API 데이터를 비교용 입력값으로 바꾸고, AI는 그 입력값과 등록된 템플릿 후보를 비교해서 선택 결과를 낸다.`

두 개의 증거 라벨은 이 메시지를 각각 다음처럼 나눠 보여준다.

| 라벨 | 보여주는 핵심 |
| --- | --- |
| 비교용 데이터로 변환 | API 데이터가 A2UI 판단 입력으로 바뀌는 과정 |
| 화면 조건 비교 | AI 입력값, AI 출력값, 선택됨/선택 안 됨 |
